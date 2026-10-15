// Local settlement of one building (blockchain.md B-06): its own events in (time, seq) order, with
// exact stock integration between them (B-27, B-28, D-07, D-10). Mirrors contracts/src/core/Settlement.sol.
import { researchUpgrade, roomUpgrade } from "../costs.js";
import { productionRates, storage } from "../economy.js";
import type { ResourceCosts } from "../ruleset.js";
import { stockScale, type Building, type Player, type World } from "./state.js";

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

/** Process the building's own events up to `t` (B-06). */
export function settle(w: World, b: Building, t: bigint): void {
  const p = w.players.get(b.owner)!;
  for (;;) {
    const room = b.roomQueue[0];
    const research = p.researchBuilding === b.id ? p.researchQueue[0] : undefined;
    let next: "room" | "research" | null = null;
    let at = 0n;
    if (room) [next, at] = ["room", room.finishAt];
    if (
      research &&
      (next === null ||
        research.finishAt < at ||
        (research.finishAt === at && research.seq < room!.seq))
    )
      [next, at] = ["research", research.finishAt];
    if (next === null || at > t) break;

    integrate(w, b, at);
    if (next === "room") {
      const r = w.rs.buildings[room!.index]!;
      b.levels[room!.index]! += 1n;
      b.centipoints += r.centipoints;
      p.centipoints += r.centipoints;
      b.roomQueue.shift();
      startNextRoom(w, b, at);
    } else {
      const r = w.rs.research[research!.index]!;
      p.research[research!.index]! += 1n;
      p.centipoints += r.centipoints;
      p.researchQueue.shift();
      startNextResearch(w, p, b, at);
    }
  }
  integrate(w, b, t);
}
