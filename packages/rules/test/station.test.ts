import { describe, expect, it } from "vitest";
import { sim, vendetta as rs } from "../src/index.js";

const day = 86400n;
const year = 365n * day;
const coord = (slot: bigint) => ({ city: 1n, neighborhood: 1n, slot });
const room = (id: string) => rs.buildings.findIndex((b) => b.id === id);
const rowdy = rs.troops.findIndex((t) => t.id === "rowdy");
const units = (index: number, n: bigint) => rs.troops.map((_, i) => (i === index ? n : 0n));
const none = rs.resources.map(() => 0n);
const salt = 123n;

/** Reach two owned buildings through real actions, so the fixture also works in the replay. */
function ready() {
  const w = sim.newWorld(rs);
  let now = 1700000000n;
  sim.setGlobalPremium(w, now + 100n * year);
  sim.register(w, "alice", coord(1n), now);
  sim.register(w, "bob", coord(2n), now);
  for (const [id, level] of [
    ["boot_camp", 1],
    ["mob_school", 1],
    ["weapons_armoury", 5],
    ["ammunition_depot", 5],
    ["brewery", 5],
    ["bar", 5],
    ["weapon_storage", 1],
    ["ammunition_storage", 1],
    ["safe_room", 1],
  ] as const) {
    for (let i = 0; i < level; i++) {
      sim.queueRoom(w, "alice", 1n, room(id), now);
      now += year;
    }
  }
  for (let i = 0; i < 5; i++) {
    sim.queueResearch(
      w,
      "alice",
      1n,
      rs.research.findIndex((r) => r.id === "routing"),
      now,
    );
    now += year;
  }
  sim.train(w, "alice", 1n, rs.roles.occupationTroop, 1n, now);
  sim.train(w, "alice", 1n, rowdy, 7n, now);
  now += year;
  const occupy = sim.sendMission(
    w,
    "alice",
    1n,
    sim.OCCUPY,
    coord(3n),
    units(rs.roles.occupationTroop, 1n),
    none,
    0n,
    now,
  );
  sim.advance(w, 10, w.missions.get(occupy)!.arrival);
  now += year;
  sim.poke(w, 1n, now);
  return { w, now };
}

function station(w: sim.World, now: bigint, hidden: boolean, n = 5n) {
  return hidden
    ? sim.sendHiddenMission(
        w,
        "alice",
        1n,
        sim.hiddenCommit(1n, sim.STATION, coord(3n), salt),
        3n,
        units(rowdy, n),
        none,
        0n,
        now,
      )
    : sim.sendMission(w, "alice", 1n, sim.STATION, coord(3n), units(rowdy, n), none, 0n, now);
}

function send(w: sim.World, now: bigint, hidden: boolean, n = 1n) {
  return hidden
    ? sim.sendHiddenMission(
        w,
        "alice",
        3n,
        sim.hiddenCommit(1n, sim.STATION, coord(1n), salt),
        3n,
        units(rowdy, n),
        none,
        0n,
        now,
      )
    : sim.sendMission(w, "alice", 3n, sim.STATION, coord(1n), units(rowdy, n), none, 0n, now);
}

describe("station arrival cooldown (B-22)", () => {
  it.each([false, true])(
    "blocks public and hidden departures after stationing (hidden=%s)",
    (hidden) => {
      const { w, now } = ready();
      const id = station(w, now, hidden);
      const arrival = w.missions.get(id)!.arrival;
      if (hidden) sim.reveal(w, id, sim.STATION, coord(3n), salt, arrival);
      // The send drains the arrival itself. Reverting must also roll that arrival back.
      for (const outgoingHidden of [false, true]) {
        expect(() => send(w, arrival, outgoingHidden)).toThrow("TroopsResting");
        expect(w.missions.has(id)).toBe(true);
        expect(w.buildings.get(3n)!.troops[rowdy]).toBe(0n);
      }
      sim.advance(w, 10, arrival);
      expect(w.buildings.get(3n)!.lastTroopArrival).toBe(arrival);
      for (const outgoingHidden of [false, true]) {
        expect(() =>
          send(w, arrival + rs.config.troopArrivalCooldown - 1n, outgoingHidden),
        ).toThrow("TroopsResting");
      }
      for (const outgoingHidden of [false, true]) {
        send(w, arrival + rs.config.troopArrivalCooldown, outgoingHidden);
      }
    },
  );

  it("restarts the building-wide cooldown when another detachment arrives", () => {
    const { w, now } = ready();
    const first = station(w, now, false, 5n);
    const second = station(w, now + 10n, false, 1n);
    const arrival = w.missions.get(first)!.arrival;
    sim.advance(w, 10, arrival + 10n);
    expect(w.missions.has(second)).toBe(false);
    expect(w.buildings.get(3n)!.lastTroopArrival).toBe(arrival + 10n);
    expect(() => send(w, arrival + rs.config.troopArrivalCooldown, false, 5n)).toThrow(
      "TroopsResting",
    );
    send(w, arrival + 10n + rs.config.troopArrivalCooldown, false, 5n);
  });

  it("bounces a hidden station on a foreign building without locking its destination", () => {
    const { w, now } = ready();
    const target = coord(2n);
    const id = sim.sendHiddenMission(
      w,
      "alice",
      1n,
      sim.hiddenCommit(1n, sim.STATION, target, salt),
      3n,
      units(rowdy, 5n),
      none,
      0n,
      now,
    );
    const arrival = w.missions.get(id)!.arrival;
    sim.reveal(w, id, sim.STATION, target, salt, arrival);
    sim.advance(w, 10, arrival);
    expect(w.missions.get(id)!.returning).toBe(true);
    expect(w.buildings.get(2n)!.troops[rowdy]).toBe(0n);
    expect(w.buildings.get(2n)!.lastTroopArrival).toBe(0n);
  });

  it("starts a late hidden station's cooldown at its effective arrival", () => {
    const { w, now } = ready();
    const id = station(w, now, true);
    const arrival = w.missions.get(id)!.arrival;
    const revealed = arrival + 20n;
    sim.reveal(w, id, sim.STATION, coord(3n), salt, revealed);
    sim.advance(w, 10, revealed);
    expect(w.buildings.get(3n)!.lastTroopArrival).toBe(revealed);
    expect(() => send(w, arrival + rs.config.troopArrivalCooldown, false)).toThrow("TroopsResting");
    send(w, revealed + rs.config.troopArrivalCooldown, false);
  });

  it.each([false, true])(
    "uses the scheduled arrival when processing an old arrival (hidden=%s)",
    (hidden) => {
      const { w, now } = ready();
      const id = station(w, now, hidden);
      const arrival = w.missions.get(id)!.arrival;
      if (hidden) sim.reveal(w, id, sim.STATION, coord(3n), salt, now);
      send(w, arrival + rs.config.troopArrivalCooldown, false);
      expect(w.buildings.get(3n)!.lastTroopArrival).toBe(arrival);
    },
  );

  it("allows local queues during rest and training does not restart it", () => {
    const { w, now } = ready();
    sim.queueRoom(w, "alice", 3n, room("boot_camp"), now);
    const id = station(w, now + year, false);
    const arrival = w.missions.get(id)!.arrival;
    sim.advance(w, 10, arrival);
    sim.queueRoom(w, "alice", 3n, room("brewery"), arrival);
    sim.queueResearch(w, "alice", 1n, 0, arrival);
    sim.train(w, "alice", 3n, rowdy, 1n, arrival);
    const finish = w.buildings.get(3n)!.training[0][0]!.finishAt;
    sim.poke(w, 3n, finish);
    expect(w.buildings.get(3n)!.troops[rowdy]).toBe(6n);
    expect(w.buildings.get(3n)!.lastTroopArrival).toBe(arrival);
    send(w, finish, false, 6n);
  });
});
