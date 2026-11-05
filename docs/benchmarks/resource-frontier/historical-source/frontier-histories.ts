import { createHash } from "node:crypto";
import { sim, vendetta as rs, type Coord } from "../../src/index.js";
import {
  acceptEvidence,
  canonicalValue,
  canonicalWorld,
  cloneWorld,
  ResourceFrontier,
  type Action,
  type ActionResult,
  type Evidence,
} from "./resource-frontier.js";

const YEAR = 365n * 86400n;
const c = (slot: bigint): Coord => ({ city: 1n, neighborhood: 1n, slot });
const FAR: Coord = { city: 50n, neighborhood: 50n, slot: 255n };
const rowdy = rs.troops.findIndex((t) => t.id === "rowdy");
const room = (id: string) => rs.buildings.findIndex((b) => b.id === id);
const units = (index: number, n: bigint) => rs.troops.map((_, i) => (i === index ? n : 0n));
const zero = () => rs.resources.map(() => 0n);

function rng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const prepared = new Map<boolean, { world: sim.World; now: bigint; actions: number }>();
/** Reachable fixtures: every building, research level and troop is obtained through public sim actions. */
export function legalFixture(occupation = false) {
  const cached = prepared.get(occupation);
  if (cached) return { ...cached, world: cloneWorld(cached.world) };
  const w = sim.newWorld(rs);
  let now = 1_700_000_000n,
    actions = 0;
  const act = (f: () => unknown) => {
    f();
    actions++;
  };
  act(() => sim.setGlobalPremium(w, now + 1000n * YEAR));
  for (const [caller, coord] of [
    ["alice", c(1n)],
    ["bob", c(2n)],
    ["carol", FAR],
    ["dave", { ...FAR, slot: 254n }],
  ] as const) {
    act(() => sim.register(w, caller, coord, now));
  }
  for (const [caller, building] of [
    ["alice", 1n],
    ["bob", 2n],
  ] as const) {
    act(() => sim.queueRoom(w, caller, building, room("boot_camp"), now));
    now += YEAR;
    for (let batch = 0; batch < 4; batch++) {
      act(() => sim.train(w, caller, building, rowdy, 5n, now));
      now += YEAR;
    }
  }
  for (const [caller, building] of [
    ["alice", 1n],
    ["bob", 2n],
    ["carol", 3n],
  ] as const) {
    act(() => sim.queueRoom(w, caller, building, room("mob_school"), now));
    now += YEAR;
  }
  if (occupation) {
    for (const [id, level] of [
      ["weapons_armoury", 5],
      ["ammunition_depot", 5],
      ["brewery", 5],
      ["bar", 5],
      ["weapon_storage", 1],
      ["ammunition_storage", 1],
      ["safe_room", 1],
    ] as const) {
      for (let i = 0; i < level; i++) {
        act(() => sim.queueRoom(w, "alice", 1n, room(id), now));
        now += YEAR;
      }
    }
    for (let i = 0; i < 5; i++) {
      act(() =>
        sim.queueResearch(
          w,
          "alice",
          1n,
          rs.research.findIndex((r) => r.id === "routing"),
          now,
        ),
      );
      now += YEAR;
    }
    act(() => sim.train(w, "alice", 1n, rs.roles.occupationTroop, 1n, now));
    now += YEAR;
  }
  for (const id of w.buildings.keys()) act(() => sim.poke(w, id, now));
  let fa = 0n,
    fb = 0n;
  act(() => {
    fa = sim.createFamily(w, "carol", "AAA", "Alpha family", now);
  });
  act(() => sim.applyToFamily(w, "alice", fa, now));
  act(() => sim.acceptApplication(w, "carol", 1n, now));
  act(() => {
    fb = sim.createFamily(w, "bob", "BBB", "Beta family", now);
  });
  act(() => sim.declareWar(w, "carol", fb, now));
  act(() => sim.offerTrade(w, "bob", 4n, 2n, 0, 60n, [0n, 100n, 0n, 0n], now));
  act(() => sim.offerTrade(w, "bob", 1n, 2n, 0, 6n, [0n, 10n, 0n, 0n], now));
  act(() => sim.acceptTrade(w, "alice", 2n, 1n, now));
  const result = { world: w, now, actions };
  prepared.set(occupation, { ...result, world: cloneWorld(w) });
  return result;
}

export interface HistoryOptions {
  seed: number;
  delay: bigint;
  occupation?: boolean;
  permanent?: boolean;
}
export interface TraceEntry {
  at: bigint;
  action: Action;
  result: ActionResult;
}

const resultKey = (r: ActionResult) =>
  JSON.stringify(r, (_, v: unknown) => (typeof v === "bigint" ? v.toString() : v));

export function runHistory(options: HistoryOptions) {
  const { seed, delay, occupation = false, permanent = false } = options;
  const { world: initial, now, actions: preparationActions } = legalFixture(occupation);
  const rand = rng(seed);
  const evidence: (Evidence & { ready: bigint })[] = [];
  const hidden = (
    caller: string,
    origin: bigint,
    kind: number,
    target: Coord,
    troop: number,
    count: bigint,
    cover: bigint,
  ) => {
    const owner = initial.playerOf.get(caller)!;
    const salt = BigInt(seed) * 100n + BigInt(evidence.length + 1);
    const id = sim.sendHiddenMission(
      initial,
      caller,
      origin,
      sim.hiddenCommit(owner, kind, target, salt),
      cover,
      units(troop, count),
      zero(),
      0n,
      now,
    );
    const ready = initial.missions.get(id)!.arrival + delay + BigInt(Math.floor(rand() * 17));
    evidence.push({ mission: id, kind, target, salt, ready });
  };
  hidden(
    "alice",
    1n,
    sim.ATTACK,
    c(2n),
    rowdy,
    1n + BigInt(Math.floor(rand() * 18)),
    1n + BigInt(Math.floor(rand() * 2)),
  );
  hidden(
    "bob",
    2n,
    sim.ATTACK,
    c(1n),
    rowdy,
    1n + BigInt(Math.floor(rand() * 18)),
    1n + BigInt(Math.floor(rand() * 2)),
  );
  if (occupation) hidden("alice", 1n, sim.OCCUPY, c(4n), rs.roles.occupationTroop, 1n, 3n);
  // A real public trade payment links the unknown arrivals to escrow/share finality.
  sim.sendMission(
    initial,
    "alice",
    1n,
    sim.TRANSPORT,
    c(2n),
    units(rowdy, 1n),
    [0n, 10n, 0n, 0n],
    2n,
    now,
  );
  const routing = rs.research.findIndex((r) => r.id === "routing");
  const arrivals = evidence.map((e) => initial.missions.get(e.mission)!.arrival);
  const first = arrivals.reduce((a, b) => (a < b ? a : b));
  const entries: { at: bigint; action: Action }[] = [];
  const add = (offset: bigint, action: Action) => entries.push({ at: first + offset, action });
  // Real queues started just before arrival finish while the reveal may still be pending.
  add(-1n, { type: "queueResearch", caller: "carol", building: 3n, research: routing });
  if (!occupation)
    add(-1n, { type: "queueResearch", caller: "alice", building: 1n, research: routing });
  add(-1n, { type: "train", caller: "bob", building: 2n, troop: rowdy, quantity: 1n });
  add(1n, { type: "poke", building: 3n });
  add(2n, { type: "queueRoom", caller: "carol", building: 3n, room: room("weapons_armoury") });
  add(3n, {
    type: "register",
    caller: `outside-${seed}`,
    coord: { ...FAR, slot: BigInt(200 + (seed % 40)) },
  });
  add(4n, { type: "poke", building: 1n });
  add(5n, { type: "acceptTrade", caller: "dave", trade: 1n, building: 4n });
  add(6n, { type: "dissolveFamily", caller: "carol" });
  add(7n, { type: "setRank", caller: "carol", target: 1n, rank: sim.SUBCAPO });
  add(8n, { type: "register", caller: `inside-${seed}`, coord: c(3n) });
  const spread = Number(delay + 600n);
  for (let i = 0; i < 32; i++) {
    const at = 10n + BigInt(Math.floor(rand() * spread));
    const p = Math.floor(rand() * 4) + 1;
    const caller = ["alice", "bob", "carol", "dave"][p - 1]!;
    const choose = Math.floor(rand() * 14);
    const b = BigInt(p);
    if (choose === 0) add(at, { type: "poke", building: b });
    if (choose === 1)
      add(at, { type: "queueRoom", caller, building: b, room: room("weapons_armoury") });
    if (choose === 2) add(at, { type: "train", caller, building: b, troop: rowdy, quantity: 1n });
    if (choose === 3) add(at, { type: "acceptTrade", caller: "dave", trade: 1n, building: 4n });
    if (choose === 4) add(at, { type: "dissolveFamily", caller: "carol" });
    if (choose === 5)
      add(at, { type: "withdrawTrade", caller, trade: 1n, building: b, amount: [1n, 0n, 0n, 0n] });
    if (choose === 6)
      add(at, {
        type: "send",
        caller,
        building: b,
        kind: sim.TRANSPORT,
        target: c(p === 1 ? 2n : 1n),
        troops: units(rowdy, 1n),
        cargo: zero(),
        trade: 0n,
      });
    if (choose === 7) add(at, { type: "abandon", caller, building: b });
    if (choose === 8) add(at, { type: "setRank", caller: "carol", target: 1n, rank: sim.MEMBER });
    if (choose === 9) add(at, { type: "queueResearch", caller, building: b, research: routing });
    if (choose === 10) add(at, { type: "cancelRoom", caller, building: b, position: 0 });
    if (choose === 11) add(at, { type: "cancelResearch", caller, building: b, position: 0 });
    if (choose === 12)
      add(at, { type: "cancelTraining", caller, building: b, queue: 0, position: 0 });
    if (choose === 13)
      add(at, {
        type: "recall",
        caller,
        mission: evidence[Math.floor(rand() * evidence.length)]!.mission,
      });
  }
  const afterWindow =
    entries.reduce((a, b) => (a > b.at ? a : b.at), first) + rs.config.marketWindowSeconds + 1n;
  // Spend before withdrawing, so the real storage-capacity check can succeed.
  entries.push(
    {
      at: afterWindow,
      action: { type: "train", caller: "bob", building: 2n, troop: rowdy, quantity: 1n },
    },
    {
      at: afterWindow,
      action: {
        type: "withdrawTrade",
        caller: "bob",
        trade: 1n,
        building: 2n,
        amount: [1n, 0n, 0n, 0n],
      },
    },
    {
      at: afterWindow + 1n,
      action: { type: "train", caller: "alice", building: 1n, troop: rowdy, quantity: 1n },
    },
    {
      at: afterWindow + 1n,
      action: {
        type: "withdrawTrade",
        caller: "alice",
        trade: 2n,
        building: 1n,
        amount: [1n, 0n, 0n, 0n],
      },
    },
  );
  entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const local = new ResourceFrontier(cloneWorld(initial));
  const oracle = new ResourceFrontier(cloneWorld(initial), true);
  for (const e of evidence) acceptEvidence(oracle.world, e);
  const pendingEvidence = [...evidence].sort((a, b) => (a.ready < b.ready ? -1 : 1));
  const trace: TraceEntry[] = [];
  const deliver = (until: bigint) => {
    while (!permanent && pendingEvidence.length && pendingEvidence[0]!.ready <= until) {
      const e = pendingEvidence.shift()!;
      acceptEvidence(local.world, e);
      local.advance(e.ready);
    }
  };
  for (const entry of entries) {
    deliver(entry.at);
    const result = local.attempt(entry.action, entry.at);
    oracle.advance(entry.at);
    if (result.status !== "blocked") {
      const expected = oracle.attempt(entry.action, entry.at);
      if (resultKey(result) !== resultKey(expected)) {
        throw new Error(
          `Action mismatch seed=${seed} type=${entry.action.type}: ${resultKey(result)} != ${resultKey(expected)}`,
        );
      }
    }
    trace.push({ ...entry, result });
  }
  const end = now + YEAR;
  deliver(end);
  local.advance(end);
  oracle.advance(end);
  let equal: boolean | null = null;
  let receiptsEqual: boolean | null = null;
  let worldDigests: { local: string; oracle: string } | null = null;
  if (!permanent) {
    if (local.world.pending.length) throw new Error("Unfinished finite history");
    for (const [id, b] of local.world.buildings) sim.settle(local.world, b, end);
    for (const [id, b] of oracle.world.buildings) sim.settle(oracle.world, b, end);
    const localState = canonicalWorld(local.world),
      oracleState = canonicalWorld(oracle.world);
    equal = localState === oracleState;
    worldDigests = {
      local: createHash("sha256").update(localState).digest("hex"),
      oracle: createHash("sha256").update(oracleState).digest("hex"),
    };
    if (!equal)
      throw new Error(`Final world mismatch seed=${seed} delay=${delay} occupation=${occupation}`);
    const receipts = (planner: ResourceFrontier) =>
      [...planner.execution]
        .map(({ wall, ...e }) => e)
        .sort((a, b) =>
          a.mission < b.mission
            ? -1
            : a.mission > b.mission
              ? 1
              : Number(a.returning) - Number(b.returning),
        );
    receiptsEqual = canonicalValue(receipts(local)) === canonicalValue(receipts(oracle));
    if (!receiptsEqual)
      throw new Error(
        `Mission receipt mismatch seed=${seed} delay=${delay} occupation=${occupation}`,
      );
  }
  return {
    seed,
    delay,
    occupation,
    permanent,
    preparationActions,
    equal,
    receiptsEqual,
    worldDigests,
    accepted: trace.filter((t) => t.result.status === "accepted").length,
    reverted: trace.filter((t) => t.result.status === "reverted").length,
    blocked: trace.filter((t) => t.result.status === "blocked").length,
    allocatorBlocked: trace.filter((t) => t.result.resource?.startsWith("allocator:")).length,
    lateRootExecutions: local.execution.filter(
      (e) =>
        evidence.some((v) => v.mission === e.mission) &&
        !e.returning &&
        e.wall > e.at + rs.config.hiddenRevealGrace,
    ).length,
    pending: local.world.pending.length,
    tradePaymentApplied: local.world.trades.get(2n)!.paid[1] === 10n,
    evidence,
    trace,
    execution: local.execution,
  };
}
