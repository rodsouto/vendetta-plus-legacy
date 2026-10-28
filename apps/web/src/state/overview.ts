// The whole account at a glance (the legacy "Visión general"): what is coming to the player's
// buildings, and which of them are threatened, full or idle. Read by the overview, the building
// switcher, the thumb index badges and the ledger.
import { distance, sim, vendetta as rs } from "@vendetta/rules";

/** Another player's mission that is, or may be, bound to some of the player's buildings. */
export interface Arrival {
  m: sim.Mission;
  /** A public mission's target; for a hidden one every building within its cover (B-22). */
  targets: sim.Building[];
  /** An attack, or a hidden mission (its kind is unknown until it arrives). */
  hostile: boolean;
}

export function arrivals(w: sim.World, p: sim.Player, mine: sim.Building[]): Arrival[] {
  const out: Arrival[] = [];
  for (const m of w.missions.values()) {
    if (m.owner === p.id || m.returning) continue;
    const targets = m.hidden
      ? mine.filter((b) => distance(rs, m.from, b.coord) <= m.cover * rs.config.distanceUnit)
      : mine.filter((b) => sim.coordKey(b.coord) === sim.coordKey(m.target));
    if (targets.length > 0) out.push({ m, targets, hostile: m.hidden || m.kind === sim.ATTACK });
  }
  return out.sort((a, z) => (a.m.arrival < z.m.arrival ? -1 : a.m.arrival > z.m.arrival ? 1 : 0));
}

export interface BuildingState {
  /** A public attack bound here, or a hidden mission that may be. */
  threat?: "attack" | "possible";
  /** Some store at its capacity: production is being lost. */
  full: boolean;
  /** No room upgrade queued. */
  roomsIdle: boolean;
  /** A training room is built but no troops are being trained. */
  recruitIdle: boolean;
}

export function buildingState(
  w: sim.World,
  p: sim.Player,
  b: sim.Building,
  list: Arrival[],
): BuildingState {
  let threat: BuildingState["threat"];
  for (const a of list) {
    if (!a.hostile || !a.targets.some((x) => x.id === b.id)) continue;
    if (!a.m.hidden) threat = "attack";
    else threat ??= "possible";
  }
  const caps = sim.capacities(w, b);
  const canTrain =
    b.levels[rs.roles.attackTrainingRoom]! > 0n || b.levels[rs.roles.defenseTrainingRoom]! > 0n;
  return {
    threat,
    full: b.stock.some((s, i) => s >= caps[i]!),
    roomsIdle: b.roomQueue.length === 0,
    recruitIdle: canTrain && b.training.every((q) => q.length === 0),
  };
}
