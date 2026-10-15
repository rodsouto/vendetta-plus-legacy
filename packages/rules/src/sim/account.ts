// Account: vacation (D-18), sanctions (B-14), premium (B-25) and transfer (B-26). Mirrors
// contracts/src/core/Account.sol.
import { active, atomic, controllerOnly, onVacation, resolve, sessionPlayer } from "./common.js";
import { drain } from "./missions.js";
import { fail } from "./errors.js";
import type { World } from "./state.js";

/** 15 days; needs no own missions in flight and 7 days since the last vacation ended. */
export const startVacation = atomic(function startVacation(
  w: World,
  controller: string,
  now: bigint,
): void {
  drain(w, now);
  const p = active(w, controller, now);
  if (p.missions > 0n) fail("MissionsInFlight");
  if (p.vacationUntil > 0n && now < p.vacationUntil + w.rs.config.vacationCooldownSeconds)
    fail("VacationCooldown");
  p.vacationUntil = now + w.rs.config.vacationSeconds;
});

/** Ends the vacation now; the cooldown counts from here. */
export const endVacation = atomic(function endVacation(
  w: World,
  controller: string,
  now: bigint,
): void {
  drain(w, now);
  const p = resolve(w, controller, now);
  if (!onVacation(p, now)) fail("NotOnVacation");
  p.vacationUntil = now;
});

/** Arbiter (admin in v1): suspend until `until`; 0 lifts it. */
export const suspend = atomic(function suspend(w: World, player: bigint, until: bigint): void {
  const p = w.players.get(player) ?? fail("NotRegistered");
  p.suspendedUntil = until;
});

/** Admin: premium for one player until `until` (paid off-chain). */
export const grantPremium = atomic(function grantPremium(
  w: World,
  player: bigint,
  until: bigint,
): void {
  const p = w.players.get(player) ?? fail("NotRegistered");
  p.premiumUntil = until;
});

/** Give the whole account to another address that controls no player. */
export const transferPlayer = atomic(function transferPlayer(
  w: World,
  controller: string,
  to: string,
  now: bigint,
): void {
  drain(w, now);
  controllerOnly(w, controller, now);
  const p = active(w, controller, now);
  if (to === "" || w.playerOf.has(to) || sessionPlayer(w, to, now) !== undefined)
    fail("ControllerTaken");
  w.playerOf.delete(controller);
  w.playerOf.set(to, p.id);
  p.controller = to;
  p.sessionEpoch += 1n; // sessions authorized by the previous owner stop working
});

/**
 * The controller lets `session` play for it until `until` (B-15): every game action, but never
 * account management. Allowed while locked, like ending a vacation.
 */
export const authorizeSession = atomic(function authorizeSession(
  w: World,
  controller: string,
  session: string,
  until: bigint,
  now: bigint,
): void {
  drain(w, now);
  const p = controllerOnly(w, controller, now);
  const taken = sessionPlayer(w, session, now);
  if (session === "" || w.playerOf.has(session) || (taken !== undefined && taken !== p.id))
    fail("ControllerTaken");
  if (until <= now) fail("InvalidSession");
  if (until - now > w.rs.config.maxSessionSeconds) fail("SessionTooLong");
  w.sessions.set(session, { player: p.id, until, epoch: p.sessionEpoch });
});

export const revokeSession = atomic(function revokeSession(
  w: World,
  controller: string,
  session: string,
  now: bigint,
): void {
  drain(w, now);
  const p = controllerOnly(w, controller, now);
  if (w.sessions.get(session)?.player !== p.id) fail("NotAllowed");
  w.sessions.delete(session);
});
