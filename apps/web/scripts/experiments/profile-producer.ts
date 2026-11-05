// Native-only phase benchmark: no RPC, HTTP, H3, or EVM acceptance claims.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, lstat } from "node:fs/promises";
import { tmpdir, cpus, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toHex, hexToBytes, type Hex } from "viem";
import { runProducer } from "../prover/jobs.js";
import { producerResources } from "./producer-resources.js";

const binary = process.env.HIDDEN_PROVER_BIN;
const keys = process.env.HIDDEN_PROVER_KEYS;
const destination = process.argv[2];
if (!binary || !keys || !destination)
  throw new Error(
    "Set HIDDEN_PROVER_BIN/HIDDEN_PROVER_KEYS; usage: profile-producer.ts report.json",
  );
// Fail before expensive proving if the destination already exists; wx also closes the race.
try {
  await lstat(destination);
  throw new Error("Profile destination already exists");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const vectorsFile = fileURLToPath(
  new URL("../../../../docs/benchmarks/timelock-opening/codec-v2/vectors.json", import.meta.url),
);
const vectorsBytes = await readFile(vectorsFile);
const vectors = JSON.parse(vectorsBytes.toString()) as {
  vectors: { name: string; abi: Hex; statement: Hex; packet: Hex; signature: string }[];
};
const valid = vectors.vectors.find((v) => v.name === "valid");
assert(valid);
const packet = hexToBytes(valid.packet.startsWith("0x") ? valid.packet : `0x${valid.packet}`);
packet[44] = packet[44]! & 127; // Invalid compressed G2 encoding, matching the native route test.
const context = hexToBytes(valid.abi);
context.set(hexToBytes(keccak256(toHex(packet))), 608);
const cases = [
  { name: "valid-opening", kind: "opening", request: valid },
  {
    name: "invalid-point",
    kind: "invalid-point",
    request: {
      abi: toHex(context),
      statement: keccak256(toHex(context)),
      packet: toHex(packet),
      signature: "",
    },
  },
];
const scratch = await mkdtemp(join(tmpdir(), "vendetta-profile-"));
const sampler = await producerResources(binary);
const measurements = [];
const started = performance.now();
try {
  for (const c of cases) {
    const input = join(scratch, "request.json"),
      output = join(scratch, "proof.json");
    await writeFile(input, JSON.stringify(c.request), { mode: 0o600 });
    console.log(`Profiling ${c.name}`);
    await runProducer(binary, ["--prove-v2", resolve(keys, c.kind), input, output], 900000, {
      env: { ...process.env, GOMEMLIMIT: "6GiB", GOMAXPROCS: "8" },
      maxBuffer: 2 ** 20,
    });
    const proof = JSON.parse(await readFile(output, "utf8")) as {
      kind: string;
      valid: boolean;
      elapsedMs: number;
      setupManifestSha256: string;
      profileMs: Record<string, number>;
    };
    assert.equal(proof.kind, c.kind);
    assert.equal(proof.valid, c.kind === "opening");
    const stages = [
      "artifactIntegrityMs",
      "prepareAssignmentMs",
      "loadArtifactsMs",
      "witnessMs",
      "proveMs",
      "verifyMs",
      "encodeMs",
    ];
    assert.deepEqual(Object.keys(proof.profileMs).sort(), stages.sort());
    const durations = Object.values(proof.profileMs);
    assert(durations.every((n) => Number.isFinite(n) && n >= 0));
    const sum = durations.reduce((a, b) => a + b, 0);
    assert(
      Math.abs(sum - proof.elapsedMs) < 10,
      "Phase durations must reconcile with native elapsed",
    );
    measurements.push({
      name: c.name,
      circuit: proof.kind,
      elapsedMs: proof.elapsedMs,
      profileMs: proof.profileMs,
      setupManifestSha256: proof.setupManifestSha256,
    });
  }
  const resources = await sampler.stop();
  assert.equal(resources.peakNativeProcesses, 1);
  assert.equal(resources.native.length, cases.length);
  await writeFile(
    destination,
    JSON.stringify(
      {
        scope:
          "Sequential native phase profile, one authenticated opening and one invalid-point proof; existing unsafe local setups; native VK verification, no EVM/RPC/H3 replay.",
        date: new Date().toISOString(),
        elapsedMs: performance.now() - started,
        binarySha256: createHash("sha256")
          .update(await readFile(binary))
          .digest("hex"),
        vectorsSha256: createHash("sha256").update(vectorsBytes).digest("hex"),
        environment: {
          cpu: cpus()[0]?.model,
          logicalCpus: cpus().length,
          memoryBytes: totalmem(),
          GOMEMLIMIT: "6GiB",
          GOMAXPROCS: "8",
        },
        measurements,
        resources,
        limitations: [
          "Single sample per circuit on shared hardware; filesystem caches are not flushed.",
          "Phase wall times include scheduling and GC; no CPU attribution by phase.",
          "Output serialization, process startup and HTTP/RPC/H3 are outside native phase totals.",
          "Profile contains durations only; requests, witnesses and proof bytes are not retained in this report.",
        ],
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
} finally {
  try {
    await sampler.stop();
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
