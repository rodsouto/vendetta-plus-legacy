// Summarize only recorded observations; no RPC, secrets or extrapolated capacity.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const file = process.argv[2];
if (!file || process.argv.length !== 3)
  throw new Error("Usage: summarize-producer-soak.ts <soak-results.json>");
interface Measurement {
  circuit: string;
  artifactsReused: boolean;
  elapsedMs: number;
  nativeElapsedMs: number;
}
const source = readFileSync(file);
const result = JSON.parse(source.toString()) as {
  minimumSeconds: number;
  batchElapsedMs: number;
  additionalProofs: number;
  proofsGenerated: number;
  punctualAndDelayedFullWorldEqual: boolean;
  measurements: Measurement[];
  faults: {
    rpcRejected: number;
    beaconRejected: number;
    lostBroadcastReplies: number;
    receiptsRejected: number;
  };
  statsAfter: { queue: { pending: number; deduplicated: number } };
  statsBefore: { queue: { deduplicated: number } };
  finalStats: { proofs: number; queue: { pending: number } };
  resources: {
    peakNativeProcesses: number;
    peakNativeRssBytes: number;
    peakNodeRssBytes: number;
    native: { kind: string; cpuSeconds: number; peakRssBytes: number }[];
  };
  limitations: string[];
};
assert(result.minimumSeconds >= 3600);
assert(result.batchElapsedMs >= result.minimumSeconds * 1000);
assert.equal(result.measurements.length, result.additionalProofs);
assert.equal(result.proofsGenerated, 6 + result.additionalProofs);
assert.equal(result.finalStats.proofs, result.proofsGenerated);
assert.equal(result.finalStats.queue.pending, 0);
assert.equal(result.statsAfter.queue.pending, 0);
assert.equal(result.resources.peakNativeProcesses, 1);
assert(result.punctualAndDelayedFullWorldEqual);
assert(result.faults.rpcRejected >= 6 && result.faults.beaconRejected >= 3);
assert(result.faults.lostBroadcastReplies >= 1 && result.faults.receiptsRejected >= 1);
assert(
  result.statsAfter.queue.deduplicated - result.statsBefore.queue.deduplicated >=
    result.additionalProofs,
);
const distribution = (values: number[]) => {
  assert(values.length > 0 && values.every((value) => Number.isFinite(value) && value >= 0));
  return {
    count: values.length,
    min: Math.min(...values),
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    max: Math.max(...values),
  };
};
const circuits = ["opening", "invalid-point"].map((circuit) => {
  const measurements = result.measurements.filter((m) => m.circuit === circuit);
  const processes = result.resources.native.filter((p) => p.kind === circuit);
  assert(
    measurements.some((m) => m.artifactsReused),
    `Missing warm ${circuit} proof`,
  );
  return {
    circuit,
    repeatedProofs: measurements.length,
    warmProofs: measurements.filter((m) => m.artifactsReused).length,
    coldProofs: measurements.filter((m) => !m.artifactsReused).length,
    repeatedProofNativeMs: distribution(measurements.map((m) => m.nativeElapsedMs)),
    repeatedProofHttpMs: distribution(measurements.map((m) => m.elapsedMs)),
    processCpuSeconds: distribution(processes.map((p) => p.cpuSeconds)),
    processPeakRssBytes: distribution(processes.map((p) => p.peakRssBytes)),
  };
});
writeFileSync(
  join(dirname(file), "soak-summary.json"),
  JSON.stringify(
    {
      sourceSha256: createHash("sha256").update(source).digest("hex"),
      batchElapsedMs: result.batchElapsedMs,
      proofsGenerated: result.proofsGenerated,
      uniqueAdmittedContexts: 6,
      circuits,
      faults: result.faults,
      peakNativeProcesses: result.resources.peakNativeProcesses,
      peakNativeRssBytes: result.resources.peakNativeRssBytes,
      peakNodeRssBytes: result.resources.peakNodeRssBytes,
      finalQueuePending: result.finalStats.queue.pending,
      punctualAndDelayedFullWorldEqual: result.punctualAndDelayedFullWorldEqual,
      limitations: [
        ...result.limitations,
        "Proof duration distributions cover repeated proofs only; process CPU/RSS covers the full run, including initial proving and recovery.",
        "No throughput extrapolation: the same six contexts are reproved and the run includes deliberately injected downtime.",
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log("Verified soak invariants and wrote soak-summary.json");
