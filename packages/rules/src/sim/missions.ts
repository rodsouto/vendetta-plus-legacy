// Troops, missions and the global mission queue (blockchain.md B-07, B-08, B-22; 07-missions.md;
// 06-combat.md). Mirrors contracts/src/core/{Training,Missions,Battle}.sol: same checks, same order,
// same errors.
import { keccak_256 } from "@noble/hashes/sha3";
import { resolveBattle } from "../combat.js";
import { honorPct } from "../honor.js";
import { apportionLoot } from "../loot.js";
import { distance, maxDistanceFrom, missionSalary, travelSeconds } from "../map.js";
import { storage } from "../economy.js";
import { allTroopStats, troopStats } from "../stats.js";
import {
  active,
  atomic,
  isPremium,
  met,
  onVacation,
  owned,
  settleForAction,
  type Coord,
} from "./common.js";
import { fail } from "./errors.js";
import { warScore } from "./families.js";
import { settleTrade, tradeOpenFor, transportAllowed } from "./market.js";
import {
  affordable,
  credit,
  newBuilding,
  pay,
  settle,
  trainingSeconds,
  troopCentipoints,
} from "./settle.js";
import {
  ATTACK,
  OCCUPY,
  STATION,
  TRANSPORT,
  coordKey,
  stockScale,
  type Building,
  type Mission,
  type Player,
  type World,
} from "./state.js";

/** Missions processed by one action at most before it reverts with Backlog (B-08). */
export const MAX_MISSIONS_PER_TX = 10;

const before = (a: Mission, b: Mission) =>
  a.arrival < b.arrival || (a.arrival === b.arrival && a.seq < b.seq);

function enqueue(w: World, m: Mission): void {
  let i = w.pending.length;
  while (i > 0 && before(m, w.missions.get(w.pending[i - 1]!)!)) i--;
  w.pending.splice(i, 0, m.id);
}

function finish(w: World, m: Mission): void {
  w.missions.delete(m.id);
  w.players.get(m.owner)!.missions -= 1n;
}

/** Turn a mission around at `t`; a mission with no units left ends instead. */
function sendBack(w: World, m: Mission, t: bigint): void {
  if (m.troops.every((n) => n === 0n)) return finish(w, m);
  m.returning = true;
  m.start = t;
  m.arrival = t + m.duration;
  m.seq = w.seq++;
  enqueue(w, m);
}

/** Settle the research building of a player (if any) up to `t`, so research levels are current. */
function settleResearch(w: World, p: Player, t: bigint): void {
  if (p.researchBuilding !== 0n) settle(w, w.buildings.get(p.researchBuilding)!, t);
}

const honorOf = (w: World, p: Player) =>
  honorPct(w.rs, p.buildings, Number(p.research[w.rs.roles.honorResearch]!));

function battle(w: World, m: Mission, b: Building, t: bigint): void {
  const attacker = w.players.get(m.owner)!;
  const defender = w.players.get(b.owner)!;
  settleResearch(w, attacker, t);
  if (defender.researchBuilding !== b.id) settleResearch(w, defender, t);
  const sa = allTroopStats(w.rs, attacker.research);
  const sd = allTroopStats(w.rs, defender.research);
  const r = resolveBattle(
    w.rs,
    {
      count: m.troops,
      attack: sa.map((s) => s.attack),
      defense: sa.map((s) => s.defense),
      pct: honorOf(w, attacker),
    },
    {
      count: b.troops,
      attack: sd.map((s) => s.attack),
      defense: sd.map((s) => s.defense),
      pct: honorOf(w, defender),
    },
  );
  const lostA = troopCentipoints(
    w,
    m.troops.map((n, i) => n - r.attackerRemaining[i]!),
  );
  const lostD = troopCentipoints(
    w,
    b.troops.map((n, i) => n - r.defenderRemaining[i]!),
  );
  attacker.centipoints -= lostA;
  defender.centipoints -= lostD;
  warScore(w, attacker, defender, lostA, lostD);
  m.troops = r.attackerRemaining;
  b.troops = r.defenderRemaining;

  // Loot (D-06) only if the defender has no troops left.
  if (b.troops.every((n) => n === 0n)) {
    const capacity = m.troops.reduce(
      (s, n, i) => s + n * troopStats(w.rs, w.rs.troops[i]!, attacker.research).capacity,
      0n,
    );
    const scale = stockScale(w.rs);
    const unprotected = w.rs.resources.map((res, i) => {
      const room = w.rs.buildings.find((x) => x.storage?.resource === res);
      const safe = room
        ? storage(
            room.storage!.base,
            room.storage!.perLevel,
            room.storage!.safeDivisor,
            b.levels[room.index]!,
          ).safe
        : 0n;
      const have = b.stock[i]! / scale;
      return have > safe ? have - safe : 0n;
    });
    const order = w.rs.lootOrder.map((res) => w.rs.resources.indexOf(res));
    const loot = apportionLoot(
      capacity,
      order.map((i) => unprotected[i]!),
    );
    order.forEach((i, k) => {
      b.stock[i]! -= loot[k]! * scale;
      m.cargo[i]! += loot[k]!;
    });
  }
  sendBack(w, m, t);
}

/** A revealed hidden mission gives its bond back to the origin building, if still its own. */
function refundBond(w: World, m: Mission, t: bigint): void {
  const origin = w.buildings.get(m.origin);
  if (origin && origin.owner === m.owner) {
    settle(w, origin, t);
    const sr = w.rs.roles.salaryResource;
    credit(
      w,
      origin,
      Object.fromEntries(w.rs.resources.map((r, i) => [r, i === sr ? m.bond : 0n])),
    );
  }
  m.bond = 0n;
}

/** A due hidden mission still within its reveal grace stops the queue (B-22). */
const awaitingReveal = (w: World, m: Mission, now: bigint) =>
  m.hidden && !m.returning && now < m.arrival + w.rs.config.hiddenRevealGrace;

/** Resolve one mission at its arrival time (07-missions.md#arrival-rules). */
function process(w: World, m: Mission): void {
  const t = m.arrival;
  if (m.returning) {
    const origin = w.buildings.get(m.origin);
    const p = w.players.get(m.owner)!;
    if (origin && origin.owner === m.owner) {
      settle(w, origin, t);
      origin.troops = origin.troops.map((n, i) => n + m.troops[i]!);
      const back = m.cargo.map((n, i) => n + (i === w.rs.roles.salaryResource ? m.bond : 0n));
      credit(w, origin, Object.fromEntries(w.rs.resources.map((r, i) => [r, back[i]!])));
    } else {
      p.centipoints -= troopCentipoints(w, m.troops); // the building was abandoned: troops are lost
    }
    return finish(w, m);
  }
  if (m.hidden) {
    m.bond = 0n; // forfeit: nobody revealed it within the grace (B-22)
    return sendBack(w, m, t);
  }
  const targetId = w.buildingAt.get(coordKey(m.target));
  const target = targetId === undefined ? undefined : w.buildings.get(targetId)!;
  if (m.cover > 0n) {
    refundBond(w, m, t);
    // D-18 at arrival: the target's owner was on vacation when the mission was sent.
    const o = target && w.players.get(target.owner)!;
    if (o && o.vacationStart <= m.start && m.start < o.vacationUntil) return sendBack(w, m, t);
  }
  if (m.kind === ATTACK) {
    if (!target || target.owner === m.owner) return sendBack(w, m, t);
    settle(w, target, t);
    return battle(w, m, target, t);
  }
  if (m.kind === STATION) {
    if (!target || target.owner !== m.owner) return sendBack(w, m, t);
    settle(w, target, t);
    target.troops = target.troops.map((n, i) => n + m.troops[i]!);
    return finish(w, m);
  }
  if (m.kind === TRANSPORT) {
    // B-11: a debtor's transport to anyone but itself and its creditors turns back, cargo included.
    if (!transportAllowed(w, w.players.get(m.owner)!, target?.owner)) return sendBack(w, m, t);
    if (target) {
      settle(w, target, t);
      credit(w, target, Object.fromEntries(w.rs.resources.map((r, i) => [r, m.cargo[i]!])));
      if (m.trade !== 0n) settleTrade(w, m, target, t);
    }
    m.cargo = m.cargo.map(() => 0n); // delivered, or lost on an empty slot
    return sendBack(w, m, t);
  }
  // OCCUPY
  const occ = w.rs.roles.occupationTroop;
  const c = w.rs.config;
  if (target || m.troops[occ]! < c.occupationTroopsConsumed) return sendBack(w, m, t);
  const p = w.players.get(m.owner)!;
  const b = newBuilding(
    w,
    m.owner,
    m.target,
    c.occupationBuildSpeedLevel,
    c.occupationResources,
    t,
  );
  m.troops[occ]! -= c.occupationTroopsConsumed;
  p.buildings += 1n;
  p.centipoints += b.centipoints - c.occupationTroopsConsumed * w.rs.troops[occ]!.centipoints;
  sendBack(w, m, t);
}

/** Process missions that arrived by `now`, at most `max`; returns how many were processed. */
export function processDue(w: World, now: bigint, max: number): number {
  let n = 0;
  while (n < max && w.pending.length > 0) {
    const m = w.missions.get(w.pending[0]!)!;
    if (m.arrival > now || awaitingReveal(w, m, now)) break;
    w.pending.shift();
    process(w, m);
    n++;
  }
  return n;
}

/** Every action first catches up the global queue (B-07); a remaining backlog reverts (B-08). */
/**
 * The contract also reverts with Backlog when a mission is due and less than MISSION_GAS_RESERVE gas
 * is left (instead of running out of gas); the simulator has unlimited gas, so it never does.
 */
export function drain(w: World, now: bigint): void {
  processDue(w, now, MAX_MISSIONS_PER_TX);
  const head = w.pending[0];
  if (head === undefined) return;
  const m = w.missions.get(head)!;
  if (m.arrival <= now) fail(awaitingReveal(w, m, now) ? "Unrevealed" : "Backlog");
}

/** Anyone can process up to `max` due missions; never reverts on a remaining backlog. */
export const advance = atomic(function advance(w: World, max: number, now: bigint): number {
  return processDue(w, now, max);
});

// ------------------------------------------------------------------ training

export const train = atomic(function train(
  w: World,
  controller: string,
  buildingId: bigint,
  troop: number,
  quantity: bigint,
  now: bigint,
): void {
  drain(w, now);
  const [p, b] = owned(w, controller, buildingId, now);
  const def = w.rs.troops[troop] ?? fail("UnknownEntity");
  if (quantity < 1n) fail("NoUnits");
  settleForAction(w, p, b, now);
  if (b.levels[def.trainedAt]! < 1n) fail("TimingRoomRequired"); // D-14
  if (!met(p, b, def.requirements)) fail("RequirementsNotMet");
  const queue = b.training[def.isAttack ? 0 : 1];
  if (queue.length >= w.rs.config.troopQueue[isPremium(w, p, now) ? 1 : 0]) fail("QueueFull");
  const cost = Object.fromEntries(Object.entries(def.cost).map(([r, v]) => [r, v * quantity]));
  if (!affordable(w, b, cost)) fail("CannotAfford");
  pay(w, b, cost);
  const item = { index: troop, quantity, seq: w.seq++, finishAt: 0n };
  if (queue.length === 0) item.finishAt = now + trainingSeconds(w, b, item);
  queue.push(item);
});

/** Cancel a batch (queue 0 = attack, 1 = defense): always refunded in full (paid when queued). */
export const cancelTraining = atomic(function cancelTraining(
  w: World,
  controller: string,
  buildingId: bigint,
  queueIndex: number,
  position: number,
  now: bigint,
): void {
  drain(w, now);
  const [p, b] = owned(w, controller, buildingId, now);
  settleForAction(w, p, b, now);
  const queue = b.training[queueIndex];
  if (!queue || position < 0 || position >= queue.length) fail("NothingToCancel");
  const [item] = queue.splice(position, 1);
  const def = w.rs.troops[item!.index]!;
  credit(
    w,
    b,
    Object.fromEntries(Object.entries(def.cost).map(([r, v]) => [r, v * item!.quantity])),
  );
  if (position === 0 && queue[0]) queue[0].finishAt = now + trainingSeconds(w, b, queue[0]);
});

// ------------------------------------------------------------------ missions

/** A valid kind and coordinate, other than the origin. */
function checkTarget(w: World, kind: number, target: Coord, from: Coord): void {
  const c = w.rs.config;
  if (kind < ATTACK || kind > OCCUPY) fail("InvalidMission");
  if (
    target.city < 1n ||
    target.city > c.cities ||
    target.neighborhood < 1n ||
    target.neighborhood > c.neighborhoods ||
    target.slot < 1n ||
    target.slot > c.slots
  )
    fail("InvalidCoordinate");
  if (coordKey(target) === coordKey(from)) fail("InvalidMission");
}

/**
 * What sendMission checks about the target when it leaves. A hidden mission cannot be checked
 * on-chain until its reveal, so clients run this before sending one: a mission that would bounce
 * on arrival (D-18, B-11) or attack its own sender never leaves.
 */
export function checkSendTarget(
  w: World,
  owner: bigint,
  from: Coord,
  kind: number,
  target: Coord,
  now: bigint,
): void {
  checkTarget(w, kind, target, from);
  const targetId = w.buildingAt.get(coordKey(target));
  const to = targetId === undefined ? undefined : w.buildings.get(targetId)!.owner;
  if (to !== undefined) {
    if (kind === ATTACK && to === owner) fail("OwnTarget");
    if (onVacation(w.players.get(to)!, now)) fail("TargetOnVacation"); // D-18
  }
  // B-11: a player with a registered debt only transports to its own and its creditors' buildings.
  if (kind === TRANSPORT && !transportAllowed(w, w.players.get(owner)!, to)) fail("InDebt");
}

export const sendMission = atomic(function sendMission(
  w: World,
  controller: string,
  buildingId: bigint,
  kind: number,
  target: Coord,
  troops: bigint[],
  resources: bigint[],
  trade: bigint,
  now: bigint,
): bigint {
  drain(w, now);
  const [p, b] = owned(w, controller, buildingId, now);
  const c = w.rs.config;
  checkSendTarget(w, p.id, b.coord, kind, target, now);
  if (trade !== 0n && (kind !== TRANSPORT || !tradeOpenFor(w, trade, p.id, now)))
    fail("InvalidTrade");
  if (p.missions >= BigInt(c.maxOutgoingMissions)) fail("TooManyMissions");
  settleForAction(w, p, b, now);

  const cargo = kind === TRANSPORT ? resources : w.rs.resources.map(() => 0n);
  const duration = charge(w, p, b, troops, cargo, distance(w.rs, b.coord, target), 0n);
  const m = create(w, p, b, troops, cargo, duration, now);
  m.kind = kind;
  m.target = { ...target };
  m.trade = trade;
  return m.id;
});

/**
 * Only attack troops present in the building; speed = slowest, capacity and salary summed. Pays
 * cargo + salary (+ bond) and takes the troops out; returns the one-way travel time over `dist`.
 */
function charge(
  w: World,
  p: Player,
  b: Building,
  troops: bigint[],
  cargo: bigint[],
  dist: bigint,
  bond: bigint,
): bigint {
  if (troops.length !== w.rs.troops.length) fail("InvalidTroops");
  let units = 0n;
  let speed = 0n;
  let capacity = 0n;
  let salaryUnits = 0n;
  troops.forEach((n, i) => {
    if (n === 0n) return;
    const t = w.rs.troops[i]!;
    if (n < 0n || !t.isAttack || n > b.troops[i]!) fail("InvalidTroops");
    const s = troopStats(w.rs, t, p.research);
    units += n;
    if (speed === 0n || s.speed < speed) speed = s.speed;
    capacity += n * s.capacity;
    salaryUnits += n * t.salary;
  });
  if (units === 0n) fail("NoUnits");
  if (cargo.length !== w.rs.resources.length || cargo.some((r) => r < 0n)) fail("InvalidMission");

  const duration = travelSeconds(w.rs, dist, speed);
  const salary = missionSalary(w.rs, dist, salaryUnits);
  const carried = cargo.reduce((s, r) => s + r, 0n);
  if (carried > 0n && carried + salary > capacity) fail("CargoExceeded");
  const sr = w.rs.roles.salaryResource;
  const cost = Object.fromEntries(
    w.rs.resources.map((r, i) => [r, cargo[i]! + (i === sr ? salary + bond : 0n)]),
  );
  if (!affordable(w, b, cost)) fail("CannotAfford");
  pay(w, b, cost);
  b.troops = b.troops.map((n, i) => n - troops[i]!);
  return duration;
}

function create(
  w: World,
  p: Player,
  b: Building,
  troops: bigint[],
  cargo: bigint[],
  duration: bigint,
  now: bigint,
): Mission {
  const m: Mission = {
    id: w.nextMission++,
    owner: p.id,
    origin: b.id,
    kind: 0,
    returning: false,
    target: { city: 0n, neighborhood: 0n, slot: 0n },
    start: now,
    arrival: now + duration,
    duration,
    seq: w.seq++,
    troops: [...troops],
    cargo: [...cargo],
    trade: 0n,
    from: { ...b.coord },
    hidden: false,
    cover: 0n,
    bond: 0n,
    commit: ZERO_COMMIT,
  };
  w.missions.set(m.id, m);
  p.missions += 1n;
  enqueue(w, m);
  return m;
}

const ZERO_COMMIT = `0x${"0".repeat(64)}`;

const word = (x: bigint) => x.toString(16).padStart(64, "0");

/** keccak256(abi.encode(uint64 owner, uint8 kind, uint8 city, uint8 neighborhood, uint8 slot, bytes32 salt)). */
export function hiddenCommit(owner: bigint, kind: number, target: Coord, salt: bigint): string {
  const hex = [owner, BigInt(kind), target.city, target.neighborhood, target.slot, salt]
    .map(word)
    .join("");
  const bytes = Uint8Array.from(hex.match(/../g)!, (h) => parseInt(h, 16));
  return `0x${Array.from(keccak_256(bytes), (x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * A mission whose kind and target stay secret until revealed (B-22). Duration and salary use the
 * declared `cover` distance (grid units), at most the distance to the farthest map corner.
 */
export const sendHiddenMission = atomic(function sendHiddenMission(
  w: World,
  controller: string,
  buildingId: bigint,
  commit: string,
  cover: bigint,
  troops: bigint[],
  resources: bigint[],
  now: bigint,
): bigint {
  drain(w, now);
  const [p, b] = owned(w, controller, buildingId, now);
  const c = w.rs.config;
  if (cover < 1n || cover * c.distanceUnit > maxDistanceFrom(w.rs, b.coord)) fail("InvalidCover");
  if (p.missions >= BigInt(c.maxOutgoingMissions)) fail("TooManyMissions");
  settleForAction(w, p, b, now);

  const bond = c.hiddenMissionBond;
  const duration = charge(w, p, b, troops, resources, cover * c.distanceUnit, bond);
  const m = create(w, p, b, troops, resources, duration, now);
  m.hidden = true;
  m.cover = cover;
  m.bond = bond;
  m.commit = commit.toLowerCase();
  return m.id;
});

/**
 * Anyone may reveal a hidden mission, any time: it checks the commitment and the target only, and
 * touches no building, so it never drains the queue. An invalid reveal reverts; if nobody can
 * reveal it, the mission is forfeited after the grace.
 */
export const reveal = atomic(function reveal(
  w: World,
  missionId: bigint,
  kind: number,
  target: Coord,
  salt: bigint,
): void {
  const m = w.missions.get(missionId);
  if (!m || !m.hidden || m.returning) return; // already revealed, recalled or resolved: clients race
  if (hiddenCommit(m.owner, kind, target, salt) !== m.commit) fail("BadReveal");
  checkTarget(w, kind, target, m.from);
  if (distance(w.rs, m.from, target) > m.cover * w.rs.config.distanceUnit) fail("InvalidCover");
  if (kind !== TRANSPORT && m.cargo.some((r) => r > 0n)) fail("InvalidMission");
  m.hidden = false;
  m.kind = kind;
  m.target = { ...target };
});

/** A mission not yet returning turns back, arriving after the time already travelled. */
export const recall = atomic(function recall(
  w: World,
  controller: string,
  missionId: bigint,
  now: bigint,
): void {
  drain(w, now);
  const pid = active(w, controller, now).id;
  const m = w.missions.get(missionId);
  if (!m || m.owner !== pid || m.returning) fail("NotRecallable");
  w.pending.splice(w.pending.indexOf(m.id), 1);
  m.returning = true;
  m.arrival = now + (now - m.start);
  m.start = now;
  m.seq = w.seq++;
  enqueue(w, m);
});

/** Abandon a building: rooms, troops and queues are lost; never the last one (B-30). */
export const abandon = atomic(function abandon(
  w: World,
  controller: string,
  buildingId: bigint,
  now: bigint,
): void {
  drain(w, now);
  const [p, b] = owned(w, controller, buildingId, now);
  if (p.buildings <= 1n) fail("LastBuilding");
  settleForAction(w, p, b, now);
  p.centipoints -= b.centipoints + troopCentipoints(w, b.troops);
  if (p.researchBuilding === b.id) {
    p.researchQueue = [];
    p.researchBuilding = 0n;
  }
  p.buildings -= 1n;
  w.buildingAt.delete(coordKey(b.coord));
  w.buildings.delete(b.id);
});
