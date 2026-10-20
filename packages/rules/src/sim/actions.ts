// Player actions of the core module (register, room and research queues), with the same checks and
// errors as contracts/src/core/Core.sol. Each action settles what it reads first (B-06).
import { fail } from "./errors.js";
import {
  credit,
  newBuilding,
  pay,
  researchJob,
  roomJob,
  settle,
  startNextResearch,
  startNextRoom,
  affordable,
} from "./settle.js";
import { coordKey, stockScale, type Building, type Player, type World } from "./state.js";
import { drain } from "./missions.js";
import {
  atomic,
  isPremium,
  met,
  owned,
  sessionPlayer,
  settleForAction,
  type Coord,
} from "./common.js";

export const register = atomic(function register(
  w: World,
  controller: string,
  coord: Coord,
  now: bigint,
): bigint {
  drain(w, now); // an occupation that already arrived may take the slot first
  const c = w.rs.config;
  if (w.playerOf.has(controller) || sessionPlayer(w, controller, now) !== undefined)
    fail("AlreadyRegistered");
  if (
    coord.city < 1n ||
    coord.city > c.cities ||
    coord.neighborhood < 1n ||
    coord.neighborhood > c.neighborhoods ||
    coord.slot < 1n ||
    coord.slot > c.slots
  )
    fail("InvalidCoordinate");
  if (w.buildingAt.has(coordKey(coord))) fail("SlotTaken");

  const pid = w.nextPlayer++;
  const b = newBuilding(w, pid, coord, c.startBuildSpeedLevel, c.startResources, now);
  w.players.set(pid, {
    id: pid,
    controllers: [controller],
    research: w.rs.research.map(() => 0n),
    researchQueue: [],
    researchBuilding: 0n,
    buildings: 1n,
    centipoints: b.centipoints,
    missions: 0n,
    vacationUntil: 0n,
    vacationStart: 0n,
    suspendedUntil: 0n,
    premiumUntil: 0n,
    family: 0n,
    rank: 0,
    applications: [],
    offers: [],
    sessionEpoch: 0n,
  });
  w.playerOf.set(controller, pid);
  return pid;
});

export const queueRoom = atomic(function queueRoom(
  w: World,
  controller: string,
  buildingId: bigint,
  room: number,
  now: bigint,
): void {
  drain(w, now);
  const [p, b] = owned(w, controller, buildingId, now);
  const def = w.rs.buildings[room] ?? fail("UnknownEntity");
  settleForAction(w, p, b, now);
  if (!met(p, b, def.requirements)) fail("RequirementsNotMet");
  if (b.roomQueue.length >= w.rs.config.roomQueue[isPremium(w, p, now) ? 1 : 0]) fail("QueueFull");
  const item = { index: room, seq: w.seq++, finishAt: 0n };
  if (b.roomQueue.length === 0) {
    const job = roomJob(w, b, room);
    if (!affordable(w, b, job.cost)) fail("CannotAfford");
    pay(w, b, job.cost);
    item.finishAt = now + job.seconds;
  }
  b.roomQueue.push(item);
});

export const queueResearch = atomic(function queueResearch(
  w: World,
  controller: string,
  buildingId: bigint,
  research: number,
  now: bigint,
): void {
  drain(w, now);
  const [p, b] = owned(w, controller, buildingId, now);
  const def = w.rs.research[research] ?? fail("UnknownEntity");
  settleForAction(w, p, b, now);
  if (p.researchBuilding !== 0n && p.researchBuilding !== b.id) fail("ResearchElsewhere");
  if (b.levels[w.rs.roles.researchSpeedRoom]! < 1n) fail("TimingRoomRequired"); // D-14
  if (!met(p, b, def.requirements)) fail("RequirementsNotMet");
  if (p.researchQueue.length >= w.rs.config.researchQueue[isPremium(w, p, now) ? 1 : 0])
    fail("QueueFull");
  const item = { index: research, seq: w.seq++, finishAt: 0n };
  if (p.researchQueue.length === 0) {
    const job = researchJob(w, p, b, research);
    if (!affordable(w, b, job.cost)) fail("CannotAfford");
    pay(w, b, job.cost);
    item.finishAt = now + job.seconds;
    p.researchBuilding = b.id;
  }
  p.researchQueue.push(item);
});

/** Cancel the room item at `position`: the one in progress is refunded and the next one starts. */
export const cancelRoom = atomic(function cancelRoom(
  w: World,
  controller: string,
  buildingId: bigint,
  position: number,
  now: bigint,
): void {
  drain(w, now);
  const [p, b] = owned(w, controller, buildingId, now);
  settleForAction(w, p, b, now);
  if (position < 0 || position >= b.roomQueue.length) fail("NothingToCancel");
  if (position === 0) {
    credit(w, b, roomJob(w, b, b.roomQueue[0]!.index).cost);
    b.roomQueue.shift();
    startNextRoom(w, b, now);
  } else {
    b.roomQueue.splice(position, 1);
  }
});

export const cancelResearch = atomic(function cancelResearch(
  w: World,
  controller: string,
  buildingId: bigint,
  position: number,
  now: bigint,
): void {
  drain(w, now);
  const [p, b] = owned(w, controller, buildingId, now);
  settleForAction(w, p, b, now);
  if (p.researchBuilding !== b.id || position < 0 || position >= p.researchQueue.length)
    fail("NothingToCancel");
  if (position === 0) {
    credit(w, b, researchJob(w, p, b, p.researchQueue[0]!.index).cost);
    p.researchQueue.shift();
    startNextResearch(w, p, b, now);
  } else {
    p.researchQueue.splice(position, 1);
  }
});

/** Admin only: premium for every player until `until` (B-25). */
export const setGlobalPremium = atomic(function setGlobalPremium(w: World, until: bigint): void {
  w.globalPremiumUntil = until;
});

/** Anyone can bring a building up to date. */
export const poke = atomic(function poke(w: World, buildingId: bigint, now: bigint): void {
  drain(w, now);
  const b = w.buildings.get(buildingId) ?? fail("UnknownEntity");
  settle(w, b, now);
});

/** Visible (whole) stock of a building, per resource. */
export const visibleStock = (w: World, b: Building) => b.stock.map((s) => s / stockScale(w.rs));
