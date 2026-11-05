// Sending behind the mission queue (B-08, B-22), kept free of React so it can be tested against
// the simulator: an operation carries an advance() for the due missions the simulator counts and
// already certified arrivals in front of an action, and retries once on Backlog. Catching up a longer
// backlog is the keeper's job. A dev account sends the calls one by one, so the ones before a
// failing call stay committed: the retry plans from a working copy of the world that gets those
// calls applied, never from the stale snapshot alone.
import { BaseError, ContractFunctionRevertedError, type Address } from "viem";
import { sim } from "@vendetta/rules";
import { gameAbi } from "../chain/abi.js";
import { cloneWorld } from "../chain/load.js";
import { NoAccountError, RevertedError, type Call } from "../account/signer.js";

/**
 * The game functions that do not drain the mission queue (no `drained` in Game.sol): they go out
 * alone, so a backlog never delays a revocation or a cancellation (B-07, B-26).
 */
const UNDRAINED = new Set([
  "advance",
  "submitHiddenEvidence",
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

/** A queue advance and its effect on the reference world once committed. */
export interface Planned {
  call: Call;
  apply: (w: sim.World, at: bigint) => void;
}

const advanceCall = (game: Address, n: number): Planned => ({
  call: gameCall(game, "advance", [BigInt(n)]),
  apply: (w, at) => void sim.advance(w, n, at),
});

/** Count only due missions whose certificates are already recorded. */
export function queuePlan(world: sim.World, at: bigint): number {
  return sim.processDue(cloneWorld(world), at, Number.MAX_SAFE_INTEGER);
}

/** Sends actions behind certified arrivals; retries once on Backlog, preserving landed prefixes. */
export async function sendBehindQueue({
  world,
  game,
  calls,
  submit,
  clock,
}: {
  world: sim.World | undefined;
  game: Address;
  calls: Call[];
  submit: (calls: Call[]) => Promise<void>;
  clock: () => bigint | Promise<bigint>;
}): Promise<void> {
  if (calls.length > 0 && calls.every((c) => UNDRAINED.has(c.functionName))) {
    await submit(calls);
    return;
  }
  const commit = (landed: Planned[], at: bigint) => {
    for (const x of landed) {
      if (world) x.apply(world, at);
    }
  };
  for (let retried = false; ; retried = true) {
    const at = await clock();
    const due = world ? queuePlan(world, at) : 0;
    if (calls.length === 0 && due === 0) return;
    const front = due > 0 ? [advanceCall(game, due)] : [];
    try {
      await submit([...front.map((x) => x.call), ...calls]);
      commit(front, at);
      return;
    } catch (e) {
      const landed = e instanceof RevertedError ? (e.failed ?? 0) : 0;
      commit(front.slice(0, landed), at);
      if (landed > front.length) throw e; // the action itself landed: nothing to retry
      if (retried || errorName(e) !== "Backlog") throw e;
    }
  }
}
