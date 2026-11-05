// Native-only phase benchmark: no RPC, HTTP, H3, or EVM acceptance claims.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, lstat } from "node:fs/promises";
import { tmpdir, cpus, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toHex, type Hex } from "viem";
import { ProducerWorker } from "../prover/worker.js";
import { producerResources } from "./producer-resources.js";

const binary = process.env.HIDDEN_PROVER_BIN;
const keys = process.env.HIDDEN_PROVER_KEYS;
const destination = process.argv[2];
if (!binary || !keys || !destination)
  throw new Error("Set HIDDEN_PROVER_BIN/HIDDEN_PROVER_KEYS; usage: profile-worker.ts report.json");
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
  vectors: {
    name: string;
    abi: Hex;
    statement: Hex;
    packet: Hex;
    signature: string;
    expected: string;
  }[];
};
const cases = ["valid", "wrong-commitment", "valid-five-candidates"].map((name) => {
  const request = vectors.vectors.find((v) => v.name === name);
  assert(request);
  return { name, request };
});
const scratch = await mkdtemp(join(tmpdir(), "vendetta-profile-"));
const sampler = await producerResources(binary);
const measurements = [];
const started = performance.now();
try {
  const jobs = await Promise.all(
    cases.map(async (c, i) => {
      const input = join(scratch, `${i}.request.json`),
        output = join(scratch, `${i}.proof.json`);
      await writeFile(input, JSON.stringify(c.request), { mode: 0o600 });
      return { input, output };
    }),
  );
  console.log("Profiling one opening worker: valid / invalid / valid");
  const worker = new ProducerWorker({
    binary,
    setups: { opening: resolve(keys, "opening"), "invalid-point": resolve(keys, "invalid-point") },
    timeoutMs: 900000,
    env: { ...process.env, GOMEMLIMIT: "6GiB", GOMAXPROCS: "8" },
  });
  try {
    for (const job of jobs) await worker.run({ circuit: "opening", ...job });
  } finally {
    await worker.close();
  }
  for (const [i, c] of cases.entries()) {
    const job = jobs[i];
    assert(job);
    const output = job.output;
    const proof = JSON.parse(await readFile(output, "utf8")) as {
      kind: string;
      statement: string;
      artifactsReused: boolean;
      publicInputs: string[];
      valid: boolean;
      elapsedMs: number;
      setupManifestSha256: string;
      profileMs: Record<string, number>;
    };
    assert.equal(proof.kind, "opening");
    assert.equal(proof.statement, c.request.statement);
    assert.equal(proof.valid, c.request.expected === "valid");
    assert.equal(proof.artifactsReused, i > 0);
    assert.equal(proof.publicInputs.length, 55);
    assert.equal(
      toHex((BigInt(proof.publicInputs[48]!) << 128n) | BigInt(proof.publicInputs[49]!), {
        size: 32,
      }),
      c.request.statement,
    );
    assert.equal(BigInt(proof.publicInputs[50]!), proof.valid ? 1n : 0n);
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
      valid: proof.valid,
      artifactsReused: proof.artifactsReused,
      circuit: proof.kind,
      elapsedMs: proof.elapsedMs,
      profileMs: proof.profileMs,
      setupManifestSha256: proof.setupManifestSha256,
    });
  }
  const resources = await sampler.stop();
  assert.equal(resources.peakNativeProcesses, 1);
  assert.equal(resources.native.length, 1);
  await writeFile(
    destination,
    JSON.stringify(
      {
        scope:
          "Single resident opening worker, three distinct valid/invalid/valid requests, artifact integrity checked before every job; existing unsafe local setup; native VK verification, no EVM/RPC/H3 replay.",
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
          "One cold load and two warm jobs on shared hardware; filesystem caches are not flushed.",
          "Phase wall times include scheduling and GC; no CPU attribution by phase.",
          "Output serialization, process startup and HTTP/RPC/H3 are outside native phase totals. Supervisor timeout is fifteen minutes per job; process death is awaited on failure or close.",
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
