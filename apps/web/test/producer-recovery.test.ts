import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { keccak256, type Hex } from "viem";
import { recoverTransaction } from "../scripts/prover/recovery.js";
import { producerMetrics } from "../scripts/prover/metrics.js";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function journal() {
  const dir = await mkdtemp(join(tmpdir(), "h3-recovery-"));
  dirs.push(dir);
  return join(dir, "h3.json");
}
const raw: Hex = "0x1234";
it("persists before broadcast and recovers a lost send response after restart without preparing another nonce", async () => {
  const file = await journal();
  const prepare = vi.fn(async () => raw);
  const broadcast = vi.fn(async () => {
    expect(JSON.parse(await readFile(file, "utf8"))).toBe(raw);
    throw new Error("RPC disconnected after accepting transaction");
  });
  await expect(
    recoverTransaction(file, {
      prepare,
      broadcast,
      receipt: async () => {
        throw new Error("RPC timeout");
      },
    }),
  ).rejects.toThrow("RPC timeout");
  const receipt = vi.fn(async () => "success" as const);
  await recoverTransaction(file, { prepare, broadcast, receipt });
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(broadcast.mock.calls).toHaveLength(2);
  expect(receipt).toHaveBeenCalledWith(keccak256(raw));
  await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
});
it("clears a reverted transaction so a later request can re-read state and prepare again", async () => {
  const file = await journal();
  const prepare = vi.fn(async () => raw);
  const broadcast = vi.fn(async () => {});
  await expect(
    recoverTransaction(file, { prepare, broadcast, receipt: async () => "reverted" }),
  ).rejects.toThrow("reverted");
  await recoverTransaction(file, { prepare, broadcast, receipt: async () => "success" });
  expect(prepare).toHaveBeenCalledTimes(2);
});
it("does not broadcast or overwrite a corrupt journal", async () => {
  const file = await journal();
  await writeFile(file, JSON.stringify("bad"));
  const prepare = vi.fn(async () => raw),
    broadcast = vi.fn(async () => {});
  await expect(
    recoverTransaction(file, { prepare, broadcast, receipt: async () => "success" }),
  ).rejects.toThrow("Invalid H3 transaction journal");
  expect(prepare).not.toHaveBeenCalled();
  expect(broadcast).not.toHaveBeenCalled();
});
it("records failures and durations without retaining errors or mutable snapshot references", async () => {
  const metrics = producerMetrics();
  metrics.increment("requests");
  await expect(
    metrics.measure("rpc", async () => {
      throw new Error("private RPC URL");
    }),
  ).rejects.toThrow();
  await metrics.measure("rpc", async () => "ok");
  const snapshot = metrics.snapshot();
  expect(snapshot.counters.requests).toBe(1);
  expect(snapshot.stages.rpc).toMatchObject({ calls: 2, failures: 1 });
  expect(snapshot.stages.rpc!.totalMs).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(snapshot)).not.toContain("private RPC");
  snapshot.stages.rpc!.calls = 100;
  expect(metrics.snapshot().stages.rpc!.calls).toBe(2);
});

it("preserves the journal when an RPC adapter returns an unrecognized receipt status", async () => {
  const file = await journal();
  const prepare = vi.fn(async () => raw);
  const broadcast = vi.fn(async () => {});
  await expect(
    recoverTransaction(file, {
      prepare,
      broadcast,
      receipt: async () => undefined as unknown as "success",
    }),
  ).rejects.toThrow("Invalid H3 transaction receipt");
  expect(JSON.parse(await readFile(file, "utf8"))).toBe(raw);
  await recoverTransaction(file, { prepare, broadcast, receipt: async () => "success" });
  expect(prepare).toHaveBeenCalledTimes(1);
});
