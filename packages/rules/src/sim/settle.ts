// Local settlement of one building (blockchain.md B-06): its own events in (time, seq) order, with
// exact stock integration between them (B-27, B-28, D-07, D-10). Mirrors contracts/src/core/Settlement.sol.
import { researchUpgrade, roomUpgrade } from "../costs.js";
import { productionRates, storage } from "../economy.js";
import type { ResourceCosts } from "../ruleset.js";
import {
  coordKey,
  stockScale,
  type Building,
  type Player,
  type TrainingItem,
  type World,
} from "./state.js";

/** Storage capacity per resource, in stock units (D-10). Unlimited without a storage room. */
export function capacities(w: World, b: Building): bigint[] {
  const scale = stockScale(w.rs);
  return w.rs.resources.map((r) => {
    const room = w.rs.buildings.find((x) => x.storage?.resource === r);
    if (!room) return 2n ** 128n - 1n;
    const s = room.storage!;
    return storage(s.base, s.perLevel, s.safeDivisor, b.levels[room.index]!).capacity * scale;
  });
}

const converted = (w: World) =>
  w.rs.resources.indexOf(w.rs.buildings.find((b) => b.production?.consumes)!.production!.consumes!);

/** Integrate production from lastUpdate to `t` (B-27), switching regime when alcohol runs out (B-28). */
export function integrate(w: World, b: Building, t: bigint): void {
  const alc = converted(w);
  const cap = capacities(w, b);
  while (b.lastUpdate < t) {
    const rates = productionRates(w.rs, b.levels, b.stock[alc]!);
    const perSecond = w.rs.resources.map((r) => rates[r]!);
    let end = t;
    const drain = -perSecond[alc]!;
    if (b.stock[alc]! > 0n && drain > 0n) {
      const depletion = b.lastUpdate + (b.stock[alc]! + drain - 1n) / drain;
      if (depletion < end) end = depletion;
    }
    const dt = end - b.lastUpdate;
    b.stock = b.stock.map((s, i) => {
      const v = s + perSecond[i]! * dt;
      return v < 0n ? 0n : v > cap[i]! ? cap[i]! : v;
    });
    b.lastUpdate = end;
  }
}

export const affordable = (w: World, b: Building, cost: ResourceCosts) => {
  const scale = stockScale(w.rs);
  return w.rs.resources.every((r, i) => b.stock[i]! / scale >= cost[r]!);
};

export function pay(w: World, b: Building, cost: ResourceCosts): void {
  const scale = stockScale(w.rs);
  b.stock = b.stock.map((s, i) => s - cost[w.rs.resources[i]!]! * scale);
}

/** Add whole resources, clamped by storage (D-10). */
export function credit(w: World, b: Building, amounts: ResourceCosts): void {
  const scale = stockScale(w.rs);
  const cap = capacities(w, b);
  b.stock = b.stock.map((s, i) => {
    const v = s + amounts[w.rs.resources[i]!]! * scale;
    return v > cap[i]! ? cap[i]! : v;
  });
}

export const roomJob = (w: World, b: Building, room: number) =>
  roomUpgrade(w.rs, w.rs.buildings[room]!, b.levels[room]!, b.levels[w.rs.roles.buildSpeedRoom]!);

export const researchJob = (w: World, p: Player, b: Building, research: number) =>
  researchUpgrade(
    w.rs,
    w.rs.research[research]!,
    p.research[research]!,
    b.levels[w.rs.roles.researchSpeedRoom]!,
  );

/** Start the head of the room queue at `t`, paying it; unaffordable items are dropped (D-11). */
export function startNextRoom(w: World, b: Building, t: bigint): void {
  while (b.roomQueue.length > 0) {
    const item = b.roomQueue[0]!;
    const job = roomJob(w, b, item.index);
    if (affordable(w, b, job.cost)) {
      pay(w, b, job.cost);
      item.finishAt = t + job.seconds;
      return;
    }
    b.roomQueue.shift();
  }
}

export function startNextResearch(w: World, p: Player, b: Building, t: bigint): void {
  while (p.researchQueue.length > 0) {
    const item = p.researchQueue[0]!;
    const job = researchJob(w, p, b, item.index);
    if (affordable(w, b, job.cost)) {
      pay(w, b, job.cost);
      item.finishAt = t + job.seconds;
      return;
    }
    p.researchQueue.shift();
  }
  p.researchBuilding = 0n;
}

/** ⌊duration × quantity / training-room level⌋ for a troop batch (05-formulas.md, B-29). */
export function trainingSeconds(w: World, b: Building, item: TrainingItem): bigint {
  const troop = w.rs.troops[item.index]!;
  return (troop.trainingSeconds * item.quantity) / b.levels[troop.trainedAt]!;
}

export const troopCentipoints = (w: World, units: readonly bigint[]) =>
  units.reduce((s, n, i) => s + n * w.rs.troops[i]!.centipoints, 0n);

const NO_CUT = 2n ** 64n - 1n;

type Event =
  | { kind: "room"; at: bigint; seq: bigint }
  | { kind: "research"; at: bigint; seq: bigint }
  | { kind: "training"; queue: number; at: bigint; seq: bigint };

/**
 * Process the building's own events up to `t` (B-06), in (time, seq) order. `seq`: a mission
 * arriving at `t` resolves before the building's events created after it that finish at `t`
 * (B-07); those wait for the next settlement.
 */
export function settle(w: World, b: Building, t: bigint, seq: bigint = NO_CUT): void {
  const p = w.players.get(b.owner)!;
  for (;;) {
    let next: Event | null = null;
    const consider = (e: Event) => {
      if (next === null || e.at < next.at || (e.at === next.at && e.seq < next.seq)) next = e;
    };
    const room = b.roomQueue[0];
    if (room) consider({ kind: "room", at: room.finishAt, seq: room.seq });
    const research = p.researchBuilding === b.id ? p.researchQueue[0] : undefined;
    if (research) consider({ kind: "research", at: research.finishAt, seq: research.seq });
    b.training.forEach((q, queue) => {
      if (q[0]) consider({ kind: "training", queue, at: q[0].finishAt, seq: q[0].seq });
    });
    const e = next as Event | null;
    if (e === null || e.at > t || (e.at === t && e.seq > seq)) break;

    integrate(w, b, e.at);
    if (e.kind === "room") {
      const r = w.rs.buildings[room!.index]!;
      b.levels[room!.index]! += 1n;
      b.centipoints += r.centipoints;
      p.centipoints += r.centipoints;
      b.roomQueue.shift();
      startNextRoom(w, b, e.at);
    } else if (e.kind === "research") {
      const r = w.rs.research[research!.index]!;
      p.research[research!.index]! += 1n;
      p.centipoints += r.centipoints;
      p.researchQueue.shift();
      startNextResearch(w, p, b, e.at);
    } else {
      const q = b.training[e.queue]!;
      const item = q.shift()!;
      b.troops[item.index]! += item.quantity;
      p.centipoints += item.quantity * w.rs.troops[item.index]!.centipoints;
      // Batches are paid when queued, so the next one always starts.
      if (q[0]) q[0].finishAt = e.at + trainingSeconds(w, b, q[0]);
    }
  }
  integrate(w, b, t);
}

/** A new map building with `levels[buildSpeedRoom]` = level and `resources` of each resource. */
export function newBuilding(
  w: World,
  owner: bigint,
  coord: Building["coord"],
  buildSpeedLevel: bigint,
  resources: bigint,
  now: bigint,
): Building {
  const levels = w.rs.buildings.map(() => 0n);
  levels[w.rs.roles.buildSpeedRoom] = buildSpeedLevel;
  const b: Building = {
    id: w.nextBuilding++,
    owner,
    coord: { ...coord },
    levels,
    stock: w.rs.resources.map(() => 0n),
    lastUpdate: now,
    lastReturn: 0n,
    roomQueue: [],
    centipoints: levels.reduce((s, l, i) => s + l * w.rs.buildings[i]!.centipoints, 0n),
    troops: w.rs.troops.map(() => 0n),
    training: [[], []],
  };
  credit(w, b, Object.fromEntries(w.rs.resources.map((r) => [r, resources])));
  w.buildings.set(b.id, b);
  w.buildingAt.set(coordKey(coord), b.id);
  return b;
}
