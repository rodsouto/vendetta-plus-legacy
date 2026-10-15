// Player actions of the core module (register, room and research queues), with the same checks and
// errors as contracts/src/core/Core.sol. Each action settles what it reads first (B-06).
import { fail } from "./errors.js";
import {
  credit,
  pay,
  researchJob,
  roomJob,
  settle,
  startNextResearch,
  startNextRoom,
  affordable,
} from "./settle.js";
import { coordKey, stockScale, type Building, type Player, type World } from "./state.js";
import type { Requirement } from "../ruleset.js";

export interface Coord {
  city: bigint;
  neighborhood: bigint;
  slot: bigint;
}

/**
 * Run an action like a transaction: if it fails, every change it made (including settlement done
 * before the failing check) is rolled back, as the EVM does on revert.
 */
function atomic<A extends unknown[], R>(fn: (w: World, ...args: A) => R) {
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
const isPremium = (w: World, _p: Player, now: bigint) => w.globalPremiumUntil > now;

function owned(w: World, controller: string, buildingId: bigint): [Player, Building] {
  const pid = w.playerOf.get(controller) ?? fail("NotRegistered");
  const b = w.buildings.get(buildingId) ?? fail("NotOwner");
  if (b.owner !== pid) fail("NotOwner");
  return [w.players.get(pid)!, b];
}

/** Settle the building and, if the player researches elsewhere, that building too. */
function settleForAction(w: World, p: Player, b: Building, now: bigint): void {
  settle(w, b, now);
  if (p.researchBuilding !== 0n && p.researchBuilding !== b.id) {
    settle(w, w.buildings.get(p.researchBuilding)!, now);
  }
}

function met(p: Player, b: Building, reqs: Requirement[]): boolean {
  return reqs.every(
    (r) => (r.kind === "room" ? b.levels[r.index]! : p.research[r.index]!) >= r.level,
  );
}

export const register = atomic(function register(
  w: World,
  controller: string,
  coord: Coord,
  now: bigint,
): bigint {
  const c = w.rs.config;
  if (w.playerOf.has(controller)) fail("AlreadyRegistered");
  if (
    coord.city < 1n ||
    coord.city > c.cities ||
    coord.neighborhood < 1n ||
    coord.neighborhood > c.neighborhoods ||
    coord.slot < 1n ||
    coord.slot > c.slots
  )
    fail("InvalidCoordinate");
  const key = coordKey(coord);
  if (w.buildingAt.has(key)) fail("SlotTaken");

  const pid = w.nextPlayer++;
  const bid = w.nextBuilding++;
  const levels = w.rs.buildings.map(() => 0n);
  levels[w.rs.roles.buildSpeedRoom] = c.startBuildSpeedLevel;
  const centipoints = levels.reduce((s, l, i) => s + l * w.rs.buildings[i]!.centipoints, 0n);
  const b: Building = {
    id: bid,
    owner: pid,
    coord: { ...coord },
    levels,
    stock: w.rs.resources.map(() => 0n),
    lastUpdate: now,
    roomQueue: [],
    centipoints,
  };
  credit(w, b, Object.fromEntries(w.rs.resources.map((r) => [r, c.startResources])));
  w.buildings.set(bid, b);
  w.buildingAt.set(key, bid);
  w.players.set(pid, {
    id: pid,
    controller,
    research: w.rs.research.map(() => 0n),
    researchQueue: [],
    researchBuilding: 0n,
    buildings: 1n,
    centipoints,
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
  const [p, b] = owned(w, controller, buildingId);
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
  const [p, b] = owned(w, controller, buildingId);
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
  const [p, b] = owned(w, controller, buildingId);
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
  const [p, b] = owned(w, controller, buildingId);
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
  const b = w.buildings.get(buildingId) ?? fail("UnknownEntity");
  settle(w, b, now);
});

/** Visible (whole) stock of a building, per resource. */
export const visibleStock = (w: World, b: Building) => b.stock.map((s) => s / stockScale(w.rs));
