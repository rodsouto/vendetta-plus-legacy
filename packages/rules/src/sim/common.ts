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

/** B-25: the player's own premium or the admin's global premium. */
export const isPremium = (w: World, p: Player, now: bigint) =>
  p.premiumUntil > now || w.globalPremiumUntil > now;

export const onVacation = (p: Player, now: bigint) => p.vacationUntil > now;
export const suspended = (p: Player, now: bigint) => p.suspendedUntil > now;

/** The player a live session key plays for, or undefined (B-15). */
export function sessionPlayer(w: World, caller: string, now: bigint): bigint | undefined {
  const s = w.sessions.get(caller);
  if (!s || s.until <= now) return undefined;
  return w.players.get(s.player)!.sessionEpoch === s.epoch ? s.player : undefined;
}

/** The player behind the caller: its controller, or a live session key. */
export function resolve(w: World, caller: string, now: bigint): Player {
  const pid = w.playerOf.get(caller) ?? sessionPlayer(w, caller, now) ?? fail("NotRegistered");
  return w.players.get(pid)!;
}

/** Account management (sessions, transfer) needs the controller itself, never a session key. */
export function controllerOnly(w: World, caller: string, now: bigint): Player {
  const pid = w.playerOf.get(caller);
  if (pid === undefined)
    fail(sessionPlayer(w, caller, now) !== undefined ? "NotController" : "NotRegistered");
  return w.players.get(pid)!;
}

/** The acting player; a player on vacation (D-18) or suspended (B-14) cannot act. */
export function active(w: World, controller: string, now: bigint): Player {
  const p = resolve(w, controller, now);
  if (onVacation(p, now)) fail("OnVacation");
  if (suspended(p, now)) fail("Suspended");
  return p;
}

export function owned(
  w: World,
  controller: string,
  buildingId: bigint,
  now: bigint,
): [Player, Building] {
  const p = active(w, controller, now);
  const b = w.buildings.get(buildingId) ?? fail("NotOwner");
  if (b.owner !== p.id) fail("NotOwner");
  return [p, b];
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
