// Binding/ingress for the opt-in v2 world admission.
import * as context from "./hidden-context.js";
import { atomic } from "./common.js";
import type { World } from "./state.js";
import * as resolution from "./hidden-resolution.js";
export interface HiddenEvidence {
  receipt: resolution.HiddenResolution;
  readonly openingConsumer: string;
  readonly invalidPointConsumer: string;
  cancelled: boolean;
}
export class EvidenceError extends Error {
  constructor(
    readonly code:
      | "ResolutionInvalidBinding"
      | "ResolutionInvalidProof"
      | "ResolutionCertificateRequired"
      | "ResolutionIdentityMismatch",
  ) {
    super(code);
  }
}
/** Synchronous trusted verification boundary for the reference model, not player authority. */
export interface EvidenceVerifier {
  opening(
    consumer: string,
    statement: string,
    proof: string,
    inputs: readonly bigint[],
  ): { valid: boolean; plain: Uint8Array };
  invalidPoint(
    consumer: string,
    statement: string,
    proof: string,
    inputs: readonly bigint[],
  ): boolean;
}
/** Admission-only helper; never convert an old/late v1 mission to historical v2. */
export function bindForAdmission(
  w: World,
  id: bigint,
  statement: string,
  opening: string,
  invalidPoint: string,
  now: bigint,
): void {
  const m = w.missions.get(id);
  const address = (value: string) => /^0x[0-9a-f]{40}$/i.test(value) && !/^0x0{40}$/i.test(value);
  if (
    !m ||
    !m.hidden ||
    m.returning ||
    !w.pending.includes(id) ||
    m.start !== now ||
    m.arrival <= now ||
    !address(opening) ||
    !address(invalidPoint)
  )
    throw new EvidenceError("ResolutionInvalidBinding");
  const existing = w.hiddenEvidence.get(id);
  const receipt = resolution.initialize(existing?.receipt, statement, m.arrival, m.seq);
  w.hiddenEvidence.set(id, {
    receipt,
    openingConsumer: opening.toLowerCase(),
    invalidPointConsumer: invalidPoint.toLowerCase(),
    cancelled: false,
  });
}
function active(w: World, id: bigint): HiddenEvidence | undefined {
  const e = w.hiddenEvidence.get(id);
  if (!e) throw new resolution.ResolutionError("ResolutionUnknown");
  const m = w.missions.get(id);
  return !e.cancelled && m?.hidden && !m.returning ? e : undefined;
}
export const submitOpening = atomic(function submitOpening(
  w: World,
  id: bigint,
  proof: string,
  inputs: readonly bigint[],
  verifier: EvidenceVerifier,
): boolean {
  const e = active(w, id);
  if (!e) return false;
  const result = verifier.opening(e.openingConsumer, e.receipt.statement, proof, inputs);
  return resolution.recordVerified(e.receipt, e.receipt.statement, result.valid, result.plain);
});
export const submitInvalidPoint = atomic(function submitInvalidPoint(
  w: World,
  id: bigint,
  proof: string,
  inputs: readonly bigint[],
  verifier: EvidenceVerifier,
): boolean {
  const e = active(w, id);
  if (!e) return false;
  if (!verifier.invalidPoint(e.invalidPointConsumer, e.receipt.statement, proof, inputs))
    throw new EvidenceError("ResolutionInvalidProof");
  return resolution.recordVerified(e.receipt, e.receipt.statement, false, new Uint8Array());
});

/** Decoded certificate dispatch matching Game's linked library; convenience methods use input words. */
export function submit(
  w: World,
  id: bigint,
  kind: number,
  proof: string,
  encoded: Uint8Array,
  verifier: EvidenceVerifier,
): boolean {
  if (!active(w, id)) return false;
  const length = kind === 1 ? 55 : kind === 2 ? 2 : 0;
  if (!length || encoded.length !== length * 32) throw new EvidenceError("ResolutionInvalidProof");
  const inputs: bigint[] = [];
  for (let i = 0; i < length; i++) {
    let value = 0n;
    for (const byte of encoded.subarray(i * 32, (i + 1) * 32)) value = value * 256n + BigInt(byte);
    inputs.push(value);
  }
  return kind === 1
    ? submitOpening(w, id, proof, inputs, verifier)
    : submitInvalidPoint(w, id, proof, inputs, verifier);
}

/** Internal sender helper: the host supplies its execution environment and approved consumers. */
export function bindPacketForAdmission(
  w: World,
  id: bigint,
  packet: Uint8Array,
  env: context.Environment,
  opening: string,
  invalidPoint: string,
  now: bigint,
): void {
  bindForAdmission(w, id, context.statement(w, id, packet, env), opening, invalidPoint, now);
}
