// Account: vacation (D-18), sanctions (B-14), premium (B-25), transfer and controllers (B-26).
// Mirrors contracts/src/core/Account.sol.
import { active, atomic, controllerOnly, onVacation, resolve, sessionPlayer } from "./common.js";
import { drain } from "./missions.js";
import { fail } from "./errors.js";
import type { World } from "./state.js";

/**
 * 15 days; needs no own missions in flight, 7 days since the last vacation ended, no registered
 * trade debt and no accepted trade whose window is still open (D-19, B-11).
 */
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
  if (p.debts > 0) fail("InDebt");
  if (now <= p.tradeLockUntil) fail("TradeOpen");
  p.vacationUntil = now + w.rs.config.vacationSeconds;
  p.vacationStart = now;
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

/** An address that can manage an account: not empty, no player's controller, no live session. */
function free(w: World, a: string, now: bigint): void {
  if (a === "" || w.playerOf.has(a) || sessionPlayer(w, a, now) !== undefined)
    fail("ControllerTaken");
}

/**
 * Give the whole account to another address that controls no player, in two steps (B-26): the
 * first call schedules it, the same call once due executes it and `to` becomes the only
 * controller; a different `to` re-schedules. Any controller cancels meanwhile.
 */
export const transferPlayer = atomic(function transferPlayer(
  w: World,
  controller: string,
  to: string,
  now: bigint,
): void {
  drain(w, now);
  controllerOnly(w, controller, now);
  const p = active(w, controller, now);
  free(w, to, now); // when scheduled and again when executed
  if (p.transferTo !== to) {
    p.transferTo = to;
    p.transferAt = now + w.rs.config.controllerRemovalDelay;
    return;
  }
  if (now < p.transferAt) fail("TransferPending");
  for (const c of p.controllers) w.playerOf.delete(c);
  w.playerOf.set(to, p.id);
  p.controllers = [to];
  p.removalAt = new Map();
  p.recovery = new Set();
  p.transferTo = "";
  p.transferAt = 0n;
  p.sessionEpoch += 1n; // sessions authorized by the previous owners stop working
});

/** Any controller drops the pending transfer. Works while locked. */
export const cancelTransfer = atomic(function cancelTransfer(
  w: World,
  controller: string,
  now: bigint,
): void {
  drain(w, now);
  const p = controllerOnly(w, controller, now);
  if (p.transferTo === "") fail("NoTransfer");
  p.transferTo = "";
  p.transferAt = 0n;
});

/**
 * A controller adds another one (B-26): a new device's passkey account or a recovery code
 * (`recovery`, kept so every device labels it right). All controllers are equal. Allowed while
 * locked, like sessions.
 */
export const addController = atomic(function addController(
  w: World,
  controller: string,
  added: string,
  recovery: boolean,
  now: bigint,
): void {
  drain(w, now);
  const p = controllerOnly(w, controller, now);
  free(w, added, now);
  if (p.controllers.length >= w.rs.config.maxControllers) fail("TooManyControllers");
  p.controllers.push(added);
  w.playerOf.set(added, p.id);
  if (recovery) p.recovery.add(added);
});

/**
 * A controller removes itself at once, never the last. Removing another one takes two steps
 * (B-26): the first call schedules it after the delay and kills every session (a lost device's
 * too; the remaining devices authorize theirs again); the same call once due executes it, killing
 * the sessions again. Before that it fails with RemovalPending. The targeted controller keeps
 * every right meanwhile, cancelling included.
 */
export const removeController = atomic(function removeController(
  w: World,
  controller: string,
  removed: string,
  now: bigint,
): void {
  drain(w, now);
  const p = controllerOnly(w, controller, now);
  const i = p.controllers.indexOf(removed);
  if (i < 0) fail("NotAllowed");
  if (p.controllers.length === 1) fail("LastController"); // only reachable removing oneself
  if (removed !== controller) {
    const at = p.removalAt.get(removed);
    if (at === undefined) {
      p.removalAt.set(removed, now + w.rs.config.controllerRemovalDelay);
      p.sessionEpoch += 1n;
      return;
    }
    if (now < at) fail("RemovalPending");
  }
  // Swap with the last and pop, as the contract does.
  p.controllers[i] = p.controllers[p.controllers.length - 1]!;
  p.controllers.pop();
  w.playerOf.delete(removed);
  p.removalAt.delete(removed);
  p.recovery.delete(removed);
  p.sessionEpoch += 1n;
});

/** Any controller (the targeted one included) drops a scheduled removal. Works while locked. */
export const cancelRemoval = atomic(function cancelRemoval(
  w: World,
  controller: string,
  removed: string,
  now: bigint,
): void {
  drain(w, now);
  const p = controllerOnly(w, controller, now);
  if (!p.removalAt.has(removed)) fail("NoRemoval");
  p.removalAt.delete(removed);
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
