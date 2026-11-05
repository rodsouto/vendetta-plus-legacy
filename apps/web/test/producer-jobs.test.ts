import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { producerTimeout, runProducer, serialQueue } from "../scripts/prover/jobs.js";

describe("producer resource limits", () => {
  it.each([0, -1, NaN, Infinity, 1.5, 2 ** 31])("rejects invalid timeout %s", (value) => {
    expect(() => producerTimeout(value)).toThrow("Invalid producer timeout");
  });
  it("defaults to fifteen minutes", () => {
    expect(producerTimeout()).toBe(900_000);
  });
  it("deduplicates at capacity, serializes jobs and releases failed slots", async () => {
    const enqueue = serialQueue<string>(2);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const events: string[] = [];
    const first = enqueue("first", async () => {
      events.push("first");
      await gate;
      throw new Error("RPC unavailable");
    });
    const failure = expect(first).rejects.toThrow("RPC unavailable");
    const second = enqueue("second", async () => {
      events.push("second");
      return "certificate";
    });
    expect(enqueue("first", async () => "duplicate")).toBe(first);
    await expect(enqueue("third", async () => "overflow")).rejects.toThrow("queue full");
    expect(enqueue.stats()).toEqual({ pending: 2, deduplicated: 1, rejected: 1, capacity: 2 });
    expect(events).toEqual(["first"]);
    let drained = false;
    const drain = enqueue.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    release();
    await failure;
    await expect(second).resolves.toBe("certificate");
    await expect(enqueue("first", async () => "retry")).resolves.toBe("retry");
    await drain;
    expect(drained).toBe(true);
    expect(events).toEqual(["first", "second"]);
    expect(enqueue.stats().pending).toBe(0);
  });
  it("kills a stuck subprocess and allows the next queued job to run", async () => {
    const enqueue = serialQueue(2);
    const stuck = enqueue("stuck", () =>
      runProducer(process.execPath, ["-e", "setInterval(() => {}, 1000)"], 100),
    );
    const failure = expect(stuck).rejects.toMatchObject({ killed: true, signal: "SIGKILL" });
    const next = enqueue("next", () =>
      runProducer(process.execPath, ["-e", "process.stdout.write('ready')"], 5000),
    );
    await failure;
    await expect(next).resolves.toMatchObject({ stdout: "ready" });
  });
});

it("waits for an aborted inspection process to die before rejecting", async () => {
  const dir = await mkdtemp(join(tmpdir(), "producer-abort-test-"));
  const pidFile = join(dir, "pid");
  const controller = new AbortController();
  try {
    const failure = expect(
      runProducer(
        process.execPath,
        [
          "-e",
          "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)",
          pidFile,
        ],
        5000,
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ code: "ABORT_ERR" });
    let pid = 0;
    await vi.waitFor(async () => {
      pid = Number(await readFile(pidFile, "utf8"));
    });
    controller.abort();
    await failure;
    expect(() => process.kill(pid, 0)).toThrow();
  } finally {
    controller.abort();
    await rm(dir, { recursive: true, force: true });
  }
});
