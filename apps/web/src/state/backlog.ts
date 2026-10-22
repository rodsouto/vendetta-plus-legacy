// Sending behind the mission queue (B-08, B-22), kept free of React so it can be tested against
// the simulator: the reveals an operation can make in front of an action, and the retries with
// advance() when due missions piled up. A dev account sends the calls one by one, so the ones
// before a failing call stay committed: the plan goes on from a working copy of the world that
// gets those calls applied, never from the stale snapshot alone.
import { BaseError, ContractFunctionRevertedError, type Address } from "viem";
import { sim, type HiddenPlain } from "@vendetta/rules";
import { gameAbi } from "../chain/abi.js";
import { byArrival, cloneWorld } from "../chain/load.js";
import { NoAccountError, RevertedError, type Call } from "../account/signer.js";

/** advance() calls an action takes in front at most before it gives up on a backlog (B-08). */
export const MAX_BACKLOG_RETRIES = 3;

/** Then, missions processed one per operation before the last try (a heavy mission, B-08). */
export const MAX_SINGLE_ADVANCES = 8;

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
 * The hidden missions due by `at` that this client can open and the contract would accept in an
 * operation that processes `budget` due missions first (advance() calls in front), with their
 * reveal() calls in arrival order. Reveals go in order for a window and each one drains the queue
 * like an action (B-22): every candidate is tried on a copy of `world` after that budget, so one
 * held back by a parked mission ahead (OutOfOrder) or out of reach of the drain (Backlog) is left
 * out rather than making the whole batch revert. `backlog` says whether one was left out for the
 * latter: the operation needs more advances before it. `owner`: this player's missions only. An
 * unlimited budget projects the state after a full catch-up, not what one operation can do.
 */
export function revealPlan(
  world: sim.World,
  known: ReadonlyMap<string, HiddenPlain>,
  game: Address,
  at: bigint,
  { owner, budget = Infinity }: { owner?: bigint; budget?: number } = {},
): { accepted: Planned[]; backlog: boolean } {
  const w = cloneWorld(world);
  sim.processDue(w, at, Math.min(budget, Number.MAX_SAFE_INTEGER));
  const due = [...w.missions.values()]
    .filter(
      (m) =>
        m.hidden &&
        !m.returning &&
        m.arrival <= at &&
        known.has(m.commit) &&
        (owner === undefined || m.owner === owner),
    )
    .sort(byArrival);
  const accepted: Planned[] = [];
  let backlog = false;
  for (const m of due) {
    const p = known.get(m.commit)!;
    const reveal = (x: sim.World, t: bigint) => sim.reveal(x, m.id, p.kind, p.target, p.salt, t);
    try {
      reveal(w, at);
    } catch (e) {
      if (!(e instanceof sim.GameError)) throw e;
      if (e.code === "Backlog") backlog = true;
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
  return { accepted, backlog };
}

/**
 * Sends `calls` after the advances and the reveals they need, and resolves to the ids of the
 * missions it revealed. If due missions piled up, or more came due than the gas allowed for (B-08),
 * the operation reverts with Backlog: it is retried with one more advance() in front each time
 * (processing arrivals can bring their returns due too), the reveals planned again behind them.
 * When that is not enough (a heavy mission, a long backlog), missions are processed one per
 * operation before the last try. With no calls of its own (the reveals at arrival) a plan that is
 * empty for a backlog counts as that revert; one empty for an order hold does not.
 *
 * `submit` sends one operation and throws a RevertedError on a revert; when it sent the calls one
 * by one (a dev account), `failed` says how many landed before the revert: those are applied to
 * the working copy of `world`, so the next plan starts from the chain as it is. An action that
 * landed before a later call reverted is never retried. `clock` is the chain time now.
 */
export async function sendBehindQueue({
  world,
  known,
  game,
  owner,
  calls,
  submit,
  clock,
}: {
  world: sim.World | undefined;
  known: ReadonlyMap<string, HiddenPlain>;
  game: Address;
  owner?: bigint;
  calls: Call[];
  submit: (calls: Call[]) => Promise<void>;
  clock: () => bigint;
}): Promise<bigint[]> {
  const w = world ? cloneWorld(world) : undefined;
  const advance = advanceCall(game, sim.MAX_MISSIONS_PER_TX);
  const one = advanceCall(game, 1);
  const plan = (at: bigint, budget: number) =>
    w ? revealPlan(w, known, game, at, { owner, budget }) : { accepted: [], backlog: false };
  for (let advances = 0, tries = 0; ; tries++) {
    const at = clock();
    const { accepted, backlog } = plan(at, advances * sim.MAX_MISSIONS_PER_TX);
    const front = [...Array<Planned>(advances).fill(advance), ...accepted];
    try {
      if (calls.length === 0 && accepted.length === 0) {
        if (!backlog) return [];
        throw new RevertedError("Backlog");
      }
      await submit([...front.map((x) => x.call), ...calls]);
      return accepted.map((x) => x.id);
    } catch (e) {
      const landed = e instanceof RevertedError ? (e.failed ?? 0) : 0;
      if (landed > front.length) throw e; // the action itself landed: nothing to retry
      if (w) for (const x of front.slice(0, landed)) x.apply(w, at);
      if (errorName(e) !== "Backlog") throw e;
      if (tries < MAX_BACKLOG_RETRIES) {
        advances++;
        continue;
      }
      if (tries > MAX_BACKLOG_RETRIES) throw e;
      // One mission per operation until the queue is caught up, then the action alone.
      for (let i = 0; i < MAX_SINGLE_ADVANCES; i++) {
        await submit([one.call]);
        if (w) one.apply(w, clock());
      }
      advances = 0;
    }
  }
}
