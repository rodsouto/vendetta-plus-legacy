import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile, rm, rename } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const trace = vi.hoisted(() => ({ events: [] as string[], fail: "", directorySyncs: 0 }));
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return {
    ...fs,
    rename: vi.fn(fs.rename),
    rm: vi.fn(fs.rm),
    open: vi.fn(async (...args: Parameters<typeof fs.open>) => {
      const handle = await fs.open(...args);
      const path = String(args[0]);
      const label = path.includes(".tmp-") ? "temporary" : "directory";
      return {
        writeFile: async (data: string) => {
          trace.events.push("write:" + label);
          await handle.writeFile(data);
        },
        close: async () => {
          trace.events.push("close:" + label);
          await handle.close();
        },
        sync: async () => {
          trace.events.push("sync:" + label);
          if (label === "directory") trace.directorySyncs++;
          if (trace.fail === label || (trace.fail === "deletion" && trace.directorySyncs === 2))
            throw new Error("injected fsync failure");
          await handle.sync();
        },
      };
    }),
  };
});
import { keeperTransactions } from "../scripts/keeper/transactions.js";
import { recoverTransaction } from "../scripts/prover/recovery.js";
let dir: string, file: string;
beforeEach(async () => {
  trace.events = [];
  trace.fail = "";
  trace.directorySyncs = 0;
  dir = await mkdtemp(join(tmpdir(), "vendetta-durable-"));
  file = join(dir, "journal.json");
});
afterEach(async () => {
  trace.fail = "";
  await rm(dir, { recursive: true, force: true });
});
const raw = "0x1234" as const;
const beforeSend = [
  "write:temporary",
  "sync:temporary",
  "close:temporary",
  "sync:directory",
  "close:directory",
];
it("syncs signed bytes and directory before broadcasting and syncs settled deletion", async () => {
  let published: unknown;
  await recoverTransaction(file, {
    prepare: async () => raw,
    broadcast: async () => {
      trace.events.push("broadcast");
      published = JSON.parse(await readFile(file, "utf8"));
    },
    receipt: async () => "success",
  });
  expect(published).toBe(raw);
  expect(trace.events).toEqual([...beforeSend, "broadcast", "sync:directory", "close:directory"]);
});
it.each(["temporary", "directory"])(
  "never broadcasts after %s sync failure and republishes bytes on retry",
  async (stage) => {
    trace.fail = stage;
    const prepare = vi.fn(async () => raw),
      broadcast = vi.fn(async () => {});
    await expect(
      recoverTransaction(file, { prepare, broadcast, receipt: async () => "success" }),
    ).rejects.toThrow("fsync failure");
    expect(broadcast).not.toHaveBeenCalled();
    expect(trace.events.at(-1)).toBe("close:" + stage);
    trace.fail = "";
    trace.events = [];
    await recoverTransaction(file, {
      prepare,
      broadcast: async () => {
        expect(trace.events).toEqual(beforeSend);
        await broadcast();
      },
      receipt: async () => "success",
    });
    expect(prepare).toHaveBeenCalledTimes(stage === "temporary" ? 2 : 1);
    expect(broadcast).toHaveBeenCalledOnce();
  },
);
it("republishes an existing journal without preparing and preserves it when sync fails", async () => {
  await writeFile(file, JSON.stringify(raw));
  trace.fail = "directory";
  const prepare = vi.fn(async () => raw),
    broadcast = vi.fn(async () => {});
  await expect(
    recoverTransaction(file, { prepare, broadcast, receipt: async () => "success" }),
  ).rejects.toThrow("fsync failure");
  expect(trace.events).toEqual(beforeSend);
  expect(prepare).not.toHaveBeenCalled();
  expect(broadcast).not.toHaveBeenCalled();
  expect(JSON.parse(await readFile(file, "utf8"))).toBe(raw);
});
it("does not broadcast if publication rename fails", async () => {
  vi.mocked(rename).mockRejectedValueOnce(new Error("injected rename failure"));
  const broadcast = vi.fn(async () => {});
  await expect(
    recoverTransaction(file, {
      prepare: async () => raw,
      broadcast,
      receipt: async () => "success",
    }),
  ).rejects.toThrow("rename failure");
  expect(broadcast).not.toHaveBeenCalled();
});
it.each(["success", "reverted"] as const)(
  "preserves the settled %s status when deletion sync fails",
  async (status) => {
    trace.fail = "deletion";
    await expect(
      recoverTransaction(file, {
        prepare: async () => raw,
        broadcast: async () => {},
        receipt: async () => status,
      }),
    ).rejects.toMatchObject({
      transactionStatus: status,
      message: expect.stringContaining("transaction " + status),
    });
  },
);

it.each(["success", "reverted"] as const)(
  "preserves settled %s on unlink failure",
  async (status) => {
    vi.mocked(rm).mockRejectedValueOnce(new Error("injected unlink failure"));
    await expect(
      recoverTransaction(file, {
        prepare: async () => raw,
        broadcast: async () => {},
        receipt: async () => status,
      }),
    ).rejects.toMatchObject({ transactionStatus: status });
    expect(JSON.parse(await readFile(file, "utf8"))).toBe(raw);
  },
);
it("keeper rechecks chain state after a settled deletion-sync error before signing again", async () => {
  let completed = false;
  const prepare = vi.fn(async () => raw);
  const keeper = keeperTransactions(file, {
    prepare,
    simulate: async () => {
      if (completed) throw new Error("already completed on chain");
    },
    broadcast: async () => {},
    receipt: async () => {
      completed = true;
      return "success";
    },
  });
  trace.fail = "deletion";
  const action = { functionName: "completeMission", args: [] };
  await expect(keeper.send(action)).rejects.toMatchObject({ transactionStatus: "success" });
  trace.fail = "";
  await expect(keeper.send(action)).rejects.toThrow("already completed on chain");
  expect(prepare).toHaveBeenCalledOnce();
});
