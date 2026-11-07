import { openingAbi, pointAbi } from "../scripts/prover/consumer-abi.js";
import { expect, it } from "vitest";
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cachedCertificate, validCertificateArtifact } from "../scripts/prover/proof-cache.js";

const expected = {
  kind: "invalid-point" as const,
  statement: ("0x" + "11".repeat(32)) as `0x${string}`,
  setup: "aa".repeat(32),
};
const artifact = {
  kind: expected.kind,
  statement: expected.statement,
  setupManifestSha256: expected.setup,
  proof: "0x" + "ab".repeat(384),
  publicInputs: ["0", "1"],
  elapsedMs: 0,
};
it.each([
  ["empty", ""],
  ["truncated", '{"proof":'],
  ["wrong binding", JSON.stringify({ ...artifact, setupManifestSha256: "bb".repeat(32) })],
  ["malformed input", JSON.stringify({ ...artifact, publicInputs: ["-1", "1"] })],
  ["wrong shape", JSON.stringify({ ...artifact, publicInputs: null })],
])("evicts %s cache data as a miss, permitting a fresh artifact", async (_name, text) => {
  const dir = await mkdtemp(join(tmpdir(), "vendetta-proof-cache-"));
  const file = join(dir, "owned.proof.json");
  try {
    await writeFile(file, text!);
    expect(await cachedCertificate(file, expected)).toBeUndefined();
    await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
    // Synthetic worker output, not a Groth16 proof or a Game execution.
    await writeFile(file, JSON.stringify(artifact));
    expect(await cachedCertificate(file, expected)).toEqual(artifact);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("does not delete valid cached bytes or swallow storage errors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vendetta-proof-cache-io-")),
    file = join(dir, "proof.json"),
    bad = join(dir, "directory");
  try {
    const bytes = JSON.stringify(artifact, null, 2);
    await writeFile(file, bytes);
    expect(await cachedCertificate(file, expected)).toEqual(artifact);
    expect(await readFile(file, "utf8")).toBe(bytes);
    await mkdir(bad);
    await expect(cachedCertificate(bad, expected)).rejects.toMatchObject({ code: "EISDIR" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("rejects structurally invalid generated artifacts without accepting an invalidity flag", () => {
  expect(validCertificateArtifact({ ...artifact, valid: false }, expected)).toBe(true);
  expect(
    validCertificateArtifact({ ...artifact, publicInputs: [String(1n << 256n), "1"] }, expected),
  ).toBe(false);
  expect(validCertificateArtifact({ ...artifact, proof: "0x00" }, expected)).toBe(false);
});

it("evicts consumer-rejected proofs but retains cache on an RPC outage or unfinished prefix", async () => {
  const { withProofVerification } = await import("../scripts/prover/proof-cache.js");
  const { BaseError, ContractFunctionRevertedError, encodeErrorResult, parseAbi } =
    await import("viem");
  const dir = await mkdtemp(join(tmpdir(), "vendetta-proof-rejection-")),
    file = join(dir, "proof.json");
  const abi = openingAbi;
  try {
    for (const name of ["InvalidProof", "UnfinishedPrefix"] as const) {
      await writeFile(file, JSON.stringify(artifact));
      const error = new BaseError("synthetic contract failure", {
        cause: new ContractFunctionRevertedError({
          abi,
          data: encodeErrorResult({ abi, errorName: name as never }),
          functionName: "check",
        }),
      });
      await expect(
        withProofVerification(file, async () => {
          throw error;
        }),
      ).rejects.toBe(error);
      if (name === "InvalidProof")
        await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
      else expect(await readFile(file, "utf8")).toBe(JSON.stringify(artifact));
    }
    const network = new Error("synthetic RPC outage");
    await expect(
      withProofVerification(file, async () => {
        throw network;
      }),
    ).rejects.toBe(network);
    expect(await readFile(file, "utf8")).toBe(JSON.stringify(artifact));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("rejects cached opening inputs that overflow prefix assembly or violate public boolean words", () => {
  const opening = {
    ...artifact,
    kind: "opening" as const,
    pre: ("0x" + "00".repeat(32)) as `0x${string}`,
    publicInputs: Array(55).fill("0"),
  };
  const binding = { ...expected, kind: "opening" as const };
  opening.publicInputs[51] = String(1n << 128n);
  expect(validCertificateArtifact(opening, binding)).toBe(false);
  opening.publicInputs[51] = "0";
  opening.publicInputs[14] = "2";
  expect(validCertificateArtifact(opening, binding)).toBe(false);
});

it.each([
  ...[
    "InvalidProof",
    "WrongStatement",
    "NonCanonicalWord",
    "InvalidExhaustionClaim",
    "MismatchedScalar",
  ].map((name) => ({ name, abi: openingAbi, kind: "opening" })),
  ...["InvalidProof", "WrongStatement", "NonCanonicalWord"].map((name) => ({
    name,
    abi: pointAbi,
    kind: "invalid-point",
  })),
])("reports safe $kind/$name eviction exactly once", async ({ name, abi }) => {
  const { withProofVerification } = await import("../scripts/prover/proof-cache.js");
  const { producerMetrics } = await import("../scripts/prover/metrics.js");
  const { BaseError, ContractFunctionRevertedError, parseAbi, encodeErrorResult } =
    await import("viem");
  const dir = await mkdtemp(join(tmpdir(), "vendetta-proof-report-")),
    file = join(dir, "proof.json");

  const error = new BaseError("synthetic private provider URL", {
    cause: new ContractFunctionRevertedError({
      abi,
      data: encodeErrorResult({ abi, errorName: name as never }),
      functionName: "check",
    }),
  });
  const reports: string[] = [];
  const metrics = producerMetrics(["proofRejections"]);
  try {
    await writeFile(file, "synthetic cache");
    await expect(
      withProofVerification(
        file,
        async () => {
          throw error;
        },
        (reason) => {
          reports.push(reason);
          metrics.increment("proofRejections");
        },
      ),
    ).rejects.toBe(error);
    expect(reports).toEqual([name]);
    expect(metrics.snapshot().counters.proofRejections).toBe(1);
    await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it.each(["Proof/pre mismatch", "Prefix scalar mismatch", "Invalid point certificate rejected"])(
  "evicts deterministic local rejection %s",
  async (message) => {
    const { withProofVerification } = await import("../scripts/prover/proof-cache.js");
    const dir = await mkdtemp(join(tmpdir(), "vendetta-proof-local-rejection-")),
      file = join(dir, "proof.json");
    const error = new Error(message),
      reasons: string[] = [];
    try {
      await writeFile(file, "synthetic");
      await expect(
        withProofVerification(
          file,
          async () => {
            throw error;
          },
          (r) => reasons.push(r),
        ),
      ).rejects.toBe(error);
      expect(reasons).toEqual(["InvalidProof"]);
      await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
it("retains the rejection when a corrupt cache path cannot be evicted", async () => {
  const { withProofVerification } = await import("../scripts/prover/proof-cache.js");
  const dir = await mkdtemp(join(tmpdir(), "vendetta-proof-eviction-fail-")),
    file = join(dir, "not-a-file");
  const error = new Error("Proof/pre mismatch");
  try {
    await mkdir(file);
    const failure = await withProofVerification(file, async () => {
      throw error;
    }).catch((error: unknown) => error);
    expect((failure as AggregateError).errors[0]).toBe(error);
    expect((failure as AggregateError).errors).toHaveLength(2);
    expect((failure as AggregateError).cause).toBe(error);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("keeps unknown revert selectors without eviction or a rejection event", async () => {
  const { withProofVerification } = await import("../scripts/prover/proof-cache.js");
  const { BaseError, ContractFunctionRevertedError } = await import("viem");
  const dir = await mkdtemp(join(tmpdir(), "vendetta-proof-unknown-")),
    file = join(dir, "proof.json");
  const error = new BaseError("synthetic unknown revert", {
    cause: new ContractFunctionRevertedError({
      abi: openingAbi,
      data: "0x12345678",
      functionName: "check",
    }),
  });
  const events: string[] = [];
  try {
    await writeFile(file, "retained");
    await expect(
      withProofVerification(
        file,
        async () => {
          throw error;
        },
        (r) => events.push(r),
      ),
    ).rejects.toBe(error);
    expect(events).toEqual([]);
    expect(await readFile(file, "utf8")).toBe("retained");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("keeps the producer ABIs aligned with both consumers' declared error selectors", async () => {
  for (const [name, abi] of [
    ["MissionV2Consumer", openingAbi],
    ["InvalidPointV2Consumer", pointAbi],
  ] as const) {
    const source = await readFile(
      new URL(`../../../contracts/src/hidden/${name}.sol`, import.meta.url),
      "utf8",
    );
    const declared = [...source.matchAll(/\berror\s+(\w+)\(/g)].map((m) => m[1]!).sort();
    const actual = abi
      .filter((item) => item.type === "error")
      .map((item) => item.name)
      .sort();
    expect(actual).toEqual(declared);
  }
});
