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

describe("sim: hidden missions (B-22): parking, reveal at the reveal time, forfeit", () => {
  const ROWDY = rs.troops.findIndex((t) => t.id === "rowdy");
  const rowdies = (n: bigint) => rs.troops.map((_, i) => (i === ROWDY ? n : 0n));
  const none = [0n, 0n, 0n, 0n];
  const c = rs.config;

  function ready() {
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
  const salt = 5n;
  const target = { ...at, slot: 2n };
  const sendHidden = (w: sim.World, now: bigint, n = 5n, arrival = 0n) =>
    sim.sendHiddenMission(
      w,
      "alice",
      1n,
      sim.hiddenCommit(1n, sim.ATTACK, target, salt),
      3n,
      rowdies(n),
      none,
      arrival,
      now,
    );

  it("a fixed arrival goes from the natural one to the slack after it; the way back keeps the duration", () => {
    const { w, now } = ready();
    const natural = w.missions.get(sendHidden(w, now, 1n))!.arrival; // 0: the natural arrival
    expect(() => sendHidden(w, now, 1n, natural - 1n)).toThrow("TooLate");
    expect(() => sendHidden(w, now, 1n, natural + c.hiddenArrivalSlack + 1n)).toThrow(
      "InvalidArrival",
    );
    const id = sendHidden(w, now, 1n, natural + c.hiddenArrivalSlack);
    const m = () => w.missions.get(id)!;
    const late = m().arrival;
    expect(late).toBe(natural + c.hiddenArrivalSlack);
    sim.reveal(w, id, sim.ATTACK, target, salt, now); // before the arrival: resolves at it
    expect(sim.advance(w, 5, late)).toBe(2);
    expect(m().returning).toBe(true);
    expect(m().arrival).toBe(late + (natural - now));
  });

  it("a due mission nobody revealed is parked: the queue goes on and every action works", () => {
    const { w, now } = ready();
    const id = sendHidden(w, now);
    // A failed action restores the world from a copy (atomic): look the mission up again.
    const m = () => w.missions.get(id)!;
    const arrival = m().arrival;
    sim.poke(w, 2n, arrival); // bob moves first: the attack waits for its reveal, parked
    expect(w.parked).toEqual([id]);
    expect(w.pending).toEqual([]);
    expect(sim.advance(w, 5, arrival)).toBe(0);
    sim.queueRoom(w, "bob", 2n, room("boot_camp"), arrival); // the world does not stall
    sim.reveal(w, id, sim.ATTACK, target, salt, arrival + 10n);
    expect(w.parked).toEqual([]);
    expect(w.pending).toEqual([id]);
    expect(m().hidden).toBe(false);
    expect(m().arrival).toBe(arrival + 10n); // arrives at the reveal
    expect(sim.advance(w, 1, arrival + 10n)).toBe(1);
    expect(m().returning).toBe(true);
    expect(m().cargo[0]).toBeGreaterThan(0n); // an attack against bob's state at the reveal
    expect(m().start).toBe(arrival + 10n);
  });

  it("a reveal after the arrival moves it to the reveal even when nothing drained the queue", () => {
    const { w, now } = ready();
    const id = sendHidden(w, now);
    const m = w.missions.get(id)!;
    const arrival = m.arrival;
    sim.reveal(w, id, sim.ATTACK, target, salt, arrival + 5n);
    expect(m.arrival).toBe(arrival + 5n);
    expect(w.pending).toEqual([id]);
    sim.advance(w, 1, arrival + 5n);
    expect(m.cargo[0]).toBeGreaterThan(0n);
  });

  it("the parked list keeps its arrival order when missions leave it (a linked list on-chain)", () => {
    const { w, now } = ready();
    const a = sendHidden(w, now, 3n);
    const b = sendHidden(w, now, 2n);
    const d = sendHidden(w, now, 1n);
    const arrival = w.missions.get(d)!.arrival;
    sim.poke(w, 1n, arrival);
    expect(w.parked).toEqual([a, b, d]);
    const past = arrival + c.hiddenOrderWindow; // every window over: any order of reveals
    sim.reveal(w, b, sim.ATTACK, target, salt, past); // the middle
    expect(w.parked).toEqual([a, d]);
    sim.reveal(w, a, sim.ATTACK, target, salt, past); // the head
    expect(w.parked).toEqual([d]);
    const e = sendHidden(w, past, 1n);
    sim.advance(w, 10, w.missions.get(e)!.arrival);
    expect(w.parked).toEqual([d, e]); // appended at the tail
    sim.recall(w, "alice", e, w.missions.get(e)!.arrival); // the tail
    expect(w.parked).toEqual([d]);
    sim.forfeit(w, d, arrival + c.hiddenRevealGrace); // the only one
    expect(w.parked).toEqual([]);
  });

  it("reveals go in arrival order for the window: a parked one ahead holds the next (B-22)", () => {
    const { w, now } = ready();
    const a = sendHidden(w, now, 2n);
    const b = sendHidden(w, now, 2n);
    const arrival = w.missions.get(b)!.arrival;
    // Nothing drained yet: the reveal drains first (parks both) and b is out of order.
    expect(() => sim.reveal(w, b, sim.ATTACK, target, salt, arrival + 5n)).toThrow("OutOfOrder");
    expect(w.pending).toEqual([a, b]); // restored: nothing parked
    sim.reveal(w, a, sim.ATTACK, target, salt, arrival + 5n);
    expect(w.parked).toEqual([b]);
    sim.reveal(w, b, sim.ATTACK, target, salt, arrival + 5n); // a is on its way: b may follow
    expect(w.parked).toEqual([]);
    sim.advance(w, 10, arrival + 5n);
    // Garbage ahead holds the ones behind for the window only.
    const g = sendHidden(w, arrival + 5n, 1n); // never revealed
    const h = sendHidden(w, arrival + 5n, 1n);
    const arrival2 = w.missions.get(h)!.arrival;
    const early = arrival2 + c.hiddenOrderWindow - 1n;
    expect(() => sim.reveal(w, h, sim.ATTACK, target, salt, early)).toThrow("OutOfOrder");
    sim.reveal(w, h, sim.ATTACK, target, salt, early + 1n);
    expect(w.parked).toEqual([g]);
  });

  it("past the grace anyone forfeits a parked mission: it turns back from then; a reveal does nothing", () => {
    const { w, now } = ready();
    const id = sendHidden(w, now);
    const m = () => w.missions.get(id)!;
    const arrival = m().arrival;
    sim.poke(w, 2n, arrival);
    expect(() => sim.forfeit(w, id, arrival + c.hiddenRevealGrace - 1n)).toThrow("TooEarly");
    sim.reveal(w, id, sim.ATTACK, target, salt, arrival + c.hiddenRevealGrace); // a no-op
    expect(m().hidden).toBe(true);
    const when = arrival + c.hiddenRevealGrace + 7n;
    sim.forfeit(w, id, when);
    expect(m().returning).toBe(true);
    expect(m().hidden).toBe(true); // never revealed
    expect(m().troops[ROWDY]).toBe(5n);
    expect(m().cargo[0]).toBe(0n); // bob untouched
    expect(m().start).toBe(when); // turned back from now
    expect(m().arrival).toBe(when + m().duration);
    expect(w.parked).toEqual([]);
    sim.forfeit(w, id, when); // no longer parked: a no-op, the keeper and the sender race
    sim.advance(w, 1, m().arrival);
    expect(w.buildings.get(1n)!.troops[ROWDY]).toBe(7n);
  });

  it("a due mission still queued can be forfeited, and a parked one recalled", () => {
    const { w, now } = ready();
    const id = sendHidden(w, now, 2n);
    const arrival = w.missions.get(id)!.arrival;
    sim.forfeit(w, id, arrival + c.hiddenRevealGrace);
    expect(w.missions.get(id)!.returning).toBe(true);
    expect(w.pending).toEqual([id]);
    const other = sendHidden(w, arrival + c.hiddenRevealGrace, 3n);
    const o = () => w.missions.get(other)!;
    const arrival2 = o().arrival;
    sim.advance(w, 10, arrival2); // the first one is home, the other one parked
    expect(w.parked).toEqual([other]);
    sim.recall(w, "alice", other, arrival2 + 10n);
    expect(w.parked).toEqual([]);
    expect(o().returning).toBe(true);
    expect(o().start).toBe(arrival2 + 10n);
    sim.advance(w, 10, o().arrival);
    expect(w.buildings.get(1n)!.troops[ROWDY]).toBe(7n);
  });

  it("troops that just came home rest: the building cannot send for the cooldown (B-22)", () => {
    const { w, now } = ready();
    const id = sim.sendMission(w, "alice", 1n, sim.ATTACK, target, rowdies(5n), none, 0n, now);
    sim.advance(w, 10, w.missions.get(id)!.arrival); // resolves against bob and turns back
    const home = w.missions.get(id)!.arrival;
    sim.advance(w, 10, home);
    const b = w.buildings.get(1n)!;
    expect(b.troops[ROWDY]).toBe(7n);
    expect(b.lastReturn).toBe(home);
    const resting = home + c.returnCooldown - 1n;
    expect(() =>
      sim.sendMission(w, "alice", 1n, sim.ATTACK, target, rowdies(5n), none, 0n, resting),
    ).toThrow("TroopsResting");
    expect(() => sendHidden(w, resting)).toThrow("TroopsResting");
    sim.sendMission(w, "alice", 1n, sim.ATTACK, target, rowdies(5n), none, 0n, resting + 1n);
    expect(w.buildings.get(1n)!.troops[ROWDY]).toBe(2n);
  });

  it("the interception survives a garbage mission parked ahead of the attack (B-22)", () => {
    // The return cooldown outlasts the order window: a parked mission that arrived just after
    // the defender's return (even the defender's own garbage) holds the attack's reveal until
    // `attack arrival + window`, and the defender's troops must still be home by then.
    const { w, now: t0 } = ready();
    sim.queueRoom(w, "bob", 2n, room("boot_camp"), t0);
    let now = t0 + 86400n;
    sim.train(w, "bob", 2n, ROWDY, 5n, now);
    now += 86400n;
    sim.poke(w, 2n, now);
    const clone = (x: sim.World) => {
      const { rs: r, ...rest } = x;
      return { ...structuredClone(rest), rs: r } as sim.World;
    };
    // Measured on a copy: bob's round trip to alice's, and alice's hidden trip to bob's.
    const copy = clone(w);
    const trip = sim.sendMission(copy, "bob", 2n, sim.TRANSPORT, at, rowdies(5n), none, 0n, now);
    sim.advance(copy, 10, copy.missions.get(trip)!.arrival);
    const roundTrip = copy.missions.get(trip)!.arrival - now;
    const hiddenTrip = copy.missions.get(sendHidden(copy, now, 1n))!.arrival - now;

    sim.sendMission(w, "bob", 2n, sim.TRANSPORT, at, rowdies(5n), none, 0n, now);
    const R = now + roundTrip; // bob's troops are home again
    const garbage = sendHidden(w, R + 1n - hiddenTrip, 1n); // never revealed
    const attack = sendHidden(w, R + 2n - hiddenTrip, 5n);
    expect(w.missions.get(garbage)!.arrival).toBe(R + 1n);
    expect(w.missions.get(attack)!.arrival).toBe(R + 2n);
    sim.advance(w, 10, R);
    const bob = () => w.buildings.get(2n)!;
    expect(bob().troops[ROWDY]).toBe(5n);
    expect(bob().lastReturn).toBe(R);

    // The keeper's reveal at R+10 is held by the garbage until R+16.
    expect(() => sim.reveal(w, attack, sim.ATTACK, target, salt, R + 10n)).toThrow("OutOfOrder");
    expect(w.parked).toEqual([]); // restored
    // With a 15 s cooldown bob would leave here, and the attack would find an empty building.
    const away = () =>
      sim.sendMission(w, "bob", 2n, sim.TRANSPORT, at, rowdies(5n), none, 0n, R + 15n);
    expect(away).toThrow("TroopsResting");
    sim.reveal(w, attack, sim.ATTACK, target, salt, R + 16n);
    expect(w.parked).toEqual([garbage]);
    sim.advance(w, 10, R + 16n); // the battle: 5 rowdies against 5 at home
    expect(bob().troops[ROWDY]).toBe(1n);
    expect(w.missions.get(attack)!.troops[ROWDY]).toBe(1n);
    // The rest still rests until the cooldown is over (checked before the troops).
    expect(() =>
      sim.sendMission(w, "bob", 2n, sim.TRANSPORT, at, rowdies(1n), none, 0n, R + 29n),
    ).toThrow("TroopsResting");
    sim.sendMission(w, "bob", 2n, sim.TRANSPORT, at, rowdies(1n), none, 0n, R + 30n);
  });

  it("a forfeited mission's return starts the cooldown too", () => {
    const { w, now } = ready();
    const id = sendHidden(w, now, 2n);
    const arrival = w.missions.get(id)!.arrival;
    sim.forfeit(w, id, arrival + c.hiddenRevealGrace); // nobody revealed it: it turns back
    const home = w.missions.get(id)!.arrival;
    sim.advance(w, 10, home);
    expect(w.buildings.get(1n)!.troops[ROWDY]).toBe(7n);
    expect(w.buildings.get(1n)!.lastReturn).toBe(home);
    expect(() => sendHidden(w, home + c.returnCooldown - 1n)).toThrow("TroopsResting");
    sendHidden(w, home + c.returnCooldown, 2n);
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
  const t0 = 1_700_000_000n;
  const day = 86400n;
  const ROWDY = rs.troops.findIndex((t) => t.id === "rowdy");
  const MOVER = rs.troops.findIndex((t) => t.id === "mover");
  const units = (troop: number, n: bigint) => rs.troops.map((_, i) => (i === troop ? n : 0n));
  const none = [0n, 0n, 0n, 0n];
  const WINDOW = rs.config.marketWindowSeconds;
  const scale = sim.stockScale(rs);
  const stock = (w: sim.World, b: bigint, r: number) => w.buildings.get(b)!.stock[r]! / scale;

  /** A trade as stored, for the pure share function: 300 weapons for 100 dollars at 3-5-1. */
  const trade = (over: Partial<sim.Trade>): sim.Trade => ({
    id: 1n,
    seller: 1n,
    buyer: 2n,
    from: 1n,
    sold: 0,
    quantity: 300n,
    price: [0n, 0n, 0n, 100n],
    rate: [3n, 5n, 0n, 1n],
    accepted: true,
    closesAt: t0 + WINDOW,
    deposit: [0n, 0n, 0n, 10n],
    paid: [...none],
    sellerTook: [...none],
    buyerTook: [...none],
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

  /** Alice sells Bob 300 weapons for 100 dollars from her building; Bob accepts. */
  function accepted() {
    const { w, now } = three();
    const id = sim.offerTrade(w, "alice", 2n, 1n, 0, 300n, [0n, 0n, 0n, 100n], now);
    sim.acceptTrade(w, "bob", id, 2n, now);
    return { w, now, id };
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

  it("checks the fixed rates exactly and the offer's building", () => {
    const w = sim.newWorld(rs);
    const t = t0;
    sim.register(w, "alice", at, t);
    sim.register(w, "bob", { ...at, slot: 2n }, t);
    // 3-5-1: 1 dollar = 3 weapons = 5 ammunition. Sell 300 weapons for 100 dollars.
    expect(() => sim.offerTrade(w, "alice", 2n, 1n, 0, 300n, [0n, 0n, 0n, 99n], t)).toThrow(
      "InvalidOffer",
    );
    expect(() => sim.offerTrade(w, "alice", 2n, 2n, 0, 300n, [0n, 0n, 0n, 100n], t)).toThrow(
      "NotOwner",
    );
    const id = sim.offerTrade(w, "alice", 2n, 1n, 0, 300n, [0n, 0n, 0n, 100n], t);
    expect(w.trades.get(id)!.rate).toEqual([3n, 5n, 0n, 1n]); // the values, not an index
    // 2-4-1 works too: 200 weapons = 400 ammunition.
    sim.offerTrade(w, "alice", 2n, 1n, 0, 200n, [0n, 400n, 0n, 0n], t);
    // A price that fits both rates is rejected (B-11): 10 ammunition for 3 weapons and 1 dollar.
    expect(() => sim.offerTrade(w, "alice", 2n, 1n, 1, 10n, [3n, 0n, 0n, 1n], t)).toThrow(
      "InvalidOffer",
    );
    // Quantities and prices must fit in 64 bits.
    expect(() =>
      sim.offerTrade(w, "alice", 2n, 1n, 0, 3n * 2n ** 64n, [0n, 0n, 0n, 2n ** 64n], t),
    ).toThrow("InvalidOffer");
  });

  it("splits the goods and the deposit by what was paid, rounding for the seller (D-19)", () => {
    const shares = (paid: bigint[], now = t0) => sim.tradeShares(trade({ paid }), now);
    const late = t0 + WINDOW + 1n;
    // Inside the window the buyer earns goods as it pays; nothing else is split yet.
    expect(shares([0n, 0n, 0n, 40n])).toEqual({ buyer: [120n, 0n, 0n, 0n], seller: none });
    expect(shares([0n, 0n, 0n, 41n]).buyer[0]).toBe(123n);
    expect(shares([0n, 0n, 0n, 1n]).buyer[0]).toBe(3n);
    // Once the window closes: the rest of the goods and ⌈10 × 60 / 100⌉ = 6 dollars to the seller.
    expect(shares([0n, 0n, 0n, 40n], late)).toEqual({
      buyer: [120n, 0n, 0n, 4n],
      seller: [180n, 0n, 0n, 6n],
    });
    expect(shares(none, late)).toEqual({ buyer: none, seller: [300n, 0n, 0n, 10n] });
    // Paid in full: final at once, everything to the buyer.
    expect(sim.tradeFinal(trade({ paid: [0n, 0n, 0n, 100n] }), t0)).toBe(true);
    expect(shares([0n, 0n, 0n, 100n])).toEqual({ buyer: [300n, 0n, 0n, 10n], seller: none });
    // A tiny trade: 9 weapons for 10 ammunition and 1 dollar; 1 ammunition unpaid keeps the
    // whole rounded deposit for the seller (the unpaid fraction of it, rounded up).
    const tiny = trade({
      quantity: 9n,
      price: [0n, 10n, 0n, 1n],
      deposit: [0n, 1n, 0n, 1n],
      paid: [0n, 9n, 0n, 1n],
    });
    expect(sim.tradeShares(tiny, late)).toEqual({
      buyer: [8n, 0n, 0n, 0n],
      seller: [1n, 1n, 0n, 1n],
    });
    // What a party already took is subtracted; a third party gets nothing.
    const taken = trade({ paid: [0n, 0n, 0n, 40n], buyerTook: [100n, 0n, 0n, 0n] });
    expect(sim.shareLeft(taken, 2n, t0)).toEqual([20n, 0n, 0n, 0n]);
    expect(sim.shareLeft(taken, 3n, late)).toEqual(none);
  });

  it("acceptance holds the goods and the deposit and fixes the terms", () => {
    let { w, now } = three();
    const big = sim.offerTrade(w, "alice", 2n, 1n, 0, 30_000n, [0n, 0n, 0n, 10_000n], now);
    expect(() => sim.acceptTrade(w, "bob", big, 2n, now)).toThrow("CannotAfford");
    const id = sim.offerTrade(w, "alice", 2n, 1n, 0, 300n, [0n, 0n, 0n, 100n], now);
    expect(() => sim.acceptTrade(w, "bob", id, 1n, now)).toThrow("NotOwner");
    expect(() => sim.acceptTrade(w, "carol", id, 3n, now)).toThrow("InvalidTrade");
    sim.poke(w, 1n, now);
    const weapons = stock(w, 1n, 0);
    const dollars = stock(w, 2n, 3);
    sim.acceptTrade(w, "bob", id, 2n, now);
    const t = w.trades.get(id)!;
    expect(t.closesAt).toBe(now + WINDOW);
    expect(t.deposit).toEqual([0n, 0n, 0n, 10n]);
    expect(stock(w, 1n, 0)).toBe(weapons - 300n);
    expect(stock(w, 2n, 3)).toBe(dollars - 10n);
    expect(w.players.get(2n)!.purchases).toEqual([id]);
    expect(() => sim.acceptTrade(w, "bob", id, 2n, now)).toThrow("InvalidTrade"); // once
  });

  it("only the buyer pays, to the seller, arriving within the window; it counts up to what remains", () => {
    let { w, now, id } = accepted();
    const alice = w.buildings.get(1n)!.coord;
    const bob = w.buildings.get(2n)!.coord;
    const send = (who: string, from: bigint, to: typeof at, cargo: bigint[], when: bigint) =>
      sim.sendMission(w, who, from, sim.TRANSPORT, to, units(ROWDY, 1n), cargo, id, when);
    expect(() => send("alice", 1n, bob, [10n, 0n, 0n, 0n], now)).toThrow("InvalidTrade");
    expect(() => send("bob", 2n, w.buildings.get(3n)!.coord, [0n, 0n, 0n, 10n], now)).toThrow(
      "InvalidTrade",
    );
    expect(() => send("bob", 2n, alice, [0n, 0n, 0n, 10n], now + WINDOW)).toThrow("InvalidTrade");
    expect(sim.tradePayable(w, id, 2n, 1n, now)).toBe(true);
    expect(sim.tradePayable(w, id, 1n, 2n, now)).toBe(false);
    now = ship(w, "bob", 2n, 1n, [0n, 7n, 0n, 130n], id, now); // 100 count, the rest is plain
    const t = w.trades.get(id)!;
    expect(t.paid).toEqual([0n, 0n, 0n, 100n]);
    expect(sim.tradeFinal(t, now)).toBe(true);
    expect(sim.tradePayable(w, id, 2n, 1n, now)).toBe(false); // nothing left to pay
  });

  it("a payment counts at the coordinate chosen at send, whatever happened there (D-26)", () => {
    let { w, now, id } = accepted();
    now = ship(w, "carol", 3n, 1n, [0n, 0n, 0n, 1000n], 0n, now); // a gift fills Alice's dollars
    expect(stock(w, 1n, 3)).toBe(10_000n); // at the cap: nothing more fits
    now = ship(w, "bob", 2n, 1n, [0n, 0n, 0n, 60n], id, now);
    expect(stock(w, 1n, 3)).toBe(10_000n);
    expect(w.trades.get(id)!.paid[3]).toBe(60n);
  });

  it("each party withdraws its shares; a share left in a final trade blocks new trades", () => {
    let { w, now, id } = accepted();
    now = ship(w, "bob", 2n, 1n, [0n, 0n, 0n, 40n], id, now);
    sim.queueRoom(w, "bob", 2n, room("mob_school"), now); // room for weapons
    expect(() => sim.withdrawTrade(w, "bob", id, 2n, [121n, 0n, 0n, 0n], now)).toThrow(
      "InvalidWithdrawal",
    );
    expect(() => sim.withdrawTrade(w, "bob", id, 2n, [0n, 0n, 0n, 1n], now)).toThrow(
      "InvalidWithdrawal",
    );
    expect(() => sim.withdrawTrade(w, "bob", id, 2n, none, now)).toThrow("InvalidWithdrawal");
    expect(() => sim.withdrawTrade(w, "bob", id, 1n, [1n, 0n, 0n, 0n], now)).toThrow("NotOwner");
    expect(() => sim.withdrawTrade(w, "carol", id, 3n, [1n, 0n, 0n, 0n], now)).toThrow(
      "InvalidTrade",
    );
    expect(() => sim.withdrawTrade(w, "alice", id, 1n, [1n, 0n, 0n, 0n], now)).toThrow(
      "InvalidWithdrawal",
    );
    sim.poke(w, 2n, now);
    const weapons = stock(w, 2n, 0);
    sim.withdrawTrade(w, "bob", id, 2n, [100n, 0n, 0n, 0n], now);
    sim.withdrawTrade(w, "bob", id, 2n, [20n, 0n, 0n, 0n], now);
    expect(stock(w, 2n, 0)).toBe(weapons + 120n);
    expect(w.trades.get(id)!.buyerTook).toEqual([120n, 0n, 0n, 0n]);

    now = w.trades.get(id)!.closesAt + 1n;
    sim.queueRoom(w, "alice", 1n, room("mob_school"), now); // room for weapons and 25 dollars
    expect(() => sim.offerTrade(w, "alice", 3n, 1n, 0, 300n, [0n, 0n, 0n, 100n], now)).toThrow(
      "SharesLeft",
    );
    const offer = sim.offerTrade(w, "carol", 1n, 3n, 0, 300n, [0n, 0n, 0n, 100n], now);
    expect(() => sim.acceptTrade(w, "alice", offer, 1n, now)).toThrow("SharesLeft");
    expect(() => sim.withdrawTrade(w, "alice", id, 1n, [181n, 0n, 0n, 0n], now)).toThrow(
      "InvalidWithdrawal",
    );
    sim.withdrawTrade(w, "alice", id, 1n, [180n, 0n, 0n, 6n], now);
    sim.acceptTrade(w, "alice", offer, 1n, now); // nothing left: free again
    expect(w.players.get(1n)!.offers).toEqual([]); // the finished trade left her list
    expect(() => sim.offerTrade(w, "bob", 3n, 2n, 0, 300n, [0n, 0n, 0n, 100n], now)).toThrow(
      "SharesLeft",
    );
    sim.withdrawTrade(w, "bob", id, 2n, [0n, 0n, 0n, 4n], now);
    sim.offerTrade(w, "bob", 3n, 2n, 0, 300n, [0n, 0n, 0n, 100n], now);
    expect(w.players.get(2n)!.purchases).toEqual([]);
  });

  it("at most maxPurchases trades as buyer", () => {
    const { w, now } = three();
    for (let i = 0; i < rs.config.maxOpenOffers; i++)
      sim.offerTrade(w, "alice", 2n, 1n, 0, 30n, [0n, 0n, 0n, 10n], now);
    const extra = sim.offerTrade(w, "carol", 2n, 3n, 0, 30n, [0n, 0n, 0n, 10n], now);
    expect(() => sim.offerTrade(w, "alice", 2n, 1n, 0, 30n, [0n, 0n, 0n, 10n], now)).toThrow(
      "TooManyOffers",
    );
    for (let id = 1n; id <= BigInt(rs.config.maxPurchases); id++)
      sim.acceptTrade(w, "bob", id, 2n, now);
    expect(() => sim.acceptTrade(w, "bob", extra, 2n, now)).toThrow("TooManyTrades");
  });

  it("nobody starts a vacation while party to a trade whose window is open (D-18)", () => {
    const { w, now } = three();
    const id = sim.offerTrade(w, "alice", 2n, 1n, 0, 300n, [0n, 0n, 0n, 100n], now);
    sim.startVacation(w, "carol", now); // not a party
    sim.acceptTrade(w, "bob", id, 2n, now);
    expect(w.players.get(1n)!.tradeLockUntil).toBe(now + WINDOW);
    expect(w.players.get(2n)!.tradeLockUntil).toBe(now + WINDOW);
    expect(() => sim.startVacation(w, "alice", now)).toThrow("TradeOpen");
    expect(() => sim.startVacation(w, "bob", now + WINDOW)).toThrow("TradeOpen");
    sim.startVacation(w, "bob", now + WINDOW + 1n);
  });

  it("accepting checks the seller again; withdrawing ignores the counterparty's state", () => {
    let { w, now } = three();
    const id = sim.offerTrade(w, "alice", 2n, 1n, 0, 300n, [0n, 0n, 0n, 100n], now);
    sim.suspend(w, 1n, now + 10n * day);
    expect(() => sim.acceptTrade(w, "bob", id, 2n, now)).toThrow("InvalidTrade");
    sim.suspend(w, 1n, 0n);
    sim.acceptTrade(w, "bob", id, 2n, now);
    now = w.trades.get(id)!.closesAt + 1n;
    sim.queueRoom(w, "alice", 1n, room("mob_school"), now);
    sim.startVacation(w, "bob", now);
    sim.withdrawTrade(w, "alice", id, 1n, [300n, 0n, 0n, 0n], now);
    sim.suspend(w, 1n, now + 10n * day);
    expect(() => sim.withdrawTrade(w, "alice", id, 1n, [0n, 0n, 0n, 10n], now)).toThrow(
      "Suspended",
    );
  });

  /** A copy of the world: sends on it measure durations without touching the real one. */
  const copy = (w: sim.World) => {
    const { rs: ruleset, ...rest } = w;
    return Object.assign(structuredClone(rest), { rs: ruleset }) as sim.World;
  };

  it("a payment may arrive at the window's last second, even if processed later; not one after", () => {
    const { w, now, id } = accepted();
    const t = w.trades.get(id)!;
    const alice = w.buildings.get(1n)!.coord;
    const pay = (world: sim.World, when: bigint) =>
      sim.sendMission(
        world,
        "bob",
        2n,
        sim.TRANSPORT,
        alice,
        units(ROWDY, 4n),
        [0n, 0n, 0n, 40n],
        id,
        when,
      );
    const probe = copy(w);
    const m = probe.missions.get(pay(probe, now))!;
    const duration = m.arrival - m.start;
    expect(() => pay(copy(w), t.closesAt - duration + 1n)).toThrow("InvalidTrade");
    const sent = pay(w, t.closesAt - duration);
    expect(w.missions.get(sent)!.arrival).toBe(t.closesAt);
    sim.advance(w, 10, t.closesAt + day); // processed a day after the window closed
    expect(t.paid).toEqual([0n, 0n, 0n, 40n]);
    expect(sim.shareLeft(t, 1n, t.closesAt + day)).toEqual([180n, 0n, 0n, 6n]);
  });

  it("more payment after a withdrawal earns the rest of the goods", () => {
    let { w, now, id } = accepted();
    now = ship(w, "bob", 2n, 1n, [0n, 0n, 0n, 40n], id, now);
    sim.queueRoom(w, "bob", 2n, room("mob_school"), now);
    sim.withdrawTrade(w, "bob", id, 2n, [120n, 0n, 0n, 0n], now);
    now = ship(w, "bob", 2n, 1n, [0n, 0n, 0n, 60n], id, now + rs.config.returnCooldown + day);
    const t = w.trades.get(id)!;
    expect(sim.tradeFinal(t, now)).toBe(true);
    expect(sim.shareLeft(t, 2n, now)).toEqual([180n, 0n, 0n, 10n]);
    expect(sim.shareLeft(t, 1n, now)).toEqual(none);
  });

  it("a recalled payment pays nothing", () => {
    let { w, now, id } = accepted();
    const m = sim.sendMission(
      w,
      "bob",
      2n,
      sim.TRANSPORT,
      w.buildings.get(1n)!.coord,
      units(ROWDY, 4n),
      [0n, 0n, 0n, 40n],
      id,
      now,
    );
    sim.recall(w, "bob", m, now + 1n);
    sim.advance(w, 10, now + day);
    expect(w.missions.has(m)).toBe(false);
    expect(w.trades.get(id)!.paid).toEqual(none);
  });

  it("a failed acceptance leaves nothing behind, settlement included", () => {
    const { w, now } = three();
    const id = sim.offerTrade(w, "alice", 2n, 1n, 0, 300n, [0n, 0n, 0n, 100n], now);
    w.buildings.get(2n)!.stock[3] = 9n * scale; // Bob cannot cover the 10-dollar deposit
    const before = copy(w);
    expect(() => sim.acceptTrade(w, "bob", id, 2n, now + day)).toThrow("CannotAfford");
    expect(copy(w)).toEqual(before);
  });
});
