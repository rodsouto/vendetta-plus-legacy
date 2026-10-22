// Account: vacation (D-18), sanctions (B-14), premium (B-25), transfer, controllers and sessions
// (B-15, B-26). An address joins an account only by accepting an invitation itself: nobody binds
// an address it does not hold. Mirrors contracts/src/core/Account.sol.
import {
  active,
  atomic,
  controllerOnly,
  onVacation,
  resolve,
  sessionPlayer,
  suspended,
} from "./common.js";
import { drain } from "./missions.js";
import { fail } from "./errors.js";
import { INVITE_CONTROLLER, INVITE_SESSION, inviteKey, type Player, type World } from "./state.js";

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
  p.vacationSeq = w.seq++; // ordered against sends in the same second (B-07, B-22)
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

const player = (w: World, id: bigint): Player => w.players.get(id) ?? fail("NotRegistered");

/**
 * Schedules giving the whole account to `to`, an address that controls no player (B-26); once
 * due, `to` accepts with acceptTransfer and becomes the only controller. A different `to`
 * re-schedules; the same one while pending is a mistake. Any controller cancels meanwhile.
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
  free(w, to, now);
  if (p.transferTo === to) fail("TransferPending");
  p.transferTo = to;
  p.transferAt = now + w.rs.config.controllerRemovalDelay;
});

/**
 * The target of a scheduled transfer takes the account once the delay has passed: every previous
 * controller leaves and every session dies. The player must be active (B-14).
 */
export const acceptTransfer = atomic(function acceptTransfer(
  w: World,
  caller: string,
  pid: bigint,
  now: bigint,
): void {
  drain(w, now);
  const p = player(w, pid);
  if (p.transferTo !== caller) fail("NoTransfer");
  if (now < p.transferAt) fail("TransferPending");
  if (onVacation(p, now)) fail("OnVacation");
  if (suspended(p, now)) fail("Suspended");
  free(w, caller, now); // checked again now
  for (const c of p.controllers) w.playerOf.delete(c);
  w.playerOf.set(caller, p.id);
  p.controllers = [caller];
  p.removalAt = new Map();
  p.recovery = new Set();
  p.transferTo = "";
  p.transferAt = 0n;
  p.sessionEpoch += 1n; // sessions and invitations of the previous owners stop working
});

/** Any controller drops the pending transfer. Works while locked. */
export const cancelTransfer = atomic(function cancelTransfer(
  w: World,
  controller: string,
  now: bigint,
): void {
  const p = controllerOnly(w, controller, now);
  if (p.transferTo === "") fail("NoTransfer");
  p.transferTo = "";
  p.transferAt = 0n;
});

/**
 * A controller invites another address (B-26): a new device's passkey account or a recovery code
 * (`recovery`, kept so every device labels it right). The address joins only when it accepts,
 * within the invitation's life and while the player's epoch is the same. Allowed while locked.
 */
export const inviteController = atomic(function inviteController(
  w: World,
  controller: string,
  added: string,
  recovery: boolean,
  now: bigint,
): void {
  drain(w, now);
  const p = controllerOnly(w, controller, now);
  free(w, added, now);
  w.invites.set(inviteKey(added, p.id), {
    kind: INVITE_CONTROLLER,
    recovery,
    until: now + w.rs.config.inviteTtl,
    epoch: p.sessionEpoch,
  });
});

/** The invited address joins the player as a controller. All controllers are equal. */
export const acceptController = atomic(function acceptController(
  w: World,
  caller: string,
  pid: bigint,
  now: bigint,
): void {
  drain(w, now);
  const p = player(w, pid);
  const key = inviteKey(caller, pid);
  const inv = w.invites.get(key);
  if (!inv || inv.kind !== INVITE_CONTROLLER || now >= inv.until || inv.epoch !== p.sessionEpoch)
    fail("NoInvite");
  free(w, caller, now);
  if (p.controllers.length >= w.rs.config.maxControllers) fail("TooManyControllers");
  w.invites.delete(key);
  p.controllers.push(caller);
  w.playerOf.set(caller, p.id);
  if (inv.recovery) p.recovery.add(caller);
});

/** Any controller drops an invitation (session or controller) it made to `invited`. */
export const cancelInvite = atomic(function cancelInvite(
  w: World,
  controller: string,
  invited: string,
  now: bigint,
): void {
  const p = controllerOnly(w, controller, now);
  const key = inviteKey(invited, p.id);
  if (!w.invites.has(key)) fail("NoInvite");
  w.invites.delete(key);
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
  const p = controllerOnly(w, controller, now);
  if (!p.removalAt.has(removed)) fail("NoRemoval");
  p.removalAt.delete(removed);
});

/**
 * The controller invites `session` to play for it until `until` (B-15): every game action, but
 * never account management. The session binds when it accepts. Renewing is inviting again.
 * Allowed while locked, like ending a vacation.
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
  w.invites.set(inviteKey(session, p.id), {
    kind: INVITE_SESSION,
    recovery: false,
    until,
    epoch: p.sessionEpoch,
  });
});

/** The invited session starts playing for the player, until the invitation's deadline. */
export const acceptSession = atomic(function acceptSession(
  w: World,
  caller: string,
  pid: bigint,
  now: bigint,
): void {
  drain(w, now);
  const p = player(w, pid);
  const key = inviteKey(caller, pid);
  const inv = w.invites.get(key);
  if (!inv || inv.kind !== INVITE_SESSION || now >= inv.until || inv.epoch !== p.sessionEpoch)
    fail("NoInvite");
  const taken = sessionPlayer(w, caller, now);
  if (w.playerOf.has(caller) || (taken !== undefined && taken !== pid)) fail("ControllerTaken");
  w.invites.delete(key);
  w.sessions.set(caller, { player: pid, until: inv.until, epoch: p.sessionEpoch });
});

/** A controller ends a session of its player. Never drains the queue (B-26). */
export const revokeSession = atomic(function revokeSession(
  w: World,
  controller: string,
  session: string,
  now: bigint,
): void {
  const p = controllerOnly(w, controller, now);
  if (w.sessions.get(session)?.player !== p.id) fail("NotAllowed");
  w.sessions.delete(session);
});
