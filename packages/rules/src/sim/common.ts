// Helpers shared by the simulator actions.
import type { Requirement } from "../ruleset.js";
import { fail } from "./errors.js";
import { settle } from "./settle.js";
import type { Building, Player, World } from "./state.js";

export interface Coord {
  city: bigint;
  neighborhood: bigint;
  slot: bigint;
}

/**
 * Run an action like a transaction: if it fails, every change it made (including settlement done
 * before the failing check) is rolled back, as the EVM does on revert.
 */
export function atomic<A extends unknown[], R>(fn: (w: World, ...args: A) => R) {
  return (w: World, ...args: A): R => {
    const { rs, ...rest } = w;
    const saved = structuredClone(rest);
    try {
      return fn(w, ...args);
    } catch (e) {
      Object.assign(w, saved, { rs });
      throw e;
    }
  };
}

/** B-25. Per-player premium arrives in 3c; for now only the admin's global premium. */
export const isPremium = (w: World, _p: Player, now: bigint) => w.globalPremiumUntil > now;

export function owned(w: World, controller: string, buildingId: bigint): [Player, Building] {
  const pid = w.playerOf.get(controller) ?? fail("NotRegistered");
  const b = w.buildings.get(buildingId) ?? fail("NotOwner");
  if (b.owner !== pid) fail("NotOwner");
  return [w.players.get(pid)!, b];
}

/** Settle the building and, if the player researches elsewhere, that building too. */
export function settleForAction(w: World, p: Player, b: Building, now: bigint): void {
  settle(w, b, now);
  if (p.researchBuilding !== 0n && p.researchBuilding !== b.id) {
    settle(w, w.buildings.get(p.researchBuilding)!, now);
  }
}

export function met(p: Player, b: Building, reqs: Requirement[]): boolean {
  return reqs.every(
    (r) => (r.kind === "room" ? b.levels[r.index]! : p.research[r.index]!) >= r.level,
  );
}
