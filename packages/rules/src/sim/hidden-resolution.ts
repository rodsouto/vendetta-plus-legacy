// Receipt lifecycle for the opt-in hidden v2 protocol.
// Only the adapter which verifies a certificate may call recordVerified.
export const PENDING = 1;
export const VALID = 2;
export const INVALID = 3;
export type ResolutionErrorCode =
  | "ResolutionAlreadyInitialized"
  | "ResolutionUnknown"
  | "ResolutionStatementMismatch"
  | "ResolutionConflict"
  | "ResolutionInvalidPlain"
  | "ResolutionPending"
  | "ResolutionNotDue"
  | "ResolutionConsumed";
export class ResolutionError extends Error {
  constructor(readonly code: ResolutionErrorCode) {
    super(code);
  }
}
export interface HiddenResolution {
  readonly statement: string;
  readonly arrival: bigint;
  readonly seq: bigint;
  status: number;
  consumed: boolean;
  plain: Uint8Array;
}
function fail(code: ResolutionErrorCode): never {
  throw new ResolutionError(code);
}
function root(value: string): string {
  if (!/^0x[0-9a-f]{64}$/i.test(value)) throw new RangeError("statement must be bytes32");
  return value.toLowerCase();
}
export function initialize(
  existing: HiddenResolution | undefined,
  statement: string,
  arrival: bigint,
  seq: bigint,
): HiddenResolution {
  if (existing) fail("ResolutionAlreadyInitialized");
  if (arrival < 0n || arrival >= 1n << 40n || seq < 0n || seq >= 1n << 64n)
    throw new RangeError("resolution timing outside ABI domain");
  return {
    statement: root(statement),
    arrival,
    seq,
    status: PENDING,
    consumed: false,
    plain: new Uint8Array(),
  };
}
function known(entry: HiddenResolution | undefined): HiddenResolution {
  if (!entry) fail("ResolutionUnknown");
  return entry;
}
/** Records evidence only; no deadline, drain, queue, battle or return is executed here. */
export function recordVerified(
  entry: HiddenResolution | undefined,
  statement: string,
  valid: boolean,
  plain: Uint8Array,
): boolean {
  const e = known(entry);
  if (root(statement) !== e.statement) fail("ResolutionStatementMismatch");
  if (
    !(plain instanceof Uint8Array) ||
    (valid ? plain.length !== 37 || plain[0] !== 2 : plain.length !== 0)
  )
    fail("ResolutionInvalidPlain");
  const status = valid ? VALID : INVALID;
  if (e.status !== PENDING) {
    if (
      e.status !== status ||
      e.plain.length !== plain.length ||
      e.plain.some((b, i) => b !== plain[i])
    )
      fail("ResolutionConflict");
    return false;
  }
  e.status = status;
  e.plain = Uint8Array.from(plain);
  return true;
}
/** The caller must enforce the event's dependency frontier before consuming it. */
export function consume(
  entry: HiddenResolution | undefined,
  now: bigint,
): { status: number; arrival: bigint; seq: bigint; plain: Uint8Array } {
  const e = known(entry);
  if (e.consumed) fail("ResolutionConsumed");
  if (e.status === PENDING) fail("ResolutionPending");
  if (now < e.arrival) fail("ResolutionNotDue");
  e.consumed = true;
  return { status: e.status, arrival: e.arrival, seq: e.seq, plain: Uint8Array.from(e.plain) };
}
