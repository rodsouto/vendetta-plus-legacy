import { CONSUMERS } from "../../test/v2-helpers.js";
// Controlled counterfactual schedules over the real TS state machine. Fixtures seed
// mature state; queue isolation is a research harness, never a proposed public API.
import { honorPct, sim, vendetta as rs, type Coord } from "../../src/index.js";

const T = 1_000_000n;
const ARRIVAL = T + 100n;
const LATER = T + 200n;
const coord = (slot: bigint): Coord => ({ city: 1n, neighborhood: 1n, slot });
const far: Coord = { city: 50n, neighborhood: 50n, slot: 255n };
const units = (index: number, n: bigint) => rs.troops.map((_, i) => (i === index ? n : 0n));
const none = () => rs.resources.map(() => 0n);
const rowdy = rs.troops.findIndex((t) => t.id === "rowdy");
const bouncer = rs.troops.findIndex((t) => t.id === "bouncer");

function world(): sim.World {
  const w = sim.newWorld(rs, CONSUMERS);
  for (const [caller, c] of [
    ["alice", coord(1n)],
    ["bob", coord(2n)],
    ["carol", far],
    ["dave", { ...far, slot: 254n }],
  ] as const) {
    sim.register(w, caller, c, T);
  }
  for (const p of w.players.values()) p.centipoints = 1_000_000_000n;
  return w;
}

function mission(w: sim.World, options: Partial<sim.Mission> = {}): bigint {
  const id = w.nextMission++;
  const m: sim.Mission = {
    id,
    owner: 1n,
    origin: 1n,
    kind: sim.ATTACK,
    returning: false,
    target: coord(2n),
    from: coord(1n),
    start: T,
    arrival: ARRIVAL,
    duration: 1000n,
    seq: w.seq++,
    troops: units(rowdy, 100n),
    cargo: none(),
    trade: 0n,
    hidden: false,
    cover: 2n,
    commit: "0x" + "00".repeat(32),
    ...options,
  };
  w.missions.set(id, m);
  w.players.get(m.owner)!.missions++;
  w.pending.push(id);
  sortQueue(w);
  return id;
}

function sortQueue(w: sim.World): void {
  w.pending.sort((a, b) => {
    const x = w.missions.get(a)!,
      y = w.missions.get(b)!;
    return x.arrival < y.arrival ? -1 : x.arrival > y.arrival ? 1 : x.seq < y.seq ? -1 : 1;
  });
}

function resolveOnly(w: sim.World, id: bigint): void {
  const saved = w.pending.filter((x) => x !== id);
  w.pending = [id];
  const at = w.missions.get(id)!.arrival;
  if (sim.processDue(w, at, 1) !== 1) throw new Error("Probe event did not resolve");
  w.pending.push(...saved);
  sortQueue(w);
}

function callWithout(w: sim.World, ids: bigint[], action: () => unknown): string {
  w.pending = w.pending.filter((id) => !ids.includes(id));
  let result = "ok";
  try {
    action();
  } catch (error) {
    result = error instanceof Error ? error.message : String(error);
  }
  for (const id of ids) if (w.missions.has(id) && !w.pending.includes(id)) w.pending.push(id);
  sortQueue(w);
  return result;
}

export interface Probe {
  name: string;
  expected: "conflict" | "commutes-on-projection";
  projection: string;
  chronological: unknown;
  overtaken: unknown;
  matches: boolean;
}
export const encodeProbe = (value: unknown) =>
  JSON.stringify(value, (_, v: unknown) => (typeof v === "bigint" ? v.toString() : v));

function compare(
  name: string,
  expected: Probe["expected"],
  projection: string,
  run: (overtaken: boolean) => unknown,
): Probe {
  const chronological = run(false),
    overtaken = run(true);
  return {
    name,
    expected,
    projection,
    chronological,
    overtaken,
    matches: encodeProbe(chronological) === encodeProbe(overtaken),
  };
}

function battleAndAction(
  setup: (w: sim.World) => void,
  action: (w: sim.World) => unknown,
  project: (w: sim.World, id: bigint, outcome: string) => unknown,
  late: boolean,
  options: Partial<sim.Mission> = {},
) {
  const w = world();
  setup(w);
  const id = mission(w, options);
  let outcome: string;
  if (late) {
    outcome = callWithout(w, [id], () => action(w));
    resolveOnly(w, id);
  } else {
    resolveOnly(w, id);
    outcome = callWithout(w, [], () => action(w));
  }
  return project(w, id, outcome);
}

export function dependencyProbes(): Probe[] {
  const probes: Probe[] = [];
  probes.push(
    compare(
      "remote-research-affects-battle",
      "conflict",
      "Surviving troops after attack; research completed by poke outside the cover",
      (late) =>
        battleAndAction(
          (w) => {
            const b = sim.newBuilding(w, 1n, { ...far, slot: 253n }, 1n, 10000n, T);
            const p = w.players.get(1n)!;
            p.buildings++;
            p.researchBuilding = b.id;
            p.researchQueue = [
              {
                index: rs.troops[bouncer]!.attackResearch[0]!,
                seq: w.seq++,
                finishAt: ARRIVAL + 50n,
              },
            ];
            w.buildings.get(2n)!.troops = units(bouncer, 50n);
          },
          (w) => sim.poke(w, 5n, LATER),
          (w, id) => ({
            survivors: w.missions.get(id)?.troops,
            defenders: w.buildings.get(2n)!.troops,
          }),
          late,
          { troops: units(bouncer, 100n) },
        ),
    ),
  );

  probes.push(
    compare(
      "poke-materializes-future-training",
      "conflict",
      "Troops after resolving attack and later training; poke is permissionless",
      (late) =>
        battleAndAction(
          (w) => {
            w.buildings.get(2n)!.training[0] = [
              { index: rowdy, quantity: 200n, seq: w.seq++, finishAt: ARRIVAL + 50n },
            ];
          },
          (w) => sim.poke(w, 2n, LATER),
          (w, id) => ({
            survivors: w.missions.get(id)?.troops,
            defenders: w.buildings.get(2n)!.troops,
          }),
          late,
        ),
    ),
  );

  probes.push(
    compare(
      "external-capo-dissolves-war-family",
      "conflict",
      "War loss counters; troop outcome is unchanged",
      (late) =>
        battleAndAction(
          (w) => {
            const fa = sim.createFamily(w, "carol", "AAA", "Alpha family", T);
            sim.applyToFamily(w, "alice", fa, T);
            sim.acceptApplication(w, "carol", 1n, T);
            const fb = sim.createFamily(w, "bob", "BBB", "Beta family", T);
            sim.declareWar(w, "carol", fb, T);
            w.buildings.get(2n)!.troops = units(rowdy, 100n);
          },
          (w) => sim.dissolveFamily(w, "carol", LATER),
          (w) => ({ lostA: w.wars.get(1n)!.lostA, lostB: w.wars.get(1n)!.lostB }),
          late,
        ),
    ),
  );

  probes.push(
    compare(
      "market-acceptance-from-outside-cover",
      "conflict",
      "Buyer acceptance outcome and attack loot",
      (late) =>
        battleAndAction(
          (w) => {
            sim.offerTrade(w, "bob", 3n, 2n, 0, 6000n, [0n, 10000n, 0n, 0n], T);
          },
          (w) => sim.acceptTrade(w, "carol", 1n, 3n, LATER),
          (w, id, outcome) => ({
            acceptance: outcome,
            accepted: w.trades.get(1n)!.accepted,
            loot: w.missions.get(id)?.cargo,
          }),
          late,
        ),
    ),
  );

  probes.push(
    compare(
      "empty-coordinate-registration",
      "conflict",
      "Attack loot after registration on a previously empty target",
      (late) =>
        battleAndAction(
          () => {},
          (w) => sim.register(w, "eve", coord(3n), LATER),
          (w, id) => ({ loot: w.missions.get(id)?.cargo }),
          late,
          { target: coord(3n) },
        ),
    ),
  );

  probes.push(
    compare(
      "blocked-payment-versus-final-trade-withdrawal",
      "conflict",
      "A pending payment must precede a withdrawal computed after the trade deadline",
      (late) => {
        const w = world();
        sim.offerTrade(w, "bob", 3n, 2n, 0, 3000n, [0n, 5000n, 0n, 0n], T);
        sim.acceptTrade(w, "carol", 1n, 3n, T);
        const trade = w.trades.get(1n)!;
        trade.closesAt = ARRIVAL + 50n;
        const outside = sim.newBuilding(w, 2n, { ...far, slot: 253n }, 1n, 0n, T);
        w.players.get(2n)!.buildings++;
        const amount = [...trade.deposit];
        const id = mission(w, {
          owner: 3n,
          origin: 3n,
          from: far,
          kind: sim.TRANSPORT,
          trade: 1n,
          cargo: [0n, 5000n, 0n, 0n],
          cover: 0n,
        });
        let outcome: string;
        if (late) {
          outcome = callWithout(w, [id], () =>
            sim.withdrawTrade(w, "bob", 1n, outside.id, amount, LATER),
          );
          resolveOnly(w, id);
        } else {
          resolveOnly(w, id);
          outcome = callWithout(w, [], () =>
            sim.withdrawTrade(w, "bob", 1n, outside.id, amount, LATER),
          );
        }
        return {
          withdrawal: outcome,
          paid: w.trades.get(1n)!.paid,
          sellerTook: w.trades.get(1n)!.sellerTook,
        };
      },
    ),
  );

  probes.push(
    compare(
      "disjoint-registration-changes-occupation-id",
      "conflict",
      "Building id assigned to occupation, despite disjoint coordinates and owners",
      (late) => {
        const w = world();
        const id = mission(w, {
          kind: sim.OCCUPY,
          target: coord(3n),
          troops: units(rs.roles.occupationTroop, rs.config.occupationTroopsConsumed),
        });
        if (late) callWithout(w, [id], () => sim.register(w, "eve", { ...far, slot: 252n }, LATER));
        resolveOnly(w, id);
        if (!late) sim.register(w, "eve", { ...far, slot: 252n }, LATER);
        return {
          occupiedId: w.buildingAt.get(sim.coordKey(coord(3n))),
          registeredId:
            w.playerOf.get("eve") && w.buildingAt.get(sim.coordKey({ ...far, slot: 252n })),
        };
      },
    ),
  );

  probes.push(
    compare(
      "outside-occupation-changes-honor",
      "conflict",
      "Attacker honor percentage observed before the attack",
      (late) => {
        const w = world();
        const p = w.players.get(1n)!;
        for (let i = 0; i < 3; i++) {
          sim.newBuilding(w, 1n, { ...far, slot: BigInt(240 + i) }, 1n, 0n, T);
          p.buildings++;
        }
        const attack = mission(w);
        const occupation = mission(w, {
          kind: sim.OCCUPY,
          target: { ...far, slot: 230n },
          troops: units(rs.roles.occupationTroop, rs.config.occupationTroopsConsumed),
          arrival: ARRIVAL + 50n,
        });
        if (late) resolveOnly(w, occupation);
        const pct = honorPct(rs, p.buildings, Number(p.research[rs.roles.honorResearch]!));
        resolveOnly(w, attack);
        if (!late) resolveOnly(w, occupation);
        return { attackHonorPct: pct };
      },
    ),
  );

  probes.push(
    compare(
      "return-sequence-crosses-unrelated-queue",
      "conflict",
      "Return seq versus a later unrelated room queue seq",
      (late) => {
        const w = world();
        const id = mission(w);
        const room = rs.buildings.findIndex((b) => b.id === "weapons_armoury");
        if (late) callWithout(w, [id], () => sim.queueRoom(w, "carol", 3n, room, LATER));
        resolveOnly(w, id);
        if (!late) sim.queueRoom(w, "carol", 3n, room, LATER);
        return {
          returnSeq: w.missions.get(id)!.seq,
          unrelatedQueueSeq: w.buildings.get(3n)!.roomQueue[0]!.seq,
        };
      },
    ),
  );

  probes.push(
    compare(
      "unrelated-poke-does-not-alter-battle",
      "commutes-on-projection",
      "Projected player/building values, missions and sequence",
      (late) =>
        battleAndAction(
          () => {},
          (w) => sim.poke(w, 3n, LATER),
          (w) => ({
            players: [...w.players],
            buildings: [...w.buildings],
            missions: [...w.missions],
            seq: w.seq,
          }),
          late,
        ),
    ),
  );

  probes.push(
    compare(
      "rank-only-change-does-not-alter-war-battle",
      "commutes-on-projection",
      "War counters and battle survivors with stable family membership and war lifecycle",
      (late) =>
        battleAndAction(
          (w) => {
            const fa = sim.createFamily(w, "carol", "AAA", "Alpha family", T);
            sim.applyToFamily(w, "alice", fa, T);
            sim.acceptApplication(w, "carol", 1n, T);
            const fb = sim.createFamily(w, "bob", "BBB", "Beta family", T);
            sim.declareWar(w, "carol", fb, T);
            w.buildings.get(2n)!.troops = units(rowdy, 100n);
          },
          (w) => sim.setRank(w, "carol", 1n, sim.SUBCAPO, LATER),
          (w, id) => ({
            lostA: w.wars.get(1n)!.lostA,
            lostB: w.wars.get(1n)!.lostB,
            survivors: w.missions.get(id)?.troops,
          }),
          late,
        ),
    ),
  );
  probes.push(
    compare(
      "war-loss-additions-with-stable-lifecycle",
      "commutes-on-projection",
      "Additive war loss totals only, not arbitrary family operations",
      (reverse) => {
        const w = world();
        const fa = sim.createFamily(w, "alice", "AAA", "Alpha family", T);
        const fb = sim.createFamily(w, "bob", "BBB", "Beta family", T);
        sim.declareWar(w, "alice", fb, T);
        const a = w.players.get(1n)!,
          b = w.players.get(2n)!;
        if (a.family !== fa) throw new Error("Unexpected family");
        const losses: [bigint, bigint][] = [
          [100n, 200n],
          [300n, 400n],
        ];
        if (reverse) losses.reverse();
        for (const [lostA, lostB] of losses) sim.warScore(w, a, b, lostA, lostB);
        return { lostA: w.wars.get(1n)!.lostA, lostB: w.wars.get(1n)!.lostB };
      },
    ),
  );
  return probes;
}
