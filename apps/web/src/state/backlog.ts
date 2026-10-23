// Sending behind the mission queue (B-08, B-22), kept free of React so it can be tested against
// the simulator: an operation carries an advance() for the due missions the simulator counts and
// the reveals it can make in front of an action, and retries once on Backlog. Catching up a longer
// backlog is the keeper's job. A dev account sends the calls one by one, so the ones before a
// failing call stay committed: the retry plans from a working copy of the world that gets those
// calls applied, never from the stale snapshot alone.
import { BaseError, ContractFunctionRevertedError, type Address } from "viem";
import { sim, type HiddenPlain } from "@vendetta/rules";
import { gameAbi } from "../chain/abi.js";
import { byArrival, cloneWorld } from "../chain/load.js";
import { NoAccountError, RevertedError, type Call } from "../account/signer.js";

/**
 * The game functions that do not drain the mission queue (no `drained` in Game.sol): they go out
 * alone, so a backlog never delays a revocation or a cancellation (B-07, B-26).
 */
const UNDRAINED = new Set([
  "advance",
  "forfeit",
  "cancelInvite",
  "cancelRemoval",
  "cancelTransfer",
  "revokeSession",
  "setGlobalPremium",
  "suspend",
  "grantPremium",
]);

/** A passkey prompt the player dismissed (WebAuthn's NotAllowedError, wrapped or not). */
export const cancelled = (e: unknown): boolean => {
  for (let x = e as { name?: string; cause?: unknown } | undefined; x; x = x.cause as never)
    if (x.name === "NotAllowedError") return true;
  return false;
};

/** The contract's custom error behind a failed send, "unknown" when there is none. */
export const errorName = (e: unknown): string => {
  if (cancelled(e)) return "cancelled";
  if (e instanceof NoAccountError) return "noAccount";
  if (e instanceof RevertedError) return e.errorName ?? "unknown";
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) return revert.data?.errorName ?? "unknown";
  }
  return "unknown";
};

export const gameCall = (game: Address, functionName: string, args: readonly unknown[]): Call => ({
  to: game,
  abi: gameAbi,
  functionName,
  args,
});

/** A call of the prefix, with its effect on the simulator once it is committed. */
export interface Planned {
  id: bigint; // the mission revealed, 0 for an advance
  call: Call;
  apply: (w: sim.World, at: bigint) => void;
}

const advanceCall = (game: Address, n: number): Planned => ({
  id: 0n,
  call: gameCall(game, "advance", [BigInt(n)]),
  apply: (w, at) => void sim.advance(w, n, at),
});

/**
 * What an operation sent at `at` makes in front of its calls: `due`, the missions the queue
 * processes first (one each, parked hidden ones and returns that come due on the way included),
 * which an advance(due) takes care of; then `accepted`, the reveal() calls of the hidden missions
 * due by `at` and within their grace that this client can open and the contract would accept, in
 * arrival order. Reveals go in order for a window and each one drains the queue like an action
 * (B-22): every candidate is tried on a copy of `world` after the advance, so one held back by a
 * parked mission ahead (OutOfOrder) is left out rather than making the whole batch revert.
 * `known` holds the player's own plaintexts: others' missions are revealed by their owner or the
 * keeper. The simulator has no gas: whether it all fits one operation is only known on sending.
 */
export function revealPlan(
  world: sim.World,
  known: ReadonlyMap<string, HiddenPlain>,
  game: Address,
  at: bigint,
): { due: number; accepted: Planned[] } {
  const w = cloneWorld(world);
  const due = sim.processDue(w, at, Number.MAX_SAFE_INTEGER);
  const grace = w.rs.config.hiddenRevealGrace;
  const candidates = [...w.missions.values()]
    .filter(
      (m) =>
        m.hidden &&
        !m.returning &&
        m.arrival <= at &&
        at < m.arrival + grace && // past it a reveal does nothing: the mission is forfeited
        known.has(m.commit),
    )
    .sort(byArrival);
  const accepted: Planned[] = [];
  for (const m of candidates) {
    const p = known.get(m.commit)!;
    const reveal = (x: sim.World, t: bigint) => sim.reveal(x, m.id, p.kind, p.target, p.salt, t);
    try {
      reveal(w, at);
    } catch (e) {
      if (!(e instanceof sim.GameError)) throw e;
      continue;
    }
    const { city, neighborhood, slot } = p.target;
    const salt = `0x${p.salt.toString(16).padStart(64, "0")}`;
    accepted.push({
      id: m.id,
      call: gameCall(game, "reveal", [m.id, p.kind, [city, neighborhood, slot], salt]),
      apply: (x, t) => {
        try {
          reveal(x, t);
        } catch (e) {
          if (!(e instanceof sim.GameError)) throw e; // the chain decided otherwise: fine
        }
      },
    });
  }
  return { due, accepted };
}

/**
 * Sends `calls` behind an advance() for the due missions and the reveals they can make
 * (revealPlan), and resolves to the ids of the missions it revealed. Calls that do not drain the
 * queue go out alone. On Backlog (missions came due between the plan and the block, the snapshot
 * missed some, or they do not fit the gas, B-08) it plans again at a fresh `clock` and retries
 * once; then it fails and the keeper catches up the queue. With no calls of its own (the reveals
 * at arrival) and nothing to reveal it sends nothing.
 *
 * `world` is a working copy: the advance and the reveals that land are applied to it, so a caller
 * that sends again (the Workshop's warp) plans from the chain as it is. `submit` sends one
 * operation and throws a RevertedError on a revert; when it sent the calls one by one (a dev
 * account), `failed` says how many landed before the revert. An action that landed before a later
 * call reverted is never retried. `clock` is the chain time now: a fresh block's on a live chain,
 * so a reveal never leaves before its mission arrived on chain (B-22).
 */
export async function sendBehindQueue({
  world,
  known,
  game,
  calls,
  submit,
  clock,
}: {
  world: sim.World | undefined;
  known: ReadonlyMap<string, HiddenPlain>;
  game: Address;
  calls: Call[];
  submit: (calls: Call[]) => Promise<void>;
  clock: () => bigint | Promise<bigint>;
}): Promise<bigint[]> {
  if (calls.length > 0 && calls.every((c) => UNDRAINED.has(c.functionName))) {
    await submit(calls);
    return [];
  }
  const revealed: bigint[] = [];
  const commit = (landed: Planned[], at: bigint) => {
    for (const x of landed) {
      if (world) x.apply(world, at);
      if (x.id !== 0n) revealed.push(x.id);
    }
  };
  for (let retried = false; ; retried = true) {
    const at = await clock();
    const { due, accepted } = world ? revealPlan(world, known, game, at) : { due: 0, accepted: [] };
    if (calls.length === 0 && accepted.length === 0) return revealed;
    const front = [...(due > 0 ? [advanceCall(game, due)] : []), ...accepted];
    try {
      await submit([...front.map((x) => x.call), ...calls]);
      commit(front, at);
      return revealed;
    } catch (e) {
      const landed = e instanceof RevertedError ? (e.failed ?? 0) : 0;
      commit(front.slice(0, landed), at);
      if (landed > front.length) throw e; // the action itself landed: nothing to retry
      if (retried || errorName(e) !== "Backlog") throw e;
    }
  }
}
