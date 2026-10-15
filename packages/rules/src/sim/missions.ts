// Troops, missions and the global mission queue (blockchain.md B-07, B-08; 07-missions.md;
// 06-combat.md). Mirrors contracts/src/core/{Training,Missions,Battle}.sol: same checks, same order,
// same errors.
import { resolveBattle } from "../combat.js";
import { honorPct } from "../honor.js";
import { apportionLoot } from "../loot.js";
import { distance, missionSalary, travelSeconds } from "../map.js";
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
import { settleTrade, tradeOpenFor } from "./market.js";
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

/** Resolve one mission at its arrival time (07-missions.md#arrival-rules). */
function process(w: World, m: Mission): void {
  const t = m.arrival;
  if (m.returning) {
    const origin = w.buildings.get(m.origin);
    const p = w.players.get(m.owner)!;
    if (origin && origin.owner === m.owner) {
      settle(w, origin, t);
      origin.troops = origin.troops.map((n, i) => n + m.troops[i]!);
      credit(w, origin, Object.fromEntries(w.rs.resources.map((r, i) => [r, m.cargo[i]!])));
    } else {
      p.centipoints -= troopCentipoints(w, m.troops); // the building was abandoned: troops are lost
    }
    return finish(w, m);
  }
  const targetId = w.buildingAt.get(coordKey(m.target));
  const target = targetId === undefined ? undefined : w.buildings.get(targetId)!;
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
    if (m.arrival > now) break;
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
  if (head !== undefined && w.missions.get(head)!.arrival <= now) fail("Backlog");
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
  if (coordKey(target) === coordKey(b.coord)) fail("InvalidMission");
  const targetId = w.buildingAt.get(coordKey(target));
  if (kind === ATTACK && targetId !== undefined && w.buildings.get(targetId)!.owner === p.id)
    fail("OwnTarget");
  if (targetId !== undefined && onVacation(w.players.get(w.buildings.get(targetId)!.owner)!, now))
    fail("TargetOnVacation"); // D-18
  if (trade !== 0n && (kind !== TRANSPORT || !tradeOpenFor(w, trade, p.id, now)))
    fail("InvalidTrade");
  if (p.missions >= BigInt(c.maxOutgoingMissions)) fail("TooManyMissions");
  settleForAction(w, p, b, now);

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
  const cargo = kind === TRANSPORT ? resources.map((r) => r) : w.rs.resources.map(() => 0n);
  if (cargo.length !== w.rs.resources.length || cargo.some((r) => r < 0n)) fail("InvalidMission");

  const dist = distance(w.rs, b.coord, target);
  const duration = travelSeconds(w.rs, dist, speed);
  const salary = missionSalary(w.rs, dist, salaryUnits);
  const carried = cargo.reduce((s, r) => s + r, 0n);
  if (carried > 0n && carried + salary > capacity) fail("CargoExceeded");
  const cost = Object.fromEntries(
    w.rs.resources.map((r, i) => [r, cargo[i]! + (i === w.rs.roles.salaryResource ? salary : 0n)]),
  );
  if (!affordable(w, b, cost)) fail("CannotAfford");
  pay(w, b, cost);
  b.troops = b.troops.map((n, i) => n - troops[i]!);

  const m: Mission = {
    id: w.nextMission++,
    owner: p.id,
    origin: b.id,
    kind,
    returning: false,
    target: { ...target },
    start: now,
    arrival: now + duration,
    duration,
    seq: w.seq++,
    troops: [...troops],
    cargo,
    trade,
  };
  w.missions.set(m.id, m);
  p.missions += 1n;
  enqueue(w, m);
  return m.id;
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
