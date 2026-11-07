import { expect, it, vi } from "vitest";
import { prepareSignedTransaction } from "../scripts/prover/signing.js";
import { keeperTransactions } from "../scripts/keeper/transactions.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

it.each(["before-prepare", "before-sign", "after-sign"])(
  "stops %s without publishing or broadcasting new bytes",
  async (stage) => {
    const dir = await mkdtemp(join(tmpdir(), "vendetta-sign-stop-"));
    const abort = new AbortController();
    const reason = new Error("operator stop");
    const sign = vi.fn(async () => {
      if (stage === "after-sign") abort.abort(reason);
      return "0x0102" as const;
    });
    const prepare = vi.fn(async () => {
      if (stage === "before-sign") abort.abort(reason);
      return {};
    });
    const broadcast = vi.fn();
    const file = join(dir, "journal.json");
    if (stage === "before-prepare") abort.abort(reason);
    const transactions = keeperTransactions(file, {
      simulate: async () => {},
      prepare: () => prepareSignedTransaction(() => abort.signal.throwIfAborted(), prepare, sign),
      broadcast,
      receipt: async () => "success",
    });
    try {
      await expect(transactions.send({ functionName: "advance", args: [] })).rejects.toBe(reason);
      expect(broadcast).not.toHaveBeenCalled();
      expect(sign).toHaveBeenCalledTimes(stage === "after-sign" ? 1 : 0);
      expect(prepare).toHaveBeenCalledTimes(stage === "before-prepare" ? 0 : 1);
      await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
it("retains published signed bytes when a stop coincides with a receipt timeout", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vendetta-published-stop-"));
  const abort = new AbortController();
  const file = join(dir, "journal.json");
  const sign = vi.fn(async () => "0x0102" as const);
  const timeout = new Error("synthetic receipt timeout");
  const receipt = vi.fn(async () => {
    throw timeout;
  });
  const transactions = keeperTransactions(file, {
    simulate: async () => {},
    prepare: () =>
      prepareSignedTransaction(
        () => abort.signal.throwIfAborted(),
        async () => ({}),
        sign,
      ),
    broadcast: async () => {
      expect(JSON.parse(await readFile(file, "utf8"))).toBe("0x0102");
      abort.abort();
    },
    receipt,
  });
  try {
    await expect(transactions.send({ functionName: "advance", args: [] })).rejects.toBe(timeout);
    expect(sign).toHaveBeenCalledTimes(1);
    expect(receipt).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await readFile(file, "utf8"))).toBe("0x0102");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
