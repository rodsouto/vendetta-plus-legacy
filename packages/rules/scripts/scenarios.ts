// Generates random core scenarios (sequences of actions over time) and the state after every step,
// computed by the TypeScript simulator. Foundry replays them against the Game contract
// (contracts/test/core/Scenarios.t.sol): any difference between the two implementations fails.
// Deterministic (seeded); output committed. Run with `pnpm codegen`.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sim, vendetta as rs } from "../src/index.js";

const SCENARIOS = 20;
const STEPS = 80;
const T0 = 1_700_000_000n;

/** Action codes shared with Scenarios.t.sol. */
const ACTION = {
  register: 0,
  queueRoom: 1,
  queueResearch: 2,
  cancelRoom: 3,
  cancelResearch: 4,
  poke: 5,
  setGlobalPremium: 6, // by the admin
} as const;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const queueSnap = (q: sim.QueueItem[]) => ({
  queue_finish: q.map((i) => Number(i.finishAt)),
  queue_index: q.map((i) => i.index),
  queue_seq: q.map((i) => Number(i.seq)),
});

function snapshot(w: sim.World) {
  return {
    buildings: [...w.buildings.values()].map((b) => ({
      centipoints: Number(b.centipoints),
      id: Number(b.id),
      last_update: Number(b.lastUpdate),
      levels: b.levels.map(Number),
      owner: Number(b.owner),
      ...queueSnap(b.roomQueue),
      stock: b.stock.map((s) => {
        if (s > BigInt(Number.MAX_SAFE_INTEGER))
          throw new Error("stock does not fit a JSON number");
        return Number(s);
      }),
    })),
    players: [...w.players.values()].map((p) => ({
      buildings: Number(p.buildings),
      centipoints: Number(p.centipoints),
      id: Number(p.id),
      ...queueSnap(p.researchQueue),
      research: p.research.map(Number),
      research_building: Number(p.researchBuilding),
    })),
  };
}

function scenario(seed: number) {
  const r = rng(seed);
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  const w = sim.newWorld(rs);
  // Premium scenarios have a single actor, so bursts pile up in one queue.
  const actors = seed % 2 === 1 ? 1 : 2 + Math.floor(r() * 4);
  let now = T0;
  const steps = [];
  for (let s = 0; s < STEPS; s++) {
    // Mostly short waits, sometimes hours or days, so queues finish and stock caps are reached.
    const roll = r();
    // With premium, bursts of actions in the same second build long queues.
    if (w.globalPremiumUntil > now && r() < 0.4) {
      /* same second */
    } else
      now += BigInt(
        Math.floor(roll < 0.5 ? r() * 600 : roll < 0.85 ? r() * 20_000 : r() * 400_000),
      );
    const actor = Math.floor(r() * actors);
    const controller = String(actor);
    const pid = w.playerOf.get(controller);
    const own = pid ? [...w.buildings.values()].filter((b) => b.owner === pid) : [];
    let action: number;
    let args: number[];
    if (s === 0 && seed % 2 === 1) {
      // Half of the scenarios run with premium on from the start: long queues, deferred payment
      // and dropped items (D-11).
      action = ACTION.setGlobalPremium;
      args = [Number(T0) + 10_000_000];
    } else if (r() < 0.04) {
      // The admin turns global premium on (for a while) or off, so long queues and D-11 get exercised.
      action = ACTION.setGlobalPremium;
      args = [r() < 0.7 ? Number(now) + Math.floor(r() * 300_000) : 0];
    } else if (pid === undefined || r() < 0.03) {
      action = ACTION.register;
      args = [1 + Math.floor(r() * 3), 1 + Math.floor(r() * 2), 1 + Math.floor(r() * 40)];
    } else {
      const b = pick(own);
      const k = r();
      if (k < (w.globalPremiumUntil > now ? 0.6 : 0.5))
        [action, args] = [ACTION.queueRoom, [Number(b.id), Math.floor(r() * rs.buildings.length)]];
      else if (k < 0.75)
        [action, args] = [
          ACTION.queueResearch,
          [Number(b.id), Math.floor(r() * rs.research.length)],
        ];
      else if (k < 0.82) [action, args] = [ACTION.cancelRoom, [Number(b.id), Math.floor(r() * 3)]];
      else if (k < 0.87)
        [action, args] = [ACTION.cancelResearch, [Number(b.id), Math.floor(r() * 3)]];
      else [action, args] = [ACTION.poke, [Number(pick([...w.buildings.keys()]))]];
    }
    // Bias room picks toward rooms whose requirements are met, so the world actually grows.
    if (action === ACTION.queueRoom && r() < 0.8) {
      const b = w.buildings.get(BigInt(args[0]!))!;
      const p = w.players.get(b.owner)!;
      const ok = rs.buildings.filter((x) =>
        x.requirements.every(
          (q) => (q.kind === "room" ? b.levels[q.index]! : p.research[q.index]!) >= q.level,
        ),
      );
      const school = rs.roles.researchSpeedRoom;
      args[1] = b.levels[school] === 0n && r() < 0.4 ? school : pick(ok).index;
    }
    if (action === ACTION.queueResearch && r() < 0.8) {
      const b = w.buildings.get(BigInt(args[0]!))!;
      const p = w.players.get(b.owner)!;
      const ok = rs.research.filter((x) =>
        x.requirements.every(
          (q) => (q.kind === "room" ? b.levels[q.index]! : p.research[q.index]!) >= q.level,
        ),
      );
      if (ok.length > 0) args[1] = pick(ok).index;
    }
    let error = "";
    try {
      const [a, b, c] = args.map(BigInt) as [bigint, bigint, bigint];
      if (action === ACTION.register)
        sim.register(w, controller, { city: a, neighborhood: b, slot: c }, now);
      else if (action === ACTION.queueRoom) sim.queueRoom(w, controller, a, Number(b), now);
      else if (action === ACTION.queueResearch) sim.queueResearch(w, controller, a, Number(b), now);
      else if (action === ACTION.cancelRoom) sim.cancelRoom(w, controller, a, Number(b), now);
      else if (action === ACTION.cancelResearch)
        sim.cancelResearch(w, controller, a, Number(b), now);
      else if (action === ACTION.setGlobalPremium) sim.setGlobalPremium(w, a);
      else sim.poke(w, a, now);
    } catch (e) {
      if (!(e instanceof sim.GameError)) throw e;
      error = e.code;
    }
    while (args.length < 3) args.push(0);
    steps.push({ action, actor, args, error, state: snapshot(w), time: Number(now) });
  }
  return { actors, seed, steps };
}

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../generated/scenarios/vendetta.json");
mkdirSync(dirname(out), { recursive: true });
const scenarios = Array.from({ length: SCENARIOS }, (_, i) => scenario(20261015 + i));
writeFileSync(out, JSON.stringify({ count: scenarios.length, scenarios }) + "\n");
const errors = scenarios.flatMap((s) => s.steps.map((x) => x.error)).filter(Boolean);
console.log(
  `packages/rules/generated/scenarios/vendetta.json: ${SCENARIOS} scenarios × ${STEPS} steps, ${errors.length} expected reverts`,
);
