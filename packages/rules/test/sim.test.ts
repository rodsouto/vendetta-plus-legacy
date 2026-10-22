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
    expect(() => sim.poke(w, 2n, later)).toThrow("Backlog"); // 3 arrivals and 4 returns still due
    expect(sim.advance(w, 100, later)).toBe(10);
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
    sim.transferPlayer(w, "alice", "carol", t); // scheduled
    expect(w.players.get(1n)!.transferTo).toBe("carol");
    expect(w.playerOf.has("carol")).toBe(false);
    expect(() => sim.transferPlayer(w, "alice", "carol", t)).toThrow("TransferPending");
    expect(() => sim.acceptTransfer(w, "carol", 1n, t)).toThrow("TransferPending");
    expect(() => sim.acceptTransfer(w, "dave", 1n, t + rs.config.controllerRemovalDelay)).toThrow(
      "NoTransfer",
    );
    sim.acceptTransfer(w, "carol", 1n, t + rs.config.controllerRemovalDelay); // the target takes it
    expect(w.playerOf.get("carol")).toBe(1n);
    expect(w.players.get(1n)!.transferTo).toBe("");
    expect(() => sim.queueRoom(w, "alice", 1n, room("boss_office"), t)).toThrow("NotRegistered");
  });

  it("several controllers manage one account; removing another one takes two steps (B-26)", () => {
    const w = sim.newWorld(rs);
    const t = 1_700_000_000n;
    const delay = rs.config.controllerRemovalDelay;
    const p = () => w.players.get(1n)!;
    sim.register(w, "phone", at, t);
    // an invitation binds nothing until the invited address accepts (B-26)
    sim.inviteController(w, "phone", "laptop", false, t);
    expect(w.playerOf.has("laptop")).toBe(false);
    expect(w.invites.get(sim.inviteKey("laptop", 1n))).toEqual({
      kind: sim.INVITE_CONTROLLER,
      recovery: false,
      until: t + rs.config.inviteTtl,
      epoch: 0n,
    });
    expect(() => sim.acceptController(w, "laptop", 2n, t)).toThrow("NotRegistered");
    expect(() => sim.acceptController(w, "other", 1n, t)).toThrow("NoInvite");
    sim.acceptController(w, "laptop", 1n, t);
    expect(w.invites.size).toBe(0);
    sim.inviteController(w, "laptop", "code", true, t);
    sim.acceptController(w, "code", 1n, t);
    expect(p().controllers).toEqual(["phone", "laptop", "code"]);
    expect(p().recovery).toEqual(new Set(["code"]));
    expect(() => sim.inviteController(w, "phone", "laptop", false, t)).toThrow("ControllerTaken");
    // an invitation expires, dies with the epoch, and can be cancelled
    sim.inviteController(w, "phone", "stale", false, t);
    expect(() => sim.acceptController(w, "stale", 1n, t + rs.config.inviteTtl)).toThrow("NoInvite");
    sim.inviteController(w, "phone", "dropped", false, t);
    sim.cancelInvite(w, "phone", "dropped", t);
    expect(() => sim.cancelInvite(w, "phone", "dropped", t)).toThrow("NoInvite");
    expect(() => sim.acceptController(w, "dropped", 1n, t)).toThrow("NoInvite");
    // sessions are invited too, and bind when they accept
    sim.authorizeSession(w, "phone", "key", t + day, t);
    expect(sim.sessionPlayer(w, "key", t)).toBeUndefined();
    expect(() => sim.acceptSession(w, "key", 1n, t + day)).toThrow("NoInvite"); // expired
    sim.acceptSession(w, "key", 1n, t);
    expect(sim.sessionPlayer(w, "key", t)).toBe(1n);
    expect(() => sim.inviteController(w, "key", "other", false, t)).toThrow("NotController");
    // the lost phone, from the recovery code: scheduled first; every session dies at once and
    // the phone keeps its rights meanwhile
    sim.removeController(w, "code", "phone", t);
    expect(p().controllers).toEqual(["phone", "laptop", "code"]);
    expect(p().removalAt.get("phone")).toBe(t + delay);
    expect(sim.sessionPlayer(w, "key", t)).toBeUndefined();
    sim.queueRoom(w, "phone", 1n, room("boss_office"), t);
    expect(() => sim.removeController(w, "code", "phone", t + delay - 1n)).toThrow(
      "RemovalPending",
    );
    sim.cancelRemoval(w, "phone", "phone", t); // the targeted one may cancel
    expect(p().removalAt.size).toBe(0);
    expect(() => sim.cancelRemoval(w, "phone", "phone", t)).toThrow("NoRemoval");
    sim.inviteController(w, "code", "late", false, t);
    sim.removeController(w, "code", "phone", t); // the epoch bumps: the invitation dies
    expect(() => sim.acceptController(w, "late", 1n, t)).toThrow("NoInvite");
    sim.removeController(w, "code", "phone", t + delay); // due: executed
    expect(p().controllers).toEqual(["code", "laptop"]);
    expect(p().removalAt.size).toBe(0);
    expect(p().sessionEpoch).toBe(3n);
    expect(() => sim.queueRoom(w, "phone", 1n, room("boss_office"), t)).toThrow("NotRegistered");
    sim.removeController(w, "code", "code", t + delay); // itself: at once
    expect(p().controllers).toEqual(["laptop"]);
    expect(p().recovery.size).toBe(0);
    expect(() => sim.removeController(w, "laptop", "laptop", t)).toThrow("LastController");
    for (let i = 1; i < rs.config.maxControllers; i++) {
      sim.inviteController(w, "laptop", `device${i}`, false, t);
      sim.acceptController(w, `device${i}`, 1n, t);
    }
    sim.inviteController(w, "laptop", "one-more", false, t);
    expect(() => sim.acceptController(w, "one-more", 1n, t)).toThrow("TooManyControllers");
    // a transfer in two steps too, cancellable by any controller meanwhile; the target accepts
    sim.transferPlayer(w, "laptop", "carol", t);
    sim.cancelTransfer(w, "device1", t);
    expect(() => sim.cancelTransfer(w, "device1", t)).toThrow("NoTransfer");
    sim.transferPlayer(w, "laptop", "carol", t);
    sim.acceptTransfer(w, "carol", 1n, t + delay);
    expect(p().controllers).toEqual(["carol"]);
    expect(w.playerOf.has("device1")).toBe(false);
    expect(w.invites.size).toBe(3); // stale, late and one-more: dead, still stored
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
    sim.offerPeace(w, "bob", war, sim.OFFER_DRAW, t); // replaced before alice answers
    expect(() => sim.answerPeace(w, "alice", war, sim.OFFER_SURRENDER, true, t)).toThrow("NoOffer");
    expect(sim.warOutcome(w, war)).toEqual({ ended: false, winner: 0n });
    sim.answerPeace(w, "alice", war, sim.OFFER_DRAW, false, t);
    sim.offerPeace(w, "bob", war, sim.OFFER_SURRENDER, t);
    sim.answerPeace(w, "alice", war, sim.OFFER_SURRENDER, true, t);
    expect(w.wars.get(war)!.winner).toBe(a);
    expect(sim.warOutcome(w, war)).toEqual({ ended: true, winner: a });
  });

  it("a family that dissolves loses its running wars (B-31)", () => {
    const w = sim.newWorld(rs);
    const t = 1_700_000_000n;
    sim.register(w, "alice", at, t);
    sim.register(w, "bob", { ...at, slot: 2n }, t);
    const a = sim.createFamily(w, "alice", "AAA", "Alpha", t);
    const b = sim.createFamily(w, "bob", "BBB", "Beta", t);
    const war = sim.declareWar(w, "alice", b, t);
    sim.dissolveFamily(w, "bob", t);
    expect(w.wars.get(war)!.ended).toBe(false); // lazy
    expect(sim.warOutcome(w, war)).toEqual({ ended: true, winner: a });
    expect(sim.warOutcome(w, 99n)).toEqual({ ended: false, winner: 0n });
  });
});

describe("sim: hidden missions (B-22): bond, refund deadline, garbage report", () => {
  const ROWDY = rs.troops.findIndex((t) => t.id === "rowdy");
  const rowdies = (n: bigint) => rs.troops.map((_, i) => (i === ROWDY ? n : 0n));
  const none = [0n, 0n, 0n, 0n];
  const c = rs.config;

  function ready() {
    const w = sim.newWorld(rs);
    let now = 1_700_000_000n;
    sim.setGlobalPremium(w, now + 3650n * 86400n);
    sim.setHiddenBond(w, c.hiddenMissionBondMin);
    sim.setKeeper(w, "keeper", true);
    sim.register(w, "alice", at, now);
    sim.register(w, "bob", { ...at, slot: 2n }, now);
    sim.queueRoom(w, "alice", 1n, room("boot_camp"), now);
    now += 86400n;
    sim.train(w, "alice", 1n, ROWDY, 7n, now);
    now += 86400n;
    sim.poke(w, 1n, now);
    return { w, now };
  }
  const salt = 5n;
  const target = { ...at, slot: 2n };
  const sendHidden = (w: sim.World, now: bigint, n = 5n) =>
    sim.sendHiddenMission(
      w,
      "alice",
      1n,
      sim.hiddenCommit(1n, sim.ATTACK, target, salt),
      3n,
      rowdies(n),
      none,
      now + 10n ** 7n,
      now,
    );

  it("the admin sets the bond within the bounds; a new deployment starts at the configured one", () => {
    const w = sim.newWorld(rs);
    expect(w.hiddenBond).toBe(c.hiddenMissionBond);
    expect(() => sim.setHiddenBond(w, c.hiddenMissionBondMin - 1n)).toThrow("InvalidBond");
    expect(() => sim.setHiddenBond(w, c.hiddenMissionBondMax + 1n)).toThrow("InvalidBond");
    sim.setHiddenBond(w, 2000n);
    expect(w.hiddenBond).toBe(2000n);
  });

  it("a late reveal keeps the stall it caused: the bond is lost; past the grace it does nothing", () => {
    const { w, now } = ready();
    const id = sendHidden(w, now);
    const m = w.missions.get(id)!;
    const S = sim.stockScale(rs);
    sim.reveal(w, id, sim.ATTACK, target, salt, m.arrival + c.hiddenBondRefund - 1n);
    expect(m.bond).toBe(c.hiddenMissionBondMin);
    sim.advance(w, 1, m.arrival + c.hiddenBondRefund);
    expect(m.returning).toBe(true);
    const late = sendHidden(w, m.arrival + c.hiddenBondRefund, 2n);
    const l = w.missions.get(late)!;
    const before = w.buildings.get(1n)!.stock[3]!;
    sim.reveal(w, late, sim.ATTACK, target, salt, l.arrival + c.hiddenBondRefund);
    expect(l.bond).toBe(0n);
    sim.advance(w, 10, l.arrival + c.hiddenBondRefund);
    expect(l.returning).toBe(true);
    expect(l.cargo[0]).toBeGreaterThan(0n);
    expect(w.buildings.get(1n)!.stock[3]! - before).toBeLessThan(c.hiddenMissionBondMin * S);
    const gone = sendHidden(w, l.arrival + c.hiddenBondRefund, 1n);
    const g = w.missions.get(gone)!;
    sim.reveal(w, gone, sim.ATTACK, target, salt, g.arrival + c.hiddenRevealGrace);
    expect(g.hidden).toBe(true); // a no-op: forfeited when processed
  });

  it("a listed keeper's report shortens the grace unless somebody reveals in time", () => {
    const { w, now } = ready();
    const id = sendHidden(w, now);
    // A failed action restores the world from a copy (atomic): look the mission up again.
    const m = () => w.missions.get(id)!;
    const arrival = m().arrival;
    expect(() => sim.reportGarbage(w, "anyone", id, arrival + c.hiddenReportDelay)).toThrow(
      "NotKeeper",
    );
    expect(() => sim.reportGarbage(w, "keeper", id, arrival + c.hiddenReportDelay - 1n)).toThrow(
      "TooEarly",
    );
    sim.reportGarbage(w, "keeper", id, arrival + c.hiddenReportDelay);
    const reported = m().reportedAt;
    expect(reported).toBe(arrival + c.hiddenReportDelay);
    sim.reportGarbage(w, "keeper", id, reported + 1n); // a second report does nothing
    expect(m().reportedAt).toBe(reported);
    expect(() => sim.poke(w, 2n, reported + c.hiddenReportWindow - 1n)).toThrow("Unrevealed");
    sim.poke(w, 2n, reported + c.hiddenReportWindow); // forfeited, inside the grace
    expect(m().returning).toBe(true);
    expect(m().bond).toBe(0n);
    // A reveal inside the window answers the report.
    const other = sendHidden(w, reported + c.hiddenReportWindow, 2n);
    const o = () => w.missions.get(other)!;
    const arrival2 = o().arrival;
    sim.reportGarbage(w, "keeper", other, arrival2 + c.hiddenReportDelay);
    sim.reveal(w, other, sim.ATTACK, target, salt, arrival2 + c.hiddenReportDelay + 5n);
    expect(o().reportedAt).toBe(0n);
    expect(o().bond).toBe(c.hiddenMissionBondMin);
    sim.setKeeper(w, "keeper", false);
    expect(() => sim.reportGarbage(w, "keeper", other, arrival2 + c.hiddenReportDelay)).toThrow(
      "NotKeeper",
    );
  });

  it("a vacation started in the send second, after the send, does not protect (B-07)", () => {
    const { w, now } = ready();
    const id = sendHidden(w, now);
    sim.startVacation(w, "bob", now);
    const m = w.missions.get(id)!;
    expect(w.players.get(2n)!.vacationStart).toBe(m.start);
    sim.reveal(w, id, sim.ATTACK, target, salt, now);
    sim.advance(w, 1, m.arrival);
    expect(m.cargo[0]).toBeGreaterThan(0n); // looted
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
    // A price that fits both rates is rejected (B-11): 10 ammunition for 3 weapons and 1 dollar.
    expect(() => sim.offerTrade(w, "alice", 2n, 1, 10n, [3n, 0n, 0n, 1n], t)).toThrow(
      "InvalidOffer",
    );
    // Quantities and prices must fit in 64 bits.
    expect(() =>
      sim.offerTrade(w, "alice", 2n, 0, 3n * 2n ** 64n, [0n, 0n, 0n, 2n ** 64n], t),
    ).toThrow("InvalidOffer");
    sim.acceptTrade(w, "bob", id, t);
    const tr = w.trades.get(id)!;
    const m: sim.Mission = {
      ...({} as sim.Mission),
      owner: 1n,
      trade: id,
      cargo: [120n, 0n, 0n, 0n],
    };
    sim.settleTrade(w, m, t + 10n);
    expect(tr.delivered).toBe(120n);
    sim.settleTrade(w, { ...m, cargo: [0n, 5n, 0n, 0n] }, t + 10n);
    expect(tr.delivered).toBe(120n); // wrong resource: a plain transport
    sim.settleTrade(w, { ...m, owner: 2n, cargo: [0n, 0n, 0n, 100n] }, t + 10n);
    expect(tr.paid).toEqual([0n, 0n, 0n, 100n]);
    sim.settleTrade(w, { ...m, cargo: [180n, 0n, 0n, 0n] }, t + 11n * 86400n);
    expect(tr.delivered).toBe(120n); // after the 10-day window it no longer settles
    // The counterparty is checked when the transport leaves (D-26).
    expect(sim.tradeOpenFor(w, id, 1n, 2n, t)).toBe(true);
    expect(sim.tradeOpenFor(w, id, 1n, 1n, t)).toBe(false);
    expect(sim.tradeOpenFor(w, id, 1n, undefined, t)).toBe(false);
    expect(sim.tradeOpenFor(w, id, 2n, 1n, t)).toBe(true);
    expect(sim.tradeCounterparty(w, id, 1n, t)).toBe(2n);
  });
});

describe("sim: market default (D-19 Default, B-11)", () => {
  const t0 = 1_700_000_000n;
  const day = 86400n;
  const ROWDY = rs.troops.findIndex((t) => t.id === "rowdy");
  const MOVER = rs.troops.findIndex((t) => t.id === "mover");
  const units = (troop: number, n: bigint) => rs.troops.map((_, i) => (i === troop ? n : 0n));
  const none = [0n, 0n, 0n, 0n];
  const WINDOW = rs.config.marketWindowSeconds;

  /** A trade as stored, for the pure debt function: 300 weapons for 100 dollars at 3-5-1. */
  const trade = (over: Partial<sim.Trade>): sim.Trade => ({
    id: 1n,
    seller: 1n,
    buyer: 2n,
    sold: 0,
    quantity: 300n,
    price: [0n, 0n, 0n, 100n],
    delivered: 0n,
    paid: none,
    accepted: true,
    acceptedAt: t0,
    rate: 0,
    registered: false,
    returned: [...none],
    ...over,
  });

  /** Alice (1), Bob (2) and Carol (3) next to each other, each with a boot camp, a mover and four rowdies. */
  function three() {
    const w = sim.newWorld(rs);
    let now = t0;
    sim.setGlobalPremium(w, now + 3650n * day);
    for (const [i, who] of ["alice", "bob", "carol"].entries()) {
      sim.register(w, who, { ...at, slot: BigInt(i + 1) }, now);
      sim.queueRoom(w, who, BigInt(i + 1), room("boot_camp"), now);
    }
    now += day;
    for (const [i, who] of ["alice", "bob", "carol"].entries()) {
      sim.train(w, who, BigInt(i + 1), MOVER, 1n, now);
      sim.train(w, who, BigInt(i + 1), ROWDY, 4n, now);
    }
    now += day;
    return { w, now };
  }

  /** Send a transport from `building` to `to` with the mover and process its arrival. */
  function ship(
    w: sim.World,
    who: string,
    building: bigint,
    to: bigint,
    cargo: bigint[],
    tradeId: bigint,
    now: bigint,
  ): bigint {
    const id = sim.sendMission(
      w,
      who,
      building,
      sim.TRANSPORT,
      w.buildings.get(to)!.coord,
      units(MOVER, 1n),
      cargo,
      tradeId,
      now,
    );
    const m = w.missions.get(id)!;
    sim.advance(w, 10, m.arrival);
    return m.arrival;
  }

  /** Every mission home. */
  function allHome(w: sim.World, now: bigint): bigint {
    while (w.pending.length > 0) {
      const m = w.missions.get(w.pending[0]!)!;
      if (m.arrival > now) now = m.arrival;
      sim.advance(w, 10, now);
    }
    return now;
  }

  it("values both sides at the trade's rate and rounds for the creditor (D-19)", () => {
    const w = sim.newWorld(rs);
    expect(sim.tradeDebt(w, trade({ delivered: 300n, paid: [0n, 0n, 0n, 100n] })).debtor).toBe(0n);
    expect(sim.tradeDebt(w, trade({})).debtor).toBe(0n); // nothing sent either way
    // The buyer received everything and paid 40%: it gives back 60% of the weapons plus 10%.
    let d = sim.tradeDebt(w, trade({ delivered: 300n, paid: [0n, 0n, 0n, 40n] }));
    expect([d.debtor, d.creditor]).toEqual([2n, 1n]);
    expect(d.owed).toEqual([198n, 0n, 0n, 0n]);
    // The seller delivered a third and was paid in full: two thirds of the dollars come back.
    d = sim.tradeDebt(w, trade({ delivered: 100n, paid: [0n, 0n, 0n, 100n] }));
    expect([d.debtor, d.creditor]).toEqual([1n, 2n]);
    expect(d.owed).toEqual([0n, 0n, 0n, 74n]); // ⌈⌈100 × 2/3⌉ × 1.1⌉
    // Roundings favour the creditor: one weapon short is owed back as two dollars.
    d = sim.tradeDebt(w, trade({ delivered: 299n, paid: [0n, 0n, 0n, 100n] }));
    expect(d.owed).toEqual([0n, 0n, 0n, 2n]);
    d = sim.tradeDebt(w, trade({ delivered: 1n }));
    expect(d.owed).toEqual([2n, 0n, 0n, 0n]);
    // A price in two resources, paid in one: the excess comes back in proportion to what was paid.
    d = sim.tradeDebt(
      w,
      trade({
        quantity: 200n,
        price: [0n, 200n, 0n, 50n],
        rate: 1, // 2-4-1: 200 weapons = 100 dollars = 200 ammunition + 50 dollars
        paid: [0n, 200n, 0n, 0n],
      }),
    );
    expect(d.owed).toEqual([0n, 220n, 0n, 0n]);
    // What was returned no longer remains.
    d = sim.tradeDebt(
      w,
      trade({ delivered: 300n, paid: [0n, 0n, 0n, 40n], returned: [150n, 0n, 0n, 0n] }),
    );
    expect(d.remaining).toEqual([48n, 0n, 0n, 0n]);
    expect(sim.inDefault(d)).toBe(true);
    d = sim.tradeDebt(
      w,
      trade({ delivered: 300n, paid: [0n, 0n, 0n, 40n], returned: [198n, 0n, 0n, 0n] }),
    );
    expect(sim.inDefault(d)).toBe(false);
  });

  it("a shipment counts per resource up to what remains; the rest is a plain transport", () => {
    const w = sim.newWorld(rs);
    sim.register(w, "alice", at, t0);
    sim.register(w, "bob", { ...at, slot: 2n }, t0);
    const id = sim.offerTrade(w, "alice", 2n, 0, 300n, [0n, 0n, 0n, 100n], t0);
    sim.acceptTrade(w, "bob", id, t0);
    const tr = w.trades.get(id)!;
    const m = { ...({} as sim.Mission), owner: 1n, trade: id, cargo: [400n, 7n, 0n, 0n] };
    sim.settleTrade(w, m, t0 + 10n); // 300 count, 100 weapons and 7 ammo do not
    expect(tr.delivered).toBe(300n);
    sim.settleTrade(w, { ...m, owner: 2n, cargo: [0n, 0n, 0n, 150n] }, t0 + 10n);
    expect(tr.paid).toEqual([0n, 0n, 0n, 100n]);
    // Complete and even: nothing is owed after the window.
    expect(sim.tradeDebt(w, tr).debtor).toBe(0n);
  });

  it("after the window a debtor's transport naming the trade returns in kind, up to what remains", () => {
    const w = sim.newWorld(rs);
    sim.register(w, "alice", at, t0);
    sim.register(w, "bob", { ...at, slot: 2n }, t0);
    const id = sim.offerTrade(w, "alice", 2n, 0, 300n, [0n, 0n, 0n, 100n], t0);
    sim.acceptTrade(w, "bob", id, t0);
    const tr = w.trades.get(id)!;
    tr.delivered = 300n;
    tr.paid = [0n, 0n, 0n, 40n]; // Bob owes 198 weapons
    const late = t0 + WINDOW + 1n;
    const m = { ...({} as sim.Mission), owner: 1n, trade: id, cargo: [50n, 0n, 0n, 0n] };
    sim.settleTrade(w, m, late); // the creditor's shipment is just a transport
    expect(tr.delivered).toBe(300n);
    expect(tr.returned).toEqual(none);
    expect(sim.tradeOpenFor(w, id, 2n, 1n, late)).toBe(true);
    expect(sim.tradeOpenFor(w, id, 2n, 3n, late)).toBe(false); // only to the creditor
    sim.settleTrade(w, { ...m, owner: 2n, cargo: [250n, 9n, 0n, 0n] }, late);
    expect(tr.returned).toEqual([198n, 0n, 0n, 0n]);
    expect(sim.inDefault(sim.tradeDebt(w, tr))).toBe(false);
    expect(sim.tradeOpenFor(w, id, 2n, 1n, late)).toBe(false);
  });

  it("the creditor claims from the debtor's building; the first claim registers the debt", () => {
    let { w, now } = three();
    // Alice sells Bob 3000 weapons for 1000 dollars, delivers in full; Bob pays 400.
    const id = sim.offerTrade(w, "alice", 2n, 0, 3000n, [0n, 0n, 0n, 1000n], now);
    sim.acceptTrade(w, "bob", id, now);
    expect(sim.tradeOpenFor(w, id, 1n, 2n, now)).toBe(true);
    now = ship(w, "alice", 1n, 2n, [3000n, 0n, 0n, 0n], id, now);
    now = ship(w, "bob", 2n, 1n, [0n, 0n, 0n, 400n], id, now);
    now = allHome(w, now);
    // A failed action restores the world from a copy (atomic): look entities up again after one.
    const tr = () => w.trades.get(id)!;
    const bob = () => w.players.get(2n)!;
    expect([tr().delivered, tr().paid[3]]).toEqual([3000n, 400n]);
    expect(() => sim.claimTrade(w, "alice", id, 2n, 1n, [1n, 0n, 0n, 0n], now)).toThrow(
      "InvalidTrade",
    ); // window open

    now = tr().acceptedAt + WINDOW + 1n;
    const d = sim.tradeDebt(w, tr());
    expect([d.debtor, d.creditor, d.owed]).toEqual([2n, 1n, [1980n, 0n, 0n, 0n]]); // (3000 − 1200) × 1.1
    expect(sim.tradeOpenFor(w, id, 1n, 2n, now)).toBe(false); // the creditor has nothing to ship
    expect(sim.tradeOpenFor(w, id, 2n, 1n, now)).toBe(true); // the debtor can pay
    expect(() => sim.claimTrade(w, "bob", id, 2n, 1n, [1n, 0n, 0n, 0n], now)).toThrow(
      "InvalidTrade",
    );
    expect(() => sim.claimTrade(w, "carol", id, 2n, 1n, [1n, 0n, 0n, 0n], now)).toThrow(
      "InvalidTrade",
    );
    expect(() => sim.claimTrade(w, "alice", id, 2n, 2n, [1n, 0n, 0n, 0n], now)).toThrow("NotOwner");
    expect(() => sim.claimTrade(w, "alice", id, 3n, 1n, [1n, 0n, 0n, 0n], now)).toThrow("NotOwner");
    expect(() => sim.claimTrade(w, "alice", id, 2n, 1n, none, now)).toThrow("InvalidClaim");
    expect(() => sim.claimTrade(w, "alice", id, 2n, 1n, [1981n, 0n, 0n, 0n], now)).toThrow(
      "InvalidClaim",
    );
    expect(() => sim.claimTrade(w, "alice", id, 2n, 1n, [0n, 0n, 0n, 1n], now)).toThrow(
      "InvalidClaim",
    ); // not owed
    // The most that can be claimed: what remains, the debtor's stock, the creditor's free capacity.
    const probe = sim.newWorld(rs);
    Object.assign(probe, structuredClone({ ...w, rs: undefined }), { rs });
    const [pa, pb] = [probe.buildings.get(1n)!, probe.buildings.get(2n)!];
    sim.settle(probe, pa, now);
    sim.settle(probe, pb, now);
    const scale = sim.stockScale(rs);
    const free = (sim.capacities(probe, pa)[0]! - pa.stock[0]!) / scale;
    const stock = pb.stock[0]! / scale;
    const least = [1980n, stock, free].reduce((m, x) => (x < m ? x : m));
    expect(sim.claimable(probe, probe.trades.get(id)!, pb, pa)).toEqual([least, 0n, 0n, 0n]);
    // Fill Alice's building up to 500 weapons short of the cap: her free capacity binds.
    const a = () => w.buildings.get(1n)!;
    sim.settle(w, a(), now);
    a().stock[0] = sim.capacities(w, a())[0]! - 500n * scale;
    expect(() => sim.claimTrade(w, "alice", id, 2n, 1n, [501n, 0n, 0n, 0n], now)).toThrow(
      "InvalidClaim",
    );
    sim.claimTrade(w, "alice", id, 2n, 1n, [500n, 0n, 0n, 0n], now);
    expect(sim.visibleStock(w, a())[0]).toBe(sim.capacities(w, a())[0]! / scale);
    expect(tr().registered).toBe(true);
    expect(tr().returned).toEqual([500n, 0n, 0n, 0n]);
    expect(bob().debts).toBe(1);
    expect(sim.owes(w, 2n, 1n)).toBe(1);

    // Alice makes room (a mob school and three rowdies: 1600 weapons, paid now) and collects the
    // rest in two more claims; the last one closes the debt.
    sim.queueRoom(w, "alice", 1n, room("mob_school"), now);
    sim.train(w, "alice", 1n, ROWDY, 3n, now);
    sim.claimTrade(w, "alice", id, 2n, 1n, [1479n, 0n, 0n, 0n], now);
    expect(bob().debts).toBe(1);
    sim.claimTrade(w, "alice", id, 2n, 1n, [1n, 0n, 0n, 0n], now);
    expect(tr().returned).toEqual([1980n, 0n, 0n, 0n]);
    expect(bob().debts).toBe(0);
    expect(sim.owes(w, 2n, 1n)).toBe(0);
    expect(() => sim.claimTrade(w, "alice", id, 2n, 1n, [1n, 0n, 0n, 0n], now)).toThrow(
      "InvalidTrade",
    );
    expect(sim.tradeOpenFor(w, id, 2n, 1n, now)).toBe(false);
  });

  it("the creditor registers the debt without collecting; the restrictions start (B-11)", () => {
    let { w, now } = three();
    const id = sim.offerTrade(w, "alice", 2n, 0, 300n, [0n, 0n, 0n, 100n], now);
    sim.acceptTrade(w, "bob", id, now);
    now = ship(w, "alice", 1n, 2n, [300n, 0n, 0n, 0n], id, now);
    now = allHome(w, now);
    expect(() => sim.registerDebt(w, "alice", id, now)).toThrow("InvalidTrade"); // window open
    now = w.trades.get(id)!.acceptedAt + WINDOW + 1n;
    expect(() => sim.registerDebt(w, "bob", id, now)).toThrow("InvalidTrade"); // the debtor
    expect(() => sim.registerDebt(w, "carol", id, now)).toThrow("InvalidTrade"); // a third party
    sim.registerDebt(w, "alice", id, now);
    sim.registerDebt(w, "alice", id, now); // idempotent
    expect(w.trades.get(id)!.registered).toBe(true);
    expect(w.players.get(2n)!.debts).toBe(1);
    expect(sim.owes(w, 2n, 1n)).toBe(1);
    expect(() => sim.startVacation(w, "bob", now)).toThrow("InDebt");
  });

  it("a registered debtor can always pay a trade's creditor, registered or not (B-11)", () => {
    let { w, now } = three();
    // Bob owes Alice (registered) and Carol (not registered): 300 weapons received, nothing paid.
    const first = sim.offerTrade(w, "alice", 2n, 0, 300n, [0n, 0n, 0n, 100n], now);
    const second = sim.offerTrade(w, "carol", 2n, 0, 300n, [0n, 0n, 0n, 100n], now);
    sim.acceptTrade(w, "bob", first, now);
    sim.acceptTrade(w, "bob", second, now);
    now = ship(w, "alice", 1n, 2n, [300n, 0n, 0n, 0n], first, now);
    now = ship(w, "carol", 3n, 2n, [300n, 0n, 0n, 0n], second, now);
    now = allHome(w, now);
    now = w.trades.get(first)!.acceptedAt + WINDOW + 1n;
    sim.registerDebt(w, "alice", first, now);
    const send = (to: bigint, tradeId: bigint) =>
      sim.sendMission(
        w,
        "bob",
        2n,
        sim.TRANSPORT,
        w.buildings.get(to)!.coord,
        units(ROWDY, 1n),
        [5n, 0n, 0n, 0n],
        tradeId,
        now,
      );
    expect(() => send(3n, 0n)).toThrow("InDebt"); // a plain transport to Carol
    expect(() => send(1n, second)).toThrow("InvalidTrade"); // Carol's trade, not to Carol
    send(3n, second); // the restitution to Carol leaves, unregistered or not
  });

  it("a shipment counts at the coordinate chosen at send, whatever happened there (D-26)", () => {
    let { w, now } = three();
    const id = sim.offerTrade(w, "alice", 2n, 0, 300n, [0n, 0n, 0n, 100n], now);
    sim.acceptTrade(w, "bob", id, now);
    // Bob's weapons are at the cap: nothing fits, the delivery counts in full (D-10).
    const bob = w.buildings.get(2n)!;
    sim.settle(w, bob, now);
    bob.stock[0] = sim.capacities(w, bob)[0]!;
    const before = sim.visibleStock(w, bob)[0];
    now = ship(w, "alice", 1n, 2n, [200n, 0n, 0n, 0n], id, now);
    expect(w.trades.get(id)!.delivered).toBe(200n);
    expect(sim.visibleStock(w, w.buildings.get(2n)!)[0]).toBe(before);
    // Only towards the counterparty's building.
    const toCarol = () =>
      sim.sendMission(
        w,
        "alice",
        1n,
        sim.TRANSPORT,
        w.buildings.get(3n)!.coord,
        units(ROWDY, 1n),
        [10n, 0n, 0n, 0n],
        id,
        now,
      );
    expect(toCarol).toThrow("InvalidTrade");
  });

  it("a registered debt blocks the market, vacation and transports to third parties; a hidden one bounces", () => {
    let { w, now } = three();
    // Bob buys 300 weapons for 100 dollars, receives them and pays nothing: he owes 330 weapons.
    const id = sim.offerTrade(w, "alice", 2n, 0, 300n, [0n, 0n, 0n, 100n], now);
    sim.acceptTrade(w, "bob", id, now);
    now = ship(w, "alice", 1n, 2n, [300n, 0n, 0n, 0n], id, now);
    now = allHome(w, now);
    now = w.trades.get(id)!.acceptedAt + WINDOW + 1n;
    sim.queueRoom(w, "alice", 1n, room("mob_school"), now); // room for the weapons
    // Not registered yet: Bob is free to act.
    sim.offerTrade(w, "bob", 3n, 1, 500n, [0n, 0n, 0n, 100n], now);
    sim.claimTrade(w, "alice", id, 2n, 1n, [30n, 0n, 0n, 0n], now);
    const bob = () => w.players.get(2n)!; // looked up again after every failed (restored) action
    expect(bob().debts).toBe(1);

    expect(() => sim.offerTrade(w, "bob", 3n, 1, 500n, [0n, 0n, 0n, 100n], now)).toThrow("InDebt");
    const offer = sim.offerTrade(w, "carol", 2n, 1, 500n, [0n, 0n, 0n, 100n], now);
    expect(() => sim.acceptTrade(w, "bob", offer, now)).toThrow("InDebt");
    expect(() => sim.startVacation(w, "bob", now)).toThrow("InDebt");
    const carol = w.buildings.get(3n)!.coord;
    const send = (to: sim.Building["coord"], tradeId = 0n) =>
      sim.sendMission(
        w,
        "bob",
        2n,
        sim.TRANSPORT,
        to,
        units(ROWDY, 1n),
        [5n, 0n, 0n, 0n],
        tradeId,
        now,
      );
    expect(() => send(carol)).toThrow("InDebt");
    expect(() => send({ ...at, slot: 9n })).toThrow("InDebt"); // an empty slot is no better
    expect(() =>
      sim.checkSendTarget(w, 2n, w.buildings.get(2n)!.coord, sim.TRANSPORT, carol, now),
    ).toThrow("InDebt");
    expect(sim.checkSendTarget(w, 2n, w.buildings.get(2n)!.coord, sim.ATTACK, carol, now)).toBe(3n);
    sim.sendMission(w, "bob", 2n, sim.ATTACK, carol, units(ROWDY, 1n), none, 0n, now); // only transports
    const toCreditor = send(w.buildings.get(1n)!.coord); // plain transport to the creditor
    const paying = send(w.buildings.get(1n)!.coord, id); // voluntary payment, named
    // Hidden transports leave unchecked and bounce on arrival (B-22, B-11).
    const salt = 7n;
    const commit = sim.hiddenCommit(2n, sim.TRANSPORT, carol, salt);
    sim.setHiddenBond(w, rs.config.hiddenMissionBondMin); // affordable by a new account
    expect(() =>
      sim.sendHiddenMission(w, "bob", 2n, commit, 3n, units(MOVER, 1n), [5n, 0n, 0n, 0n], now, now),
    ).toThrow("TooLate"); // the timelock's round would open before the arrival
    const hidden = sim.sendHiddenMission(
      w,
      "bob",
      2n,
      commit,
      3n,
      units(MOVER, 1n),
      [5n, 0n, 0n, 0n],
      now + 10n ** 7n,
      now,
    );
    const h = w.missions.get(hidden)!;
    expect(h.bond).toBe(rs.config.hiddenMissionBondMin);
    sim.reveal(w, hidden, sim.TRANSPORT, carol, salt, now);
    // Carol's stock as of the arrival: the bounce must not add to it.
    sim.settle(w, w.buildings.get(3n)!, h.arrival);
    const carolBefore = sim.visibleStock(w, w.buildings.get(3n)!)[0]!;
    sim.advance(w, 10, h.arrival); // the attack, both transports and the hidden one arrive
    expect(h.returning).toBe(true);
    expect(h.cargo).toEqual([5n, 0n, 0n, 0n]); // back with the cargo
    expect(sim.visibleStock(w, w.buildings.get(3n)!)[0]).toBe(carolBefore);
    expect(w.missions.get(toCreditor)!.returning).toBe(true); // delivered
    expect(w.missions.get(paying)!.cargo).toEqual(none);
    const tr = w.trades.get(id)!;
    expect(tr.returned).toEqual([35n, 0n, 0n, 0n]); // 30 claimed + 5 paid; the plain one did not count
    expect(bob().debts).toBe(1);
    // Paying the rest back by transport closes the debt too.
    now = allHome(w, h.arrival + 10n * day);
    now = ship(w, "bob", 2n, 1n, [295n, 0n, 0n, 0n], id, now);
    expect(w.trades.get(id)!.returned).toEqual([330n, 0n, 0n, 0n]);
    expect(bob().debts).toBe(0);
    expect(sim.owes(w, 2n, 1n)).toBe(0);
    now = allHome(w, now);
    sim.offerTrade(w, "bob", 3n, 1, 500n, [0n, 0n, 0n, 100n], now); // free again
  });

  it("nobody starts a vacation while party to a trade whose window is open (D-18)", () => {
    let { w, now } = three();
    const id = sim.offerTrade(w, "alice", 2n, 0, 300n, [0n, 0n, 0n, 100n], now);
    sim.startVacation(w, "carol", now); // not a party
    sim.acceptTrade(w, "bob", id, now);
    expect(w.players.get(1n)!.tradeLockUntil).toBe(now + WINDOW);
    expect(w.players.get(2n)!.tradeLockUntil).toBe(now + WINDOW);
    expect(() => sim.startVacation(w, "alice", now)).toThrow("TradeOpen");
    expect(() => sim.startVacation(w, "bob", now + WINDOW)).toThrow("TradeOpen");
    sim.startVacation(w, "bob", now + WINDOW + 1n);
  });

  it("a claim works against a debtor on vacation or suspended", () => {
    let { w, now } = three();
    const id = sim.offerTrade(w, "alice", 2n, 0, 300n, [0n, 0n, 0n, 100n], now);
    sim.acceptTrade(w, "bob", id, now);
    now = ship(w, "alice", 1n, 2n, [300n, 0n, 0n, 0n], id, now);
    now = allHome(w, now);
    now = w.trades.get(id)!.acceptedAt + WINDOW + 1n;
    sim.queueRoom(w, "alice", 1n, room("mob_school"), now);
    sim.startVacation(w, "bob", now); // nothing registered yet
    sim.claimTrade(w, "alice", id, 2n, 1n, [100n, 0n, 0n, 0n], now);
    sim.suspend(w, 2n, now + 30n * day);
    sim.claimTrade(w, "alice", id, 2n, 1n, [100n, 0n, 0n, 0n], now);
    expect(w.trades.get(id)!.returned).toEqual([200n, 0n, 0n, 0n]);
    // The creditor itself has to be active.
    sim.startVacation(w, "alice", now);
    expect(() => sim.claimTrade(w, "alice", id, 2n, 1n, [100n, 0n, 0n, 0n], now)).toThrow(
      "OnVacation",
    );
  });
});
