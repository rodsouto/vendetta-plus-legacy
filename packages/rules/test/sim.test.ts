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
