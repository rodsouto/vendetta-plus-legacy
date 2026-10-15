import { describe, expect, it } from "vitest";
import { sim, vendetta as rs } from "../src/index.js";

const room = (id: string) => rs.buildings.findIndex((b) => b.id === id);
const res = (id: string) => rs.research.findIndex((r) => r.id === id);
const at = { city: 1n, neighborhood: 1n, slot: 1n };

function fresh() {
  const w = sim.newWorld(rs);
  sim.register(w, "alice", at, 1000n);
  return { w, b: w.buildings.get(1n)!, p: w.players.get(1n)! };
}

describe("sim: register", () => {
  it("creates the first building with the starting state", () => {
    const { w, b, p } = fresh();
    expect(sim.visibleStock(w, b)).toEqual([10000n, 10000n, 10000n, 10000n]);
    expect(b.levels[rs.roles.buildSpeedRoom]).toBe(1n);
    expect(p.centipoints).toBe(rs.buildings[rs.roles.buildSpeedRoom]!.centipoints);
  });
  it("rejects a taken slot, a second account and bad coordinates", () => {
    const { w } = fresh();
    expect(() => sim.register(w, "bob", at, 1000n)).toThrow("SlotTaken");
    expect(() => sim.register(w, "alice", { ...at, slot: 2n }, 1000n)).toThrow("AlreadyRegistered");
    expect(() => sim.register(w, "bob", { ...at, slot: 256n }, 1000n)).toThrow("InvalidCoordinate");
  });
});

describe("sim: production", () => {
  it("produces exactly 10 weapons per hour at level 0 (B-27)", () => {
    const { w, b } = fresh();
    b.stock[0] = 0n; // the starting 10,000 already fill the level-0 storage
    sim.poke(w, 1n, 1000n + 3600n);
    expect(sim.visibleStock(w, b)[0]).toBe(10n);
    expect(b.stock[0]).toBe(10n * sim.stockScale(rs));
  });
  it("clamps at storage capacity (D-10)", () => {
    const { w, b } = fresh();
    sim.poke(w, 1n, 1000n + 3600n * 24n * 365n);
    expect(sim.visibleStock(w, b)[0]).toBe(10000n); // capacity at level 0 is 10,000
  });
});

describe("sim: room queue", () => {
  it("pays the first item, finishes it and gives points", () => {
    const { w, b, p } = fresh();
    const armoury = room("weapons_armoury");
    sim.queueRoom(w, "alice", 1n, armoury, 1000n);
    const finish = b.roomQueue[0]!.finishAt;
    expect(sim.visibleStock(w, b)[0]).toBe(10000n - 12n);
    sim.poke(w, 1n, finish);
    expect(b.levels[armoury]).toBe(1n);
    expect(b.roomQueue).toHaveLength(0);
    expect(p.centipoints).toBe(600n + 232n);
  });
  it("enforces the queue limit without premium and requirements (D-13)", () => {
    const { w } = fresh();
    sim.queueRoom(w, "alice", 1n, room("brewery"), 1000n);
    expect(() => sim.queueRoom(w, "alice", 1n, room("brewery"), 1000n)).toThrow("QueueFull");
    const w2 = fresh().w;
    expect(() => sim.queueRoom(w2, "alice", 1n, room("bar"), 1000n)).toThrow("RequirementsNotMet");
  });
  it("refunds the item in progress on cancel", () => {
    const { w, b } = fresh();
    sim.queueRoom(w, "alice", 1n, room("boss_office"), 1000n);
    sim.cancelRoom(w, "alice", 1n, 0, 1000n);
    expect(sim.visibleStock(w, b).slice(0, 2)).toEqual([10000n, 10000n]);
  });
});

describe("sim: research", () => {
  it("requires the research-speed room (D-14)", () => {
    const { w } = fresh();
    expect(() => sim.queueResearch(w, "alice", 1n, res("routing"), 1000n)).toThrow(
      "TimingRoomRequired",
    );
  });
});

describe("sim: alcohol depletion at a whole second (B-28)", () => {
  it("runs at full rate until ⌈stock / drain⌉, then at the starved rate", () => {
    const { w, b } = fresh();
    const S = sim.stockScale(rs);
    b.levels = rs.buildings.map(() => 0n);
    b.levels[room("bar")] = 1n;
    b.levels[room("smuggle")] = 1n;
    b.stock = [0n, 0n, 46n * S, 0n];
    b.lastUpdate = 0n;
    sim.integrate(w, b, 3600n);
    // Same numbers as contracts/test/core/Settlement.t.sol.
    expect(b.stock[2]).toBe(0n);
    expect(b.stock[3]).toBe(23n * 28n * 1800n + 28n * 1800n);
  });
});

describe("sim: missions (same cases as contracts/test/core/Missions.t.sol)", () => {
  const ROWDY = rs.troops.findIndex((t) => t.id === "rowdy");
  const rowdies = (n: bigint) => rs.troops.map((_, i) => (i === ROWDY ? n : 0n));
  const none = [0n, 0n, 0n, 0n];

  function twoPlayers() {
    const w = sim.newWorld(rs);
    let now = 1_700_000_000n;
    sim.setGlobalPremium(w, now + 3650n * 86400n);
    sim.register(w, "alice", at, now);
    sim.register(w, "bob", { ...at, slot: 2n }, now);
    sim.queueRoom(w, "alice", 1n, room("boot_camp"), now);
    now += 86400n;
    sim.train(w, "alice", 1n, ROWDY, 7n, now);
    now += 86400n;
    sim.poke(w, 1n, now);
    return { w, now };
  }

  it("loots an undefended building: 5 × 200 capacity split evenly over the unprotected stock (D-06)", () => {
    const { w, now } = twoPlayers();
    const id = sim.sendMission(
      w,
      "alice",
      1n,
      sim.ATTACK,
      { ...at, slot: 2n },
      rowdies(5n),
      none,
      0n,
      now,
    );
    const m = w.missions.get(id)!;
    sim.advance(w, 1, m.arrival);
    expect(m.returning).toBe(true);
    expect(m.cargo).toEqual([250n, 250n, 250n, 250n]);
    expect(sim.visibleStock(w, w.buildings.get(2n)!)).toEqual([9750n, 9750n, 9750n, 9750n]);
  });

  it("an attack on an empty slot comes back with every unit", () => {
    const { w, now } = twoPlayers();
    const id = sim.sendMission(
      w,
      "alice",
      1n,
      sim.ATTACK,
      { ...at, slot: 50n },
      rowdies(3n),
      none,
      0n,
      now,
    );
    const m = w.missions.get(id)!;
    sim.advance(w, 1, m.arrival);
    sim.poke(w, 1n, m.arrival);
    expect(w.buildings.get(1n)!.troops[ROWDY]).toBe(7n);
  });

  it("reverts with Backlog when more missions are due than one action processes (B-08)", () => {
    const { w, now } = twoPlayers();
    for (let i = 0n; i < 7n; i++)
      sim.sendMission(
        w,
        "alice",
        1n,
        sim.ATTACK,
        { ...at, slot: 100n + i },
        rowdies(1n),
        none,
        0n,
        now,
      );
    const later = now + 30n * 86400n;
    expect(() => sim.poke(w, 2n, later)).toThrow("Backlog");
    expect(sim.advance(w, 4, later)).toBe(4);
    sim.poke(w, 2n, later);
    expect(w.pending).toHaveLength(0);
  });

  it("never abandons the last building (B-30)", () => {
    const { w, now } = twoPlayers();
    expect(() => sim.abandon(w, "alice", 1n, now)).toThrow("LastBuilding");
  });
});

describe("sim: account (D-18, B-14, B-25, B-26)", () => {
  const day = 86400n;
  it("vacation locks the account, blocks new missions to it and has a 7-day cooldown", () => {
    const w = sim.newWorld(rs);
    const t = 1_700_000_000n;
    sim.register(w, "alice", at, t);
    sim.register(w, "bob", { ...at, slot: 2n }, t);
    sim.startVacation(w, "bob", t);
    expect(() => sim.queueRoom(w, "bob", 2n, room("boss_office"), t + 1n)).toThrow("OnVacation");
    expect(() =>
      sim.sendMission(
        w,
        "alice",
        1n,
        sim.ATTACK,
        { ...at, slot: 2n },
        rs.troops.map(() => 0n),
        [0n, 0n, 0n, 0n],
        0n,
        t + 1n,
      ),
    ).toThrow("TargetOnVacation");
    sim.endVacation(w, "bob", t + day);
    expect(() => sim.startVacation(w, "bob", t + day + 6n * day)).toThrow("VacationCooldown");
    sim.startVacation(w, "bob", t + day + 7n * day);
  });

  it("a suspended player cannot act; premium raises queue limits; transfer moves the account", () => {
    const w = sim.newWorld(rs);
    const t = 1_700_000_000n;
    sim.register(w, "alice", at, t);
    sim.suspend(w, 1n, t + 100n);
    expect(() => sim.queueRoom(w, "alice", 1n, room("boss_office"), t)).toThrow("Suspended");
    sim.suspend(w, 1n, 0n);
    sim.grantPremium(w, 1n, t + day);
    sim.queueRoom(w, "alice", 1n, room("weapons_armoury"), t);
    sim.queueRoom(w, "alice", 1n, room("weapons_armoury"), t); // second item: premium only
    sim.transferPlayer(w, "alice", "carol", t);
    expect(w.playerOf.get("carol")).toBe(1n);
    expect(() => sim.queueRoom(w, "alice", 1n, room("boss_office"), t)).toThrow("NotRegistered");
  });
});

describe("sim: families and wars (D-20, B-31)", () => {
  it("creates, applies, accepts; names are unique ignoring case; the Capo cannot be kicked", () => {
    const w = sim.newWorld(rs);
    const t = 1_700_000_000n;
    for (const [i, c] of ["alice", "bob", "carol"].entries())
      sim.register(w, c, { ...at, slot: BigInt(i + 1) }, t);
    const f = sim.createFamily(w, "alice", "MOB", "The Mob", t);
    expect(() => sim.createFamily(w, "bob", "mob", "Other", t)).toThrow("NameTaken");
    sim.applyToFamily(w, "bob", f, t);
    sim.acceptApplication(w, "alice", 2n, t);
    expect(sim.familyOf(w, w.players.get(2n)!)).toBe(f);
    sim.setRank(w, "alice", 2n, sim.SUBCAPO, t);
    expect(() => sim.kickMember(w, "bob", 1n, t)).toThrow("NotAllowed");
    sim.dissolveFamily(w, "alice", t);
    expect(sim.familyOf(w, w.players.get(2n)!)).toBe(0n); // lapsed lazily
  });

  it("war score adds each side's lost troop points; surrender ends the war", () => {
    const w = sim.newWorld(rs);
    const t = 1_700_000_000n;
    sim.register(w, "alice", at, t);
    sim.register(w, "bob", { ...at, slot: 2n }, t);
    const a = sim.createFamily(w, "alice", "AAA", "Alpha", t);
    const b = sim.createFamily(w, "bob", "BBB", "Beta", t);
    const war = sim.declareWar(w, "alice", b, t);
    expect(() => sim.declareWar(w, "bob", a, t)).toThrow("AlreadyAtWar");
    sim.warScore(w, w.players.get(1n)!, w.players.get(2n)!, 600n, 300n);
    expect([w.wars.get(war)!.lostA, w.wars.get(war)!.lostB]).toEqual([600n, 300n]);
    sim.offerPeace(w, "bob", war, sim.OFFER_SURRENDER, t);
    sim.answerPeace(w, "alice", war, true, t);
    expect(w.wars.get(war)!.winner).toBe(a);
  });
});

describe("sim: market (D-19, B-11)", () => {
  it("checks the fixed rates exactly and settles deliveries by trade id", () => {
    const w = sim.newWorld(rs);
    const t = 1_700_000_000n;
    sim.register(w, "alice", at, t);
    sim.register(w, "bob", { ...at, slot: 2n }, t);
    // 3-5-1: 1 dollar = 3 weapons = 5 ammunition. Sell 300 weapons for 100 dollars.
    expect(() => sim.offerTrade(w, "alice", 2n, 0, 300n, [0n, 0n, 0n, 99n], t)).toThrow(
      "InvalidOffer",
    );
    const id = sim.offerTrade(w, "alice", 2n, 0, 300n, [0n, 0n, 0n, 100n], t);
    // 2-4-1 works too: 200 weapons = 400 ammunition.
    sim.offerTrade(w, "alice", 2n, 0, 200n, [0n, 400n, 0n, 0n], t);
    sim.acceptTrade(w, "bob", id, t);
    const tr = w.trades.get(id)!;
    const m: sim.Mission = {
      ...({} as sim.Mission),
      owner: 1n,
      trade: id,
      cargo: [120n, 0n, 0n, 0n],
    };
    sim.settleTrade(w, m, w.buildings.get(2n)!, t + 10n);
    expect(tr.delivered).toBe(120n);
    sim.settleTrade(w, { ...m, cargo: [0n, 5n, 0n, 0n] }, w.buildings.get(2n)!, t + 10n);
    expect(tr.delivered).toBe(120n); // wrong resource: a plain transport
    sim.settleTrade(
      w,
      { ...m, owner: 2n, cargo: [0n, 0n, 0n, 100n] },
      w.buildings.get(1n)!,
      t + 10n,
    );
    expect(tr.paid).toEqual([0n, 0n, 0n, 100n]);
    sim.settleTrade(w, { ...m, cargo: [180n, 0n, 0n, 0n] }, w.buildings.get(2n)!, t + 11n * 86400n);
    expect(tr.delivered).toBe(120n); // after the 10-day window it no longer settles
  });
});
