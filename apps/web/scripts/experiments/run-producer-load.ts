// Synthetic operational load only: real HTTP/access/queue/cache, no RPC or cryptography.
import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import type { AddressInfo } from "node:net";
import { producerAccess } from "../prover/access.js";
import { producerServer } from "../prover/http.js";
import { serialQueue } from "../prover/jobs.js";
import { cacheLimits, pruneCache } from "../prover/cache.js";

const seconds = Number(process.argv[2] ?? 60);
const output = process.argv[3];
if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 3600 || !output)
  throw new Error("usage: run-producer-load.ts <seconds:1..3600> <report.json>");
const dir = await mkdtemp(join(tmpdir(), "producer-load-"));
const tokens = Array.from({ length: 4 }, (_, i) => `synthetic-client-${i}-${"x".repeat(32)}`);
const observer = "synthetic-observer-" + "y".repeat(32);
const access = producerAccess([
  ...tokens.map((token) => ({
    token,
    scopes: ["prove"],
    requestsPerMinute: 100000,
    maxConcurrent: 4,
  })),
  { token: observer, scopes: ["metrics"], requestsPerMinute: 100000, maxConcurrent: 1 },
]);
const enqueue = serialQueue<string>(8);
const limits = cacheLimits({ maxBytes: 8192, maxFiles: 32, maxAgeMs: 60000 });
let activeJobs = 0,
  maxActiveJobs = 0,
  maxPending = 0,
  failedJobs = 0,
  completedJobs = 0,
  cacheHits = 0;
let cache = { bytes: 0, files: 0 };
const attempts = new Map<number, number>();
const baseline = process.memoryUsage();
let peakRss = baseline.rss;
const delay = monitorEventLoopDelay({ resolution: 10 });
delay.enable();
const server = producerServer(
  async (body) => {
    const id = Number(body.id);
    assert(Number.isSafeInteger(id) && id >= 0 && id < 256);
    const result = enqueue(String(id), async () => {
      activeJobs++;
      maxActiveJobs = Math.max(maxActiveJobs, activeJobs);
      try {
        cache = await pruneCache(dir, limits);
        const path = join(
          dir,
          `0x${id.toString(16).padStart(64, "0")}.${"a".repeat(64)}.proof.json`,
        );
        try {
          await readFile(path);
          cacheHits++;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          // Deliberately cheap stand-in for a serialized job; these timings are NOT proving capacity.
          await new Promise((resolve) => setTimeout(resolve, 8));
          const attempt = (attempts.get(id) ?? 0) + 1;
          attempts.set(id, attempt);
          if (id % 17 === 0 && attempt === 1) {
            failedJobs++;
            throw new Error("Injected transient failure");
          }
          await writeFile(path, "0".repeat(256), { mode: 0o600 });
        }
        completedJobs++;
        return "0xabcd";
      } finally {
        cache = await pruneCache(dir, limits);
        activeJobs--;
      }
    });
    maxPending = Math.max(maxPending, enqueue.stats().pending);
    return result;
  },
  { access, metrics: () => ({ queue: enqueue.stats(), cache }) },
);
const statuses: Record<string, number> = {};
const latencies: number[] = [];
let metricsReads = 0;
let sequence = 0;
function send(port: number, method: string, path: string, token: string | undefined, body = "{}") {
  const start = performance.now();
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        agent: false,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          latencies.push(performance.now() - start);
          const status = res.statusCode!;
          statuses[status] = (statuses[status] ?? 0) + 1;
          resolve({ status, body: text });
        });
      },
    );
    req.setTimeout(5000, () => req.destroy(new Error("Load request timeout")));
    req.on("error", reject);
    req.end(body);
  });
}
const originalWarn = console.warn;
// Expected injected failures/overload must not flood the benchmark log.
console.warn = () => {};
try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  const start = performance.now();
  const deadline = start + seconds * 1000;
  await Promise.all(
    Array.from({ length: 20 }, (_, worker) =>
      (async () => {
        while (performance.now() < deadline) {
          const n = sequence++;
          if (worker === 19) {
            const response = await send(port, "GET", "/metrics", observer);
            assert.equal(response.status, 200);
            const snapshot = JSON.parse(response.body);
            assert(snapshot.queue.pending <= 8 && snapshot.activeHandlers <= 32);
            metricsReads++;
            peakRss = Math.max(peakRss, process.memoryUsage().rss);
          } else if (n % 29 === 0) {
            assert.equal((await send(port, "POST", "/", undefined)).status, 401);
          } else if (n % 31 === 0) {
            assert.equal((await send(port, "GET", "/metrics", tokens[worker % 4])).status, 403);
          } else {
            // Periodic shared keys exercise deduplication; unique keys exercise saturation/eviction.
            const id = n % 5 === 0 ? 7 : n % 256;
            const response = await send(
              port,
              "POST",
              "/",
              tokens[worker % 4],
              JSON.stringify({ id }),
            );
            assert([200, 429, 503].includes(response.status));
            if (response.status === 200) assert.equal(response.body, '{"certificate":"0xabcd"}');
          }
          await new Promise((resolve) => setTimeout(resolve, 2));
        }
      })(),
    ),
  );
  // Once overload stops, every failed/evicted key must be retryable.
  for (let id = 0; id < 256; id++) {
    let response = await send(port, "POST", "/", tokens[0], JSON.stringify({ id }));
    if (response.status === 503)
      response = await send(port, "POST", "/", tokens[0], JSON.stringify({ id }));
    assert.equal(response.status, 200);
  }
  const final = JSON.parse((await send(port, "GET", "/metrics", observer)).body);
  assert.equal(final.activeHandlers, 0);
  assert.equal(final.queue.pending, 0);
  assert.equal(activeJobs, 0);
  assert.equal(maxActiveJobs, 1);
  assert(cache.bytes <= limits.maxBytes && cache.files <= limits.maxFiles);
  assert(enqueue.stats().deduplicated > 0 && enqueue.stats().rejected > 0);
  assert(access.stats().limited > 0 && failedJobs > 0 && cacheHits > 0);
  latencies.sort((a, b) => a - b);
  const percentile = (p: number) =>
    latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))];
  const report = {
    scope:
      "Synthetic operational load: real HTTP/access/serial queue/filesystem cache; no RPC, H3, Groth16 or game replay. Not a production capacity estimate.",
    node: process.version,
    sustainedSeconds: seconds,
    elapsedMsIncludingRecovery: performance.now() - start,
    workers: 20,
    syntheticJobDelayMs: 8,
    statuses,
    metricsReads,
    latencyMsIncludingRejectionsAndRecovery: {
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
    },
    completedJobs,
    failedJobs,
    cacheHits,
    maxActiveJobs,
    maxPending,
    finalQueue: enqueue.stats(),
    access: access.stats(),
    cache,
    limits,
    recoveryKeys: 256,
    baselineMemory: baseline,
    finalMemory: process.memoryUsage(),
    peakSampledRss: peakRss,
    eventLoopDelayMs: { mean: delay.mean / 1e6, max: delay.max / 1e6 },
    invariantsPassed: true,
  };
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally {
  console.warn = originalWarn;
  delay.disable();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
}
