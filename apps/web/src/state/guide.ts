// Optional economic milestones, evaluated against the projected world. They never gate actions.
import {
  sim,
  type HiddenPlain,
  type Requirement,
  type ResourceCosts,
  type Ruleset,
} from "@vendetta/rules";

export interface GuideStep {
  kind: "room" | "research" | "troop" | "occupy";
  index: number;
  level: bigint;
  phase: number;
  done: boolean;
  pending: boolean;
  queued: boolean;
  available: boolean;
  cost?: ResourceCosts;
}

/** Product advice, not game rules: discover each room from its economic function and roles. */
function economicPath(rs: Ruleset): (Requirement & { phase: number })[] {
  const producer = (resource: string) =>
    rs.buildings.find(
      (b) => b.production?.kind === "producer" && b.production.resource === resource,
    )!.index;
  const storage = (resource: string) =>
    rs.buildings.find((b) => b.storage?.resource === resource)!.index;
  const dollars = rs.resources[rs.roles.salaryResource]!;
  const converters = rs.buildings.filter(
    (b) => b.production?.kind === "converter" && b.production.resource === dollars,
  );
  const bar = converters[0]!.index;
  const smuggle = converters[1]!.index;
  const alcohol = rs.buildings[bar]!.production!.consumes!;
  const arms = producer("weapons"),
    ammo = producer("ammunition"),
    brewery = producer(alcohol);
  const office = rs.roles.buildSpeedRoom;
  const stages: [number, [number, number][]][] = [
    [
      0,
      [
        [ammo, 1],
        [office, 2],
        [ammo, 3],
        [arms, 3],
        [ammo, 5],
        [arms, 4],
      ],
    ],
    [
      1,
      [
        [ammo, 12],
        [brewery, 1],
        [bar, 3],
        [arms, 5],
      ],
    ],
    [
      2,
      [
        [bar, 4],
        [ammo, 13],
        [arms, 7],
        [bar, 5],
        [storage(dollars), 1],
        [arms, 8],
        [storage("weapons"), 1],
        [brewery, 4],
        [ammo, 14],
        [brewery, 5],
        [arms, 9],
        [storage("ammunition"), 1],
      ],
    ],
    [
      3,
      [
        [brewery, 8],
        [office, 5],
        [smuggle, 2],
        [arms, 10],
      ],
    ],
    [4, [[rs.roles.researchSpeedRoom, 1]]],
  ];
  const path: (Requirement & { phase: number })[] = stages.flatMap(([phase, rooms]) =>
    rooms.map(([index, level]) => ({ kind: "room" as const, index, level: BigInt(level), phase })),
  );
  // Include research dependencies from the ruleset rather than duplicating the technology tree.
  const research = (r: Requirement) => {
    const def = r.kind === "room" ? rs.buildings[r.index]! : rs.research[r.index]!;
    for (const dependency of def.requirements) research(dependency);
    if (!path.some((s) => s.kind === r.kind && s.index === r.index && s.level >= r.level))
      path.push({ ...r, phase: 4 });
  };
  for (const requirement of rs.troops[rs.roles.occupationTroop]!.requirements)
    research(requirement);
  path.push({
    kind: "room",
    index: rs.troops[rs.roles.occupationTroop]!.trainedAt,
    level: 2n,
    phase: 4,
  });
  return path;
}

export function expansionGuide(
  w: sim.World,
  p: sim.Player,
  b: sim.Building,
  known: ReadonlyMap<string, HiddenPlain> = new Map(),
): GuideStep[] {
  const rs = w.rs;
  const met = (reqs: Requirement[]) =>
    reqs.every((r) => (r.kind === "room" ? b.levels[r.index]! : p.research[r.index]!) >= r.level);
  const steps: GuideStep[] = economicPath(rs).map((r) => {
    const current = r.kind === "room" ? b.levels[r.index]! : p.research[r.index]!;
    const def = r.kind === "room" ? rs.buildings[r.index]! : rs.research[r.index]!;
    const available =
      met(def.requirements) && (r.kind === "room" || b.levels[rs.roles.researchSpeedRoom]! > 0n);
    return {
      ...r,
      done: current >= r.level,
      pending: false,
      queued: false,
      available,
      cost:
        current < r.level && available
          ? r.kind === "room"
            ? sim.roomJob(w, b, r.index).cost
            : sim.researchJob(w, p, b, r.index).cost
          : undefined,
    };
  });
  // Assign each queued level to its first unfinished milestone. A room can occur in several
  // phases, but only the milestone covered by the queue head is actually in progress.
  for (const kind of ["room", "research"] as const) {
    const queue = kind === "room" ? b.roomQueue : p.researchQueue;
    const levels = kind === "room" ? [...b.levels] : [...p.research];
    queue.forEach((job, position) => {
      const level = ++levels[job.index]!;
      const milestone = steps.find(
        (s) => s.kind === kind && s.index === job.index && !s.done && s.level >= level,
      );
      if (milestone) {
        if (position === 0) milestone.pending = true;
        else milestone.queued = true;
      }
    });
  }
  const troop = rs.troops[rs.roles.occupationTroop]!;
  const training = b.training[troop.isAttack ? 0 : 1];
  const inFlight = [...w.missions.values()].some(
    (m) =>
      m.owner === p.id &&
      !m.returning &&
      (m.hidden ? known.get(m.commit)?.kind : m.kind) === sim.OCCUPY,
  );
  steps.push({
    kind: "troop",
    index: troop.index,
    level: 1n,
    phase: 5,
    done: b.troops[troop.index]! > 0n || inFlight,
    pending: training[0]?.index === troop.index,
    queued: training.slice(1).some((job) => job.index === troop.index),
    available: met(troop.requirements) && b.levels[troop.trainedAt]! > 0n,
    cost: troop.cost,
  });
  steps.push({
    kind: "occupy",
    index: troop.index,
    level: 1n,
    phase: 5,
    done: p.buildings >= 2n,
    pending: inFlight,
    queued: false,
    available: b.troops[troop.index]! > 0n || inFlight,
  });
  return steps;
}

/** Keep the economic path optional, and show the two independent queues during preparation. */
export function expansionRecommendations(steps: GuideStep[]): GuideStep[] {
  const occupation = steps.find((s) => s.kind === "occupy")!;
  if (occupation.done) return [];
  const troop = steps.find((s) => s.kind === "troop")!;
  if (troop.done) return [occupation];
  if (troop.pending || troop.queued) return [troop];
  const first = steps.find((s) => !s.done)!;
  if (first.phase !== 4) return [first];
  const parallel = steps.find(
    (s) =>
      !s.done &&
      s.available &&
      s.phase === 4 &&
      s.kind !== first.kind &&
      (s.kind === "room" || s.kind === "research"),
  );
  return parallel ? [first, parallel] : [first];
}

/** The first prerequisite to build/upgrade a suggested room, following the ruleset graph. */
export function roomRecommendation(
  w: sim.World,
  p: sim.Player,
  b: sim.Building,
  index: number,
): Requirement {
  const visit = (r: Requirement): Requirement => {
    const def = r.kind === "room" ? w.rs.buildings[r.index]! : w.rs.research[r.index]!;
    for (const dependency of def.requirements) {
      const level =
        dependency.kind === "room" ? b.levels[dependency.index]! : p.research[dependency.index]!;
      if (level < dependency.level) return visit(dependency);
    }
    return r;
  };
  return visit({ kind: "room", index, level: b.levels[index]! + 1n });
}
