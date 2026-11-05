// Experimental reference only. Production state-machine code remains unchanged.
import { distance, gridPosition, sim, type Coord } from "../../src/index.js";

export interface Evidence {
  mission: bigint;
  kind: number;
  target: Coord;
  salt: bigint;
}
interface Region {
  from: Coord;
  cover: bigint;
  write: boolean;
}
export interface Footprint {
  read: Set<string>;
  write: Set<string>;
  regions: Region[];
}
const footprint = (): Footprint => ({ read: new Set(), write: new Set(), regions: [] });
const key = (kind: string, id: bigint | string) => `${kind}:${id}`;
const coordResource = (c: Coord) => key("coord", sim.coordKey(c));

function player(w: sim.World, f: Footprint, id: bigint, write = true): void {
  if (id === 0n) return;
  f.read.add(key("player", id));
  if (write) f.write.add(key("player", id));
  const p = w.players.get(id);
  if (p?.researchBuilding) building(w, f, p.researchBuilding, write, false);
}
function building(w: sim.World, f: Footprint, id: bigint, write = true, withPlayer = true): void {
  f.read.add(key("building", id));
  if (write) f.write.add(key("building", id));
  const b = w.buildings.get(id);
  if (withPlayer && b) player(w, f, b.owner, write);
}
function family(w: sim.World, f: Footprint, id: bigint): bigint {
  const p = w.players.get(id);
  if (!p?.family) return 0n;
  f.read.add(key("family", p.family));
  return sim.familyOf(w, p);
}
function war(w: sim.World, f: Footprint, a: bigint, b: bigint): void {
  if (!a || !b || a === b) return;
  const pair = a < b ? `${a}:${b}` : `${b}:${a}`;
  f.read.add(key("war-pair", pair));
  const id = sim.warBetween(w, a, b);
  if (id) {
    f.read.add(key("war", id));
    f.write.add(key("war", id));
  }
}
function trade(w: sim.World, f: Footprint, id: bigint, write = true): void {
  f.read.add(key("trade", id));
  if (write) f.write.add(key("trade", id));
}

export function missionFootprint(w: sim.World, m: sim.Mission): Footprint {
  const f = footprint();
  f.read.add(key("mission", m.id));
  f.write.add(key("mission", m.id));
  player(w, f, m.owner);
  if (m.returning) {
    building(w, f, m.origin);
    return f;
  }
  // Preserve the existing allocator: do not reserve a new sequence or change B-07.
  const stationTarget = m.hidden
    ? undefined
    : w.buildings.get(w.buildingAt.get(sim.coordKey(m.target)) ?? 0n);
  const guaranteedStation =
    !m.hidden && m.cover === 0n && m.kind === sim.STATION && stationTarget?.owner === m.owner;
  // A station to an empty/foreign target bounces and allocates a return sequence too.
  if (!guaranteedStation) f.write.add("allocator:seq");
  const canOccupy = m.troops[w.rs.roles.occupationTroop]! >= w.rs.config.occupationTroopsConsumed;
  if (canOccupy && (m.hidden || m.kind === sim.OCCUPY)) f.write.add("allocator:building");
  const attackerFamily = family(w, f, m.owner);
  if (m.hidden) {
    // Only public fields are used here. No target/kind from future evidence.
    f.regions.push({ from: m.from, cover: m.cover, write: canOccupy });
    for (const b of w.buildings.values()) {
      if (distance(w.rs, m.from, b.coord) > m.cover * w.rs.config.distanceUnit) continue;
      building(w, f, b.id);
      war(w, f, attackerFamily, family(w, f, b.owner));
    }
  } else {
    f.read.add(coordResource(m.target));
    if (m.kind === sim.OCCUPY) f.write.add(coordResource(m.target));
    const id = w.buildingAt.get(sim.coordKey(m.target));
    if (id !== undefined) {
      building(w, f, id);
      if (m.kind === sim.ATTACK)
        war(w, f, attackerFamily, family(w, f, w.buildings.get(id)!.owner));
    }
    if (m.trade) trade(w, f, m.trade);
  }
  return f;
}

function touchesRegion(w: sim.World, resource: string, region: Region): boolean {
  if (!resource.startsWith("coord:")) return false;
  const [city, neighborhood, slot] = resource.slice(6).split(":").map(BigInt);
  return (
    distance(w.rs, region.from, { city: city!, neighborhood: neighborhood!, slot: slot! }) <=
    region.cover * w.rs.config.distanceUnit
  );
}

export function conflict(w: sim.World, earlier: Footprint, later: Footprint): string | undefined {
  if (earlier.write.has("*") || later.write.has("*")) return "unsupported:*";
  for (const r of earlier.write) if (later.read.has(r) || later.write.has(r)) return r;
  for (const r of later.write) if (earlier.read.has(r)) return r;
  for (const region of earlier.regions) {
    for (const r of later.write) if (touchesRegion(w, r, region)) return r;
    if (region.write) for (const r of later.read) if (touchesRegion(w, r, region)) return r;
  }
  for (const region of later.regions) {
    for (const r of earlier.write) if (touchesRegion(w, r, region)) return r;
    if (region.write) for (const r of earlier.read) if (touchesRegion(w, r, region)) return r;
  }
  for (const a of earlier.regions)
    for (const b of later.regions) {
      if (!a.write && !b.write) continue;
      const x = gridPosition(w.rs, a.from),
        y = gridPosition(w.rs, b.from);
      // Conservative bounding-box intersection includes rounding at disk edges.
      const radius = a.cover + b.cover + 2n;
      if (x.x - y.x <= radius && y.x - x.x <= radius && x.y - y.y <= radius && y.y - x.y <= radius)
        return "coord:overlapping-regions";
    }
  return undefined;
}

export type Action =
  | { type: "poke"; building: bigint }
  | { type: "register"; caller: string; coord: Coord }
  | { type: "queueRoom"; caller: string; building: bigint; room: number }
  | { type: "queueResearch"; caller: string; building: bigint; research: number }
  | { type: "cancelRoom" | "cancelResearch"; caller: string; building: bigint; position: number }
  | { type: "cancelTraining"; caller: string; building: bigint; queue: number; position: number }
  | { type: "recall"; caller: string; mission: bigint }
  | { type: "train"; caller: string; building: bigint; troop: number; quantity: bigint }
  | { type: "acceptTrade"; caller: string; trade: bigint; building: bigint }
  | { type: "withdrawTrade"; caller: string; trade: bigint; building: bigint; amount: bigint[] }
  | { type: "dissolveFamily"; caller: string }
  | { type: "setRank"; caller: string; target: bigint; rank: number }
  | { type: "abandon"; caller: string; building: bigint }
  | {
      type: "send";
      caller: string;
      building: bigint;
      kind: number;
      target: Coord;
      troops: bigint[];
      cargo: bigint[];
      trade: bigint;
    };

export function actionFootprint(w: sim.World, a: Action): Footprint {
  const f = footprint();
  const pid = "caller" in a ? w.playerOf.get(a.caller) : undefined;
  if (pid !== undefined) player(w, f, pid);
  switch (a.type) {
    case "poke":
      building(w, f, a.building);
      break;
    case "register":
      f.read.add(coordResource(a.coord));
      f.write.add(coordResource(a.coord));
      f.read.add("allocator:player");
      f.write.add("allocator:player");
      f.read.add("allocator:building");
      f.write.add("allocator:building");
      break;
    case "queueRoom":
    case "queueResearch":
    case "train":
      building(w, f, a.building);
      f.read.add("global:premium");
      f.read.add("allocator:seq");
      f.write.add("allocator:seq");
      break;
    case "cancelRoom":
    case "cancelResearch":
    case "cancelTraining":
      building(w, f, a.building);
      break;
    case "recall":
      f.read.add(key("mission", a.mission));
      f.write.add(key("mission", a.mission));
      f.read.add("allocator:seq");
      f.write.add("allocator:seq");
      break;
    case "abandon":
      building(w, f, a.building);
      if (w.buildings.has(a.building))
        f.write.add(coordResource(w.buildings.get(a.building)!.coord));
      break;
    case "send": {
      building(w, f, a.building);
      f.read.add(coordResource(a.target));
      const target = w.buildingAt.get(sim.coordKey(a.target));
      if (target !== undefined) building(w, f, target, false);
      f.read.add("allocator:seq");
      f.write.add("allocator:seq");
      f.read.add("allocator:mission");
      f.write.add("allocator:mission");
      if (a.trade) trade(w, f, a.trade);
      break;
    }
    case "acceptTrade": {
      trade(w, f, a.trade);
      building(w, f, a.building);
      const t = w.trades.get(a.trade);
      if (t) {
        building(w, f, t.from);
        player(w, f, t.seller);
      }
      if (pid !== undefined) {
        const p = w.players.get(pid)!;
        for (const id of [...p.offers, ...p.purchases]) trade(w, f, id, false);
      }
      break;
    }
    case "withdrawTrade":
      trade(w, f, a.trade);
      building(w, f, a.building);
      break;
    case "dissolveFamily": {
      const id = pid === undefined ? 0n : family(w, f, pid);
      if (id) f.write.add(key("family", id));
      break;
    }
    case "setRank":
      player(w, f, a.target);
      if (pid !== undefined) family(w, f, pid);
      family(w, f, a.target);
      break;
    default: {
      const unsupported: never = a;
      throw new Error(`Unsupported action: ${String(unsupported)}`);
    }
  }
  return f;
}

/** A semantic action still runs through the real simulator's checks and rollback. */
function invoke(w: sim.World, a: Action, now: bigint): unknown {
  switch (a.type) {
    case "poke":
      return sim.poke(w, a.building, now);
    case "register":
      return sim.register(w, a.caller, a.coord, now);
    case "queueRoom":
      return sim.queueRoom(w, a.caller, a.building, a.room, now);
    case "queueResearch":
      return sim.queueResearch(w, a.caller, a.building, a.research, now);
    case "cancelRoom":
      return sim.cancelRoom(w, a.caller, a.building, a.position, now);
    case "cancelResearch":
      return sim.cancelResearch(w, a.caller, a.building, a.position, now);
    case "cancelTraining":
      return sim.cancelTraining(w, a.caller, a.building, a.queue, a.position, now);
    case "recall":
      return sim.recall(w, a.caller, a.mission, now);
    case "train":
      return sim.train(w, a.caller, a.building, a.troop, a.quantity, now);
    case "acceptTrade":
      return sim.acceptTrade(w, a.caller, a.trade, a.building, now);
    case "withdrawTrade":
      return sim.withdrawTrade(w, a.caller, a.trade, a.building, a.amount, now);
    case "dissolveFamily":
      return sim.dissolveFamily(w, a.caller, now);
    case "setRank":
      return sim.setRank(w, a.caller, a.target, a.rank, now);
    case "abandon":
      return sim.abandon(w, a.caller, a.building, now);
    case "send":
      return sim.sendMission(
        w,
        a.caller,
        a.building,
        a.kind,
        a.target,
        a.troops,
        a.cargo,
        a.trade,
        now,
      );
  }
}

export function cloneWorld(w: sim.World): sim.World {
  const { rs, ...state } = w;
  return { ...structuredClone(state), rs };
}

/** Prototype evidence ingress. Static checks are reused, without current grace/requeue policy. */
export function acceptEvidence(w: sim.World, e: Evidence): void {
  const original = w.missions.get(e.mission);
  if (!original || !original.hidden || original.returning) return;
  const check = cloneWorld(w);
  check.pending = [e.mission];
  check.parked = [];
  // Call before arrival in the validation copy: no expiry, drain or late seq allocation.
  sim.reveal(check, e.mission, e.kind, e.target, e.salt, original.arrival - 1n);
  const validated = check.missions.get(e.mission)!;
  if (validated.hidden) throw new Error("Evidence was not validated");
  original.hidden = false;
  original.kind = validated.kind;
  original.target = { ...validated.target };
}

export interface ActionResult {
  status: "accepted" | "reverted" | "blocked";
  value?: unknown;
  error?: string;
  blocker?: bigint;
  resource?: string;
}

export class ResourceFrontier {
  private wall = 0n;
  readonly execution: {
    mission: bigint;
    returning: boolean;
    at: bigint;
    seq: bigint;
    wall: bigint;
    effect?: unknown;
  }[] = [];
  constructor(
    readonly world: sim.World,
    readonly chronological = false,
  ) {}

  advance(now: bigint): void {
    if (now < this.wall) throw new Error("NonMonotonicTime");
    this.wall = now;
    for (;;) {
      const blocked: Footprint[] = [];
      let progressed = false;
      for (const id of [...this.world.pending]) {
        const m = this.world.missions.get(id)!;
        if (m.arrival > now) break;
        const f = missionFootprint(this.world, m);
        if (
          (m.hidden && !m.returning) ||
          blocked.some((earlier) => conflict(this.world, earlier, f))
        ) {
          blocked.push(f);
          if (this.chronological) break;
          continue;
        }
        const saved = this.world.pending.filter((other) => other !== id);
        this.world.pending = [id];
        const receipt = {
          mission: id,
          returning: m.returning,
          at: m.arrival,
          seq: m.seq,
          wall: now,
          effect: undefined as unknown,
        };
        if (sim.processDue(this.world, m.arrival, 1) !== 1) throw new Error("Execution failed");
        const targetId = receipt.returning
          ? m.origin
          : this.world.buildingAt.get(sim.coordKey(m.target));
        const target = targetId === undefined ? undefined : this.world.buildings.get(targetId);
        const participants = [...new Set([m.owner, ...(target ? [target.owner] : [])])];
        // Semantic receipts exclude physical processing time and unrelated world state.
        // They are stronger than final-state equality, but are not the Solidity Battle event ABI.
        receipt.effect = structuredClone({
          mission: this.world.missions.get(id) ?? null,
          target: target ?? null,
          players: participants.map((pid) => {
            const p = this.world.players.get(pid)!;
            return {
              id: pid,
              research: p.research,
              buildings: p.buildings,
              centipoints: p.centipoints,
              missions: p.missions,
            };
          }),
          wars: [...f.write]
            .filter((r) => r.startsWith("war:"))
            .sort()
            .map((r) => this.world.wars.get(BigInt(r.slice(4)))),
        });
        this.execution.push(receipt);
        this.world.pending.push(...saved);
        this.sort();
        progressed = true;
        break; // Recompute scopes after each mutation or generated descendant.
      }
      if (!progressed) return;
    }
  }

  attempt(a: Action, now: bigint): ActionResult {
    this.advance(now);
    const f = actionFootprint(this.world, a);
    for (const id of this.world.pending) {
      const m = this.world.missions.get(id)!;
      if (m.arrival > now) break;
      const resource = conflict(this.world, missionFootprint(this.world, m), f);
      if (resource) return { status: "blocked", blocker: id, resource };
    }
    const saved = [...this.world.pending];
    // Recall must see its own pending entry so the real dequeue implementation runs normally.
    this.world.pending = a.type === "recall" ? saved.filter((id) => id === a.mission) : [];
    let result: ActionResult;
    try {
      result = { status: "accepted", value: invoke(this.world, a, now) };
    } catch (error) {
      result = {
        status: "reverted",
        error: error instanceof Error ? error.message : String(error),
      };
    }
    this.world.pending.push(
      ...saved.filter((id) => this.world.missions.has(id) && !this.world.pending.includes(id)),
    );
    this.sort();
    return result;
  }

  private sort(): void {
    this.world.pending.sort((a, b) => {
      const x = this.world.missions.get(a)!,
        y = this.world.missions.get(b)!;
      return x.arrival < y.arrival
        ? -1
        : x.arrival > y.arrival
          ? 1
          : x.seq < y.seq
            ? -1
            : x.seq > y.seq
              ? 1
              : 0;
    });
  }
}

/** Stable full-state comparison: no renaming of ids or omission of allocator state. */
export function canonicalValue(value: unknown): string {
  const normalize = (value: unknown): unknown => {
    if (typeof value === "bigint") return { bigint: value.toString() };
    if (value instanceof Map)
      return [...value]
        .map(([k, v]) => [normalize(k), normalize(v)])
        .sort((a, b) => JSON.stringify(a[0]).localeCompare(JSON.stringify(b[0])));
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .filter(([k]) => k !== "rs")
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, normalize(v)]),
      );
    return value;
  };
  return JSON.stringify(normalize(value));
}

export const canonicalWorld = (w: sim.World): string => canonicalValue(w);
