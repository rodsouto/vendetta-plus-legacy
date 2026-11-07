import { readFile, rm } from "node:fs/promises";
import { BaseError, ContractFunctionRevertedError, type Hex } from "viem";
export interface CertificateArtifact {
  kind: "opening" | "invalid-point";
  statement: Hex;
  proof: Hex;
  publicInputs: string[];
  pre?: Hex;
  elapsedMs: number;
  setupManifestSha256: string;
}
// Structural/binding validation only; the consumer still verifies every proof.
export function validCertificateArtifact(
  value: unknown,
  expected: { kind: CertificateArtifact["kind"]; statement: Hex; setup: string },
): value is CertificateArtifact {
  if (!value || typeof value !== "object") return false;
  const p = value as CertificateArtifact;
  return (
    p.kind === expected.kind &&
    p.statement === expected.statement &&
    p.setupManifestSha256 === expected.setup &&
    typeof p.proof === "string" &&
    /^0x[0-9a-f]{768}$/i.test(p.proof) &&
    Array.isArray(p.publicInputs) &&
    p.publicInputs.length === (p.kind === "opening" ? 55 : 2) &&
    p.publicInputs.every((x, index) => {
      if (typeof x !== "string" || !/^(0|[1-9][0-9]*)$/.test(x) || x.length > 39) return false;
      // Match the consumers' public-word bounds before assembling H3 halves.
      const limit = p.kind === "opening" && [14, 45, 46, 50].includes(index) ? 2n : 1n << 128n;
      return BigInt(x) < limit;
    }) &&
    (p.kind !== "opening" || (typeof p.pre === "string" && /^0x[0-9a-f]{64}$/i.test(p.pre))) &&
    typeof p.elapsedMs === "number" &&
    Number.isFinite(p.elapsedMs) &&
    p.elapsedMs >= 0
  );
}
// Only call for this job's private cache output. I/O errors remain errors; invalid
// JSON or bindings are disposable cache misses, never authority or invalidity.
export async function cachedCertificate(
  file: string,
  expected: Parameters<typeof validCertificateArtifact>[1],
): Promise<CertificateArtifact | undefined> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  if (validCertificateArtifact(value, expected)) return value;
  await rm(file, { force: true });
}

// Evict only deterministic artifact rejection, not RPC outages or unfinished H3.
export type ProofRejection =
  | "InvalidProof"
  | "WrongStatement"
  | "NonCanonicalWord"
  | "InvalidExhaustionClaim"
  | "MismatchedScalar";
export async function withProofVerification<T>(
  file: string,
  verify: () => Promise<T>,
  onRejection?: (reason: ProofRejection) => void,
): Promise<T> {
  try {
    return await verify();
  } catch (error) {
    let reason: ProofRejection | undefined;
    if (
      error instanceof Error &&
      [
        "Proof/pre mismatch",
        "Prefix scalar mismatch",
        "Invalid point certificate rejected",
      ].includes(error.message)
    )
      reason = "InvalidProof";
    if (!reason && error instanceof BaseError) {
      const cause = error.walk((value) => value instanceof ContractFunctionRevertedError);
      const name =
        cause instanceof ContractFunctionRevertedError ? cause.data?.errorName : undefined;
      if (
        name &&
        [
          "InvalidProof",
          "WrongStatement",
          "NonCanonicalWord",
          "InvalidExhaustionClaim",
          "MismatchedScalar",
        ].includes(name)
      )
        reason = name as ProofRejection;
    }
    if (reason) {
      const failures = [error];
      try {
        onRejection?.(reason);
      } catch (reportError) {
        failures.push(reportError);
      }
      try {
        await rm(file, { force: true });
      } catch (cleanup) {
        failures.push(cleanup);
      }
      if (failures.length > 1)
        throw new AggregateError(failures, "Proof rejection and cache eviction failed", {
          cause: error,
        });
    }
    throw error;
  }
}
