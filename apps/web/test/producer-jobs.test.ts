import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { producerTimeout, runProducer, serialQueue } from "../scripts/prover/jobs.js";
import { acquireStateLease } from "../scripts/state-lease.js";

it.each(["missing", "timeout", "exit", "flood"])(
  "reaps a leased %s inspection before state can be reused",
  async (mode) => {
    const dir = await mkdtemp(join(tmpdir(), "leased-inspect-failure-"));
    const lease = await acquireStateLease(dir);
    try {
      const binary = mode === "missing" ? join(dir, "missing") : process.execPath;
      const code =
        mode === "timeout"
          ? "setInterval(()=>{},1000)"
          : mode === "flood"
            ? "process.stdout.write('x'.repeat(4096));setInterval(()=>{},1000)"
            : "process.exit(7)";
      const task = runProducer(binary, ["-e", code], mode === "timeout" ? 100 : 5000, {
        stateLeaseFd: lease.fd,
        maxBuffer: 1024,
      });
      if (mode === "missing") await expect(task).rejects.toMatchObject({ code: "ENOENT" });
      else if (mode === "timeout")
        await expect(task).rejects.toMatchObject({ killed: true, signal: "SIGKILL" });
      else if (mode === "exit") await expect(task).rejects.toMatchObject({ code: 7 });
      else await expect(task).rejects.toThrow("output limit");
      await lease.release();
      const next = await acquireStateLease(dir);
      await next.release();
    } finally {
      await lease.release();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

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

it("keeps state ownership in an inspection child after the parent reference closes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "producer-lease-test-"));
  const lease = await acquireStateLease(dir);
  const controller = new AbortController();
  try {
    const pidFile = join(dir, "pid");
    const running = runProducer(
      process.execPath,
      [
        "-e",
        "require('node:fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)",
        pidFile,
      ],
      10000,
      { signal: controller.signal, stateLeaseFd: lease.fd },
    );
    const failed = expect(running).rejects.toMatchObject({ code: "ABORT_ERR" });
    let pid = 0;
    await vi.waitFor(async () => {
      pid = Number(await readFile(pidFile, "utf8"));
    });
    await lease.release();
    await expect(acquireStateLease(dir)).rejects.toThrow("already in use");
    controller.abort();
    await failed;
    expect(() => process.kill(pid, 0)).toThrow();
    const next = await acquireStateLease(dir);
    await next.release();
  } finally {
    controller.abort();
    await lease.release();
    await rm(dir, { recursive: true, force: true });
  }
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
