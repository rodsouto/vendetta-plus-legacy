// Read-only availability observations, separate from the private-chain soak.
import { writeFile, rename } from "node:fs/promises";
import { createPublicClient, http } from "viem";
import { fetchBeacon } from "../prover/beacon.js";
import { beacon1001 } from "./opening-fixtures.js";

const seconds = Number(process.argv[2]);
const file = process.argv[3] ?? "";
if (
  process.argv.length !== 4 ||
  !file ||
  !Number.isSafeInteger(seconds) ||
  seconds < 60 ||
  seconds > 86400
)
  throw new Error("Usage: probe-producer-remotes.ts <60..86400 seconds> <new-report.json>");
const rpc = "https://rpc.gnosischain.com";
const client = createPublicClient({
  transport: http(rpc, { timeout: 15000, retryCount: 0 }),
  cacheTime: 0,
});
const samples: { startedAt: string; beacon: Observation; rpc: Observation }[] = [];
interface Observation {
  success: boolean;
  elapsedMs: number;
  error?: string;
}
const report = {
  scope:
    "Read-only public Gnosis eth_chainId and archived drand round 1001 over HTTPS, separate from private Anvil proving/H3 soak",
  rpc,
  beacon: "https://api.drand.sh",
  minimumSeconds: seconds,
  intervalMs: 60000,
  startedAt: new Date().toISOString(),
  completed: false,
  elapsedMs: 0,
  samples,
  limitations: [
    "Periodic point observations are not an availability SLA or continuous outage measurement.",
    "RPC observation checks chain identity only; no remote Game or H3 deployment and no remote receipt recovery.",
    "Beacon signature is compared with the archived authenticated round; no future-round release latency measurement.",
  ],
};
// Reject an existing destination before the first network call.
await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
const started = performance.now();
async function observe(check: () => Promise<void>): Promise<Observation> {
  const before = performance.now();
  try {
    await check();
    return { success: true, elapsedMs: performance.now() - before };
  } catch (error) {
    return {
      success: false,
      elapsedMs: performance.now() - before,
      error: error instanceof Error ? error.name : "UnknownError",
    };
  }
}
async function save() {
  report.elapsedMs = performance.now() - started;
  await writeFile(file + ".tmp", JSON.stringify(report, null, 2) + "\n");
  await rename(file + ".tmp", file);
}
for (let i = 0; ; i++) {
  const wait = i * report.intervalMs - (performance.now() - started);
  if (wait > 0) await new Promise((done) => setTimeout(done, wait));
  const startedAt = new Date().toISOString();
  const [beacon, rpc] = await Promise.all([
    observe(async () => {
      if ((await fetchBeacon(1001n)) !== beacon1001.signature)
        throw new Error("Archived beacon mismatch");
    }),
    observe(async () => {
      if ((await client.getChainId()) !== 100) throw new Error("RPC chain mismatch");
    }),
  ]);
  samples.push({ startedAt, beacon, rpc });
  if (performance.now() - started >= seconds * 1000) report.completed = true;
  await save();
  console.log(`Remote sample ${i + 1}: beacon=${beacon.success} rpc=${rpc.success}`);
  if (report.completed) break;
}
