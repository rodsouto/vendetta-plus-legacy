// Run from the repository root:
// pnpm --filter @vendetta/rules exec tsx scripts/experiments/hidden-barriers.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { coverFor, distance, vendetta as rs, type Coord } from "../../src/index.js";
import {
  blockedSeconds,
  merge,
  revealTimes,
  schedule,
  waitAt,
  type Event,
  type Interval,
} from "./barrier-model.js";

const DAY = 86400;
const WARMUP = 3600;
const END = WARMUP + DAY;
const SEEDS = [13, 71, 991];
const MARGINS = [0, 3, 15]; // 0 is a latency lower bound, not a privacy recommendation.
const MODES = ["global", "disk", "owners"] as const;
type Mode = (typeof MODES)[number];

export function random(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Building {
  owner: number;
  coord: Coord;
}
interface Mission {
  id: number;
  at: number;
  own: boolean;
  origin: number;
  target: number;
  cover: bigint;
  candidates: number[];
  attack: boolean;
}
interface Scenario {
  name: string;
  players: number;
  buildings: number;
  missionsPerDay: number;
  local?: boolean;
  clustered?: boolean;
  ownerOnline?: number;
  outage?: number;
  drandDown?: boolean;
  attackers?: number;
  service?: number;
  revealService?: number;
}

const SCENARIOS: Scenario[] = [
  { name: "small", players: 50, buildings: 1, missionsPerDay: 2 },
  { name: "medium-local", players: 200, buildings: 3, missionsPerDay: 5, local: true },
  { name: "medium-random", players: 200, buildings: 3, missionsPerDay: 5 },
  {
    name: "dense-local",
    players: 200,
    buildings: 3,
    missionsPerDay: 5,
    local: true,
    clustered: true,
  },
  { name: "busy-local", players: 500, buildings: 3, missionsPerDay: 10, local: true },
  {
    name: "owners-offline",
    players: 200,
    buildings: 3,
    missionsPerDay: 5,
    local: true,
    ownerOnline: 0,
  },
  {
    name: "keeper-outage-30m",
    players: 200,
    buildings: 3,
    missionsPerDay: 5,
    local: true,
    outage: 1800,
  },
  {
    name: "valid-burst-1-account",
    players: 200,
    buildings: 3,
    missionsPerDay: 5,
    local: true,
    attackers: 1,
  },
  {
    name: "valid-burst-10-accounts",
    players: 200,
    buildings: 3,
    missionsPerDay: 5,
    local: true,
    attackers: 10,
  },
  {
    name: "burst-serial-publisher",
    players: 200,
    buildings: 3,
    missionsPerDay: 5,
    local: true,
    attackers: 10,
    revealService: 6,
  },
  {
    name: "slow-recovery",
    players: 200,
    buildings: 3,
    missionsPerDay: 5,
    local: true,
    outage: 1800,
    service: 10,
    revealService: 10,
  },
  {
    name: "drand-unavailable",
    players: 200,
    buildings: 3,
    missionsPerDay: 5,
    local: true,
    drandDown: true,
    ownerOnline: 0,
  },
];

function coord(x: number, y: number): Coord {
  const cols = Number(rs.config.gridColumns);
  const rows = Number(rs.config.gridRows);
  return {
    city: BigInt(Math.floor(x / cols) + 1),
    neighborhood: BigInt(Math.floor(y / rows) + 1),
    slot: BigInt((y % rows) * cols + (x % cols) + 1),
  };
}

function workload(s: Scenario, seed: number) {
  const rand = random(seed);
  const world: Building[] = [];
  const used = new Set<string>();
  for (let i = 0; i < s.players * s.buildings; i++) {
    let c: Coord;
    let key: string;
    do {
      const w = s.clustered ? 170 : Number(rs.config.cities * rs.config.gridColumns);
      const h = s.clustered ? 150 : Number(rs.config.neighborhoods * rs.config.gridRows);
      c = coord(Math.floor(rand() * w), Math.floor(rand() * h));
      key = `${c.city}:${c.neighborhood}:${c.slot}`;
    } while (used.has(key));
    used.add(key);
    world.push({ owner: Math.floor(i / s.buildings), coord: c });
  }
  const missions: Mission[] = [];
  // Exact engine distances, cached only within this static synthetic world.
  const distanceRows = new Map<number, Float64Array>();
  const make = (at: number, attack = false, attacker = 0) => {
    // Reserve adversarial accounts for the burst (no competing normal outgoing slots).
    const reserved = (s.attackers ?? 0) * s.buildings;
    const origin = attack
      ? attacker * s.buildings
      : reserved + Math.floor(rand() * (world.length - reserved));
    const owner = world[origin]!.owner;
    let distances = distanceRows.get(origin);
    if (!distances) {
      distances = Float64Array.from(world, (b) =>
        Number(distance(rs, world[origin]!.coord, b.coord)),
      );
      distanceRows.set(origin, distances);
    }
    let target = origin;
    let best = Infinity;
    // Nearby missions choose the closest of 12 random foreign buildings.
    for (let k = 0; k < (s.local || attack ? 12 : 1); k++) {
      let candidate: number;
      do {
        candidate = Math.floor(rand() * world.length);
      } while (world[candidate]!.owner === owner);
      const d = distances[candidate]!;
      if (d < best) {
        target = candidate;
        best = d;
      }
    }
    const cover = coverFor(rs, world[origin]!.coord, world[target]!.coord, rand());
    const candidates: number[] = [];
    for (let i = 0; i < world.length; i++) {
      if (distances[i]! <= Number(cover * rs.config.distanceUnit)) candidates.push(i);
    }
    if (!candidates.includes(target)) throw new Error("Target missing from cover");
    missions.push({
      id: missions.length * 2,
      at,
      own: !attack && rand() < (s.ownerOnline ?? 0.25),
      origin,
      target,
      cover,
      candidates,
      attack,
    });
  };
  const rate = (s.players * s.missionsPerDay) / DAY;
  let at = 0;
  while ((at += -Math.log(1 - rand()) / rate) < END) make(at);
  // A one-off offered burst: at most 20 outbound missions per attacking account.
  // Simultaneous arrivals deliberately stress a serial reveal publisher.
  for (let a = 0; a < (s.attackers ?? 0); a++) {
    for (let i = 0; i < Number(rs.config.maxOutgoingMissions); i++) make(WARMUP + DAY / 2, true, a);
  }
  return { world, missions };
}

function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]!;
}

function simulate(
  s: Scenario,
  seed: number,
  mode: Mode,
  margin: number,
  world: Building[],
  missions: Mission[],
) {
  const outage: Interval | undefined = s.outage
    ? [WARMUP + DAY / 2, WARMUP + DAY / 2 + s.outage]
    : undefined;
  const ready = revealTimes(missions, margin, 5, 2, s.revealService ?? 1, outage, s.drandDown);
  const events: Event[] = [];
  const width: number[] = [];
  const resource = (building: number) =>
    mode === "global" ? 0 : mode === "disk" ? building : world[building]!.owner;
  for (const m of missions) {
    const resources = [...new Set([m.origin, ...m.candidates].map(resource))];
    width.push(
      mode === "global"
        ? world.length
        : mode === "disk"
          ? resources.length
          : resources.length * s.buildings,
    );
    events.push({ id: m.id, at: m.at, ready: ready.get(m.id)!, resources });
    // Synthetic 1-hour return: models cross-resource causal propagation and recovery work.
    // This is not a duration computed from troop speed, nor a simulated battle result.
    events.push({
      id: m.id + 1,
      at: m.at + 3600,
      ready: m.at + 3600,
      resources: [resource(m.origin)],
      after: m.id,
    });
  }
  const result = schedule(events, s.service ?? 1);
  const lists = new Map([...result.intervals].map(([r, intervals]) => [r, merge(intervals)]));
  let exposure = 0;
  const resourceWeights = new Map<number, number>();
  for (let b = 0; b < world.length; b++) {
    const r = resource(b);
    resourceWeights.set(r, (resourceWeights.get(r) ?? 0) + 1);
    exposure += blockedSeconds(lists.get(r) ?? [], WARMUP, END);
  }
  // Time when every modeled existing building is blocked (weighted by buildings).
  const sweep: [number, number][] = [];
  for (const [r, weight] of resourceWeights) {
    for (const [a, b] of lists.get(r) ?? []) {
      const start = Math.max(WARMUP, a),
        end = Math.min(END, b);
      if (end > start) sweep.push([start, weight], [end, -weight]);
    }
  }
  sweep.sort((a, b) => a[0] - b[0]);
  let active = 0,
    previous = WARMUP,
    all = 0;
  for (const [at, delta] of sweep) {
    if (active === world.length) all += at - previous;
    active += delta;
    previous = at;
  }
  const rand = random(seed + 10000);
  const waits: number[] = [];
  for (let i = 0; i < 20000; i++) {
    const b = Math.floor(rand() * world.length);
    waits.push(waitAt(lists.get(resource(b)) ?? [], WARMUP + rand() * DAY));
  }
  const finite = waits.filter(Number.isFinite);
  const incidentStart = WARMUP + DAY / 2;
  const incidentEnd = incidentStart + (s.outage ?? 0) + 1800;
  let incidentExposure = 0;
  for (let b = 0; b < world.length; b++)
    incidentExposure += blockedSeconds(lists.get(resource(b)) ?? [], incidentStart, incidentEnd);
  const incidentWaits: number[] = [];
  for (let i = 0; i < 5000; i++) {
    const b = Math.floor(rand() * world.length);
    incidentWaits.push(
      waitAt(lists.get(resource(b)) ?? [], incidentStart + rand() * (incidentEnd - incidentStart)),
    );
  }
  const dueAtRecovery = outage
    ? events.filter((e) => e.at < outage[1] && result.completed.get(e.id)! > outage[1])
    : [];
  const catchup = outage
    ? Math.max(0, ...dueAtRecovery.map((e) => result.completed.get(e.id)! - outage[1]))
    : 0;
  const measured = missions.filter((m) => m.at >= WARMUP && m.at < END);
  const lags = measured.map((m) => result.completed.get(m.id)! - m.at);
  return {
    scenario: s.name,
    seed,
    mode,
    margin,
    outboundEvents: measured.length,
    attackBurstEvents: missions.filter((m) => m.attack).length,
    meanScopePct: (width.reduce((a, b) => a + b, 0) / width.length / world.length) * 100,
    buildingBlockedPct: (exposure / (DAY * world.length)) * 100,
    allBuildingsBlockedPct: (all / DAY) * 100,
    actionWaitP50: quantile(waits, 0.5),
    actionWaitP95: quantile(waits, 0.95),
    actionWaitP99: quantile(waits, 0.99),
    conditionalFiniteWaitP95: quantile(
      finite.filter((n) => n > 0),
      0.95,
    ),
    actionNeverUnblockedPct: ((waits.length - finite.length) / waits.length) * 100,
    missionLagP95: quantile(lags, 0.95),
    missionLagMax: Math.max(...lags),
    backlogAtKeeperRecovery: dueAtRecovery.length,
    keeperRecoverySeconds: catchup,
    incidentBuildingBlockedPct:
      (incidentExposure / ((incidentEnd - incidentStart) * world.length)) * 100,
    incidentActionWaitP95: quantile(incidentWaits, 0.95),
    unresolvedAtEnd: events.filter((e) => e.at <= END && result.completed.get(e.id)! > END).length,
  };
}

const runs: ReturnType<typeof simulate>[] = [];
for (const s of SCENARIOS) {
  for (const seed of SEEDS) {
    const { world, missions } = workload(s, seed);
    for (const margin of MARGINS) {
      for (const mode of MODES) runs.push(simulate(s, seed, mode, margin, world, missions));
    }
  }
  process.stdout.write(`Completed ${s.name}\n`);
}
const output = fileURLToPath(
  new URL("../../../../docs/benchmarks/hidden-barriers/", import.meta.url),
);
mkdirSync(output, { recursive: true });
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const sourceFiles = [
  "packages/rules/scripts/experiments/barrier-model.ts",
  "packages/rules/scripts/experiments/hidden-barriers.ts",
  "packages/rules/src/map.ts",
  "packages/rules/src/math.ts",
  "packages/rules/src/hidden.ts",
  "packages/rules/src/ruleset.ts",
  "docs/spec/data/game_config.yaml",
  "packages/spec-data/generated/game_config.json",
  "packages/spec-data/generated/vendetta.json",
  "pnpm-lock.yaml",
];
const sourceHashes = Object.fromEntries(
  sourceFiles.map((name) => [
    name,
    createHash("sha256")
      .update(readFileSync(join(root, name)))
      .digest("hex"),
  ]),
);
writeFileSync(
  join(output, "results.json"),
  JSON.stringify(
    {
      schema: 1,
      model: "synthetic resource dependency scheduler, not game execution",
      measurementSeconds: DAY,
      warmupSeconds: WARMUP,
      seeds: SEEDS,
      margins: MARGINS,
      parameters: {
        keeperTickSeconds: 2,
        inclusionSeconds: 5,
        revealSubmissionSeconds: 1,
        revealStartGapSeconds: 1,
        executionServiceSeconds: 1,
        syntheticReturnSeconds: 3600,
        actionSamplesPerRun: 20000,
        incidentSamplesPerRun: 5000,
      },
      nodeVersion: process.version,
      sourceHashes,
      nonFinite: "Infinity is serialized as the string Infinity, not a measured finite wait",
      scenarios: SCENARIOS,
      runs,
    },
    (_, v: unknown) => (typeof v === "number" && !Number.isFinite(v) ? String(v) : v),
    2,
  ) + "\n",
);
const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "∞");
let summary =
  "# Resultados de la simulación sintética\n\nMedias de tres semillas; cada fila usa margen de apertura de 3 s. No son medidas de Gnosis ni una ejecución del juego. Los percentiles son medias de percentiles por ejecución. Ver el informe de metodología y los parámetros completos en results.json.\n\n| Escenario | Modelo | Edificio bloqueado (%) | Todos bloqueados (%) | Espera p95 (s) | Espera p99 (s) | Recuperación keeper (s) | Alcance medio (%) |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |\n";
for (const s of SCENARIOS) {
  for (const mode of MODES) {
    const subset = runs.filter((r) => r.scenario === s.name && r.mode === mode && r.margin === 3);
    const mean = (
      key:
        | "buildingBlockedPct"
        | "allBuildingsBlockedPct"
        | "actionWaitP95"
        | "actionWaitP99"
        | "keeperRecoverySeconds"
        | "meanScopePct",
    ) => subset.reduce((sum, r) => sum + r[key], 0) / subset.length;
    summary += `| ${s.name} | ${mode} | ${fmt(mean("buildingBlockedPct"))} | ${fmt(mean("allBuildingsBlockedPct"))} | ${fmt(mean("actionWaitP95"))} | ${fmt(mean("actionWaitP99"))} | ${fmt(mean("keeperRecoverySeconds"))} | ${fmt(mean("meanScopePct"))} |\n`;
  }
}
writeFileSync(join(output, "summary.md"), summary);
const mean = (
  subset: typeof runs,
  key:
    "buildingBlockedPct" | "actionWaitP95" | "incidentBuildingBlockedPct" | "incidentActionWaitP95",
) => subset.reduce((sum, r) => sum + r[key], 0) / subset.length;
let sensitivity =
  "# Sensibilidad al margen de apertura\n\nEscenario medium-local, medias de tres semillas. Margen 0 es una referencia optimista, no una recomendación de privacidad.\n\n| Margen (s) | Modelo | Edificio bloqueado (%) | Espera p95 (s) |\n| ---: | --- | ---: | ---: |\n";
for (const margin of MARGINS)
  for (const mode of MODES) {
    const subset = runs.filter(
      (r) => r.scenario === "medium-local" && r.mode === mode && r.margin === margin,
    );
    sensitivity += `| ${margin} | ${mode} | ${fmt(mean(subset, "buildingBlockedPct"))} | ${fmt(mean(subset, "actionWaitP95"))} |\n`;
  }
sensitivity +=
  "\n# Ventana del incidente\n\nMargen de 3 s. La ventana comienza con la ráfaga o caída: 30 min para ráfagas, 60 min para caídas de 30 min (incluye 30 min posteriores).\n\n| Escenario | Modelo | Edificio bloqueado en ventana (%) | Espera p95 en ventana (s) |\n| --- | --- | ---: | ---: |\n";
for (const s of SCENARIOS.filter((s) => s.outage || s.attackers))
  for (const mode of MODES) {
    const subset = runs.filter((r) => r.scenario === s.name && r.mode === mode && r.margin === 3);
    sensitivity += `| ${s.name} | ${mode} | ${fmt(mean(subset, "incidentBuildingBlockedPct"))} | ${fmt(mean(subset, "incidentActionWaitP95"))} |\n`;
  }
writeFileSync(join(output, "sensitivity.md"), sensitivity);
process.stdout.write(`Wrote ${runs.length} runs to ${output}\n`);
