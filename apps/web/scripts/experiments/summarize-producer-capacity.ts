// Reproducible accounting from public benchmark artifacts, without RPC or keys.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  keccak256,
  stringToHex,
  toHex,
  type Hex,
} from "viem";
const dir = fileURLToPath(
  new URL("../../../../docs/benchmarks/timelock-opening/game-producer/capacity/", import.meta.url),
);
interface Measurement {
  name: string;
  mission: string;
  circuit: string;
  nativeElapsedMs: number;
  artifactsReused?: boolean;
  queuedHttpElapsedMs: number;
  admissionGas: string;
  submissionGas: string;
}
const result = JSON.parse(readFileSync(join(dir, "capacity-results.json"), "utf8")) as {
  batchElapsedMs: number;
  observedMissionsPerHour: number;
  measurements: Measurement[];
  resources: { native: { kind: string; cpuSeconds: number; peakRssBytes: number }[] };
  h3: {
    totalGas: string;
    transactions: { function: string; contextOrReceipt: Hex; gasUsed: string }[];
  };
};
const certificates = JSON.parse(readFileSync(join(dir, "certificates.json"), "utf8")) as {
  measurements: { mission: string; certificate: Hex }[];
};
const groups = new Map<
  Hex,
  { pre: Hex; receipt: Hex; missions: string[]; gas: bigint; transactions: number }
>();
for (const m of result.measurements.filter((m) => m.circuit === "opening")) {
  const c = certificates.measurements.find((c) => c.mission === m.mission);
  assert(c);
  const [, , encoded] = decodeAbiParameters(
    [{ type: "uint8" }, { type: "bytes" }, { type: "bytes" }],
    c.certificate,
  );
  const [inputs] = decodeAbiParameters([{ type: "uint256[55]" }], encoded);
  const pre = toHex((inputs[51] << 128n) | inputs[52], { size: 32 });
  const receipt = keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }],
      ["VENDETTA_H3_PREFIX_V1", pre, keccak256(stringToHex("VENDETTA_H3_MISSION_V2")), pre],
    ),
  );
  const group = groups.get(pre) ?? { pre, receipt, missions: [], gas: 0n, transactions: 0 };
  group.missions.push(m.mission);
  groups.set(pre, group);
}
for (const tx of result.h3.transactions) {
  const group = [...groups.values()].find(
    (g) => tx.contextOrReceipt === (tx.function === "begin" ? g.pre : g.receipt),
  );
  assert(group, "Unattributed H3 transaction");
  group.gas += BigInt(tx.gasUsed);
  group.transactions++;
}
assert.equal(
  [...groups.values()].reduce((sum, g) => sum + g.gas, 0n),
  BigInt(result.h3.totalGas),
);
assert(
  [...groups.values()].every((g) => g.transactions >= 2),
  "Missing cold H3 preparation",
);
function distribution(values: number[]) {
  assert(values.length > 0);
  return {
    count: values.length,
    min: Math.min(...values),
    mean: values.reduce((a, b) => a + b) / values.length,
    max: Math.max(...values),
  };
}
const circuits = ["opening", "invalid-point"].map((kind) => {
  const measurements = result.measurements.filter((m) => m.circuit === kind);
  const native = result.resources.native.filter((m) => m.kind === kind);
  assert.equal(native.length, measurements.filter((m) => !m.artifactsReused).length);
  return {
    kind,
    nativeElapsedMs: distribution(measurements.map((m) => m.nativeElapsedMs)),
    resourceSampleUnit: measurements.some((m) => m.artifactsReused !== undefined)
      ? "resident worker process"
      : "proof process",
    sampledCpuSeconds: distribution(native.map((m) => m.cpuSeconds)),
    sampledPeakRssBytes: distribution(native.map((m) => m.peakRssBytes)),
    certificateSubmissionGas: distribution(measurements.map((m) => Number(m.submissionGas))),
  };
});
const missions = result.measurements.map((m) => {
  const group = [...groups.values()].find((g) => g.missions.includes(m.mission));
  const h3GasNumerator = group?.gas ?? 0n,
    h3GasDenominator = BigInt(group?.missions.length ?? 1);
  return {
    ...m,
    amortizedH3Gas: { numerator: String(h3GasNumerator), denominator: String(h3GasDenominator) },
    amortizedAdmissionH3AndCertificateGas: {
      numerator: String(
        (BigInt(m.admissionGas) + BigInt(m.submissionGas)) * h3GasDenominator + h3GasNumerator,
      ),
      denominator: String(h3GasDenominator),
    },
  };
});
writeFileSync(
  join(dir, "summary.json"),
  JSON.stringify(
    {
      batchElapsedMs: result.batchElapsedMs,
      observedMissionsPerHour: result.observedMissionsPerHour,
      circuits,
      h3Contexts: [...groups.values()].map((g) => ({ ...g, gas: String(g.gas) })),
      missions,
      totalAdmissionH3AndCertificateGas: String(
        result.measurements.reduce(
          (sum, m) => sum + BigInt(m.admissionGas) + BigInt(m.submissionGas),
          BigInt(result.h3.totalGas),
        ),
      ),
      exclusions: [
        "Deployments, the two intentionally reverted certificate submissions, and queue advance/mission execution gas are excluded.",
        "Amortized H3 gas splits measured shared contexts equally; it is not the gas charged by a standalone fresh context or a worst-case H3 bound.",
        "Gas units are measured on local Anvil, with no fiat or live gas-price estimate. Fee in wei = gas units * gas price in wei per gas.",
        "Six samples on a shared workstation; CPU/RSS are sampled and may undercount. Finite batch throughput is not an arrival-rate capacity guarantee.",
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log("Wrote capacity summary with reconciled H3 and per-mission gas accounting");
