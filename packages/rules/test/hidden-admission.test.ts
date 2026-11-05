import { describe, it, expect } from "vitest";
import { sim } from "../src/index.js";
import { rs } from "./helpers.js";
import { world, sendHidden, certify, reject, packet, ENV } from "./v2-helpers.js";
const target = { city: 1n, neighborhood: 1n, slot: 2n },
  cargo = [0n, 0n, 0n, 0n];
const troops = (n: bigint) => rs.troops.map((_, i) => (i === 0 ? n : 0n));
const commit = sim.hiddenCommit(1n, sim.ATTACK, target, 5n);
function ready() {
  const w = world(rs);
  let now = 1700000000n;
  sim.register(w, "alice", { ...target, slot: 1n }, now);
  sim.register(w, "bob", target, now);
  sim.queueRoom(w, "alice", 1n, 11, now);
  now += 86400n;
  sim.train(w, "alice", 1n, 0, 7n, now);
  now += 86400n;
  sim.poke(w, 1n, now);
  return { w, now };
}
const clone = (w: sim.World): sim.World => {
  const { rs, ...state } = w;
  return { ...structuredClone(state), rs };
};
describe("mandatory v2 admission from genesis", () => {
  it("binds every hidden send without any activation", () => {
    const { w, now } = ready();
    const id = sendHidden(w, "alice", 1n, commit, 1n, troops(5n), cargo, 0n, now);
    expect(w.hiddenEvidence.get(id)).toMatchObject({
      receipt: { status: 1, arrival: w.missions.get(id)!.arrival, seq: w.missions.get(id)!.seq },
      ...w.hiddenConsumers,
    });
  });
  it("has no activation, legacy reveal or timeout cancellation API", () => {
    expect("hiddenAdmission" in sim).toBe(false);
    expect("reveal" in sim).toBe(false);
    expect("forfeit" in sim).toBe(false);
  });
  it("rolls back the economic admission when packet framing is wrong", () => {
    const { w, now } = ready();
    const natural = sim.previewHiddenMission(
      w,
      "alice",
      1n,
      commit,
      1n,
      troops(5n),
      cargo,
      now,
    ).arrival;
    const arrival = natural + ((3n - ((natural + 15n - 1692803367n) % 3n)) % 3n),
      before = clone(w);
    expect(() =>
      sim.sendHiddenMission(
        w,
        "alice",
        1n,
        commit,
        1n,
        troops(5n),
        cargo,
        new Uint8Array(272),
        arrival,
        now,
        ENV,
      ),
    ).toThrow("ResolutionInvalidPacket");
    expect(w).toEqual(before);
    const p = packet(arrival);
    p[43] = p[43]! ^ 1;
    expect(() =>
      sim.sendHiddenMission(w, "alice", 1n, commit, 1n, troops(5n), cargo, p, arrival, now, ENV),
    ).toThrow("ResolutionInvalidContext");
    expect(w).toEqual(before);
  });
  it("waits indefinitely for a valid result and matches punctual execution", () => {
    const { w, now } = ready();
    const id = sendHidden(w, "alice", 1n, commit, 1n, troops(5n), cargo, 0n, now),
      arrival = w.missions.get(id)!.arrival,
      late = arrival + 7200n,
      oracle = clone(w);
    certify(oracle, id, sim.ATTACK, target, 5n);
    sim.advance(oracle, 20, arrival);
    sim.advance(oracle, 20, late);
    expect(sim.advance(w, 20, late)).toBe(0);
    expect(() => sim.poke(w, 2n, late)).toThrow("Backlog");
    certify(w, id, sim.ATTACK, target, 5n);
    sim.advance(w, 20, late);
    expect(w).toEqual(oracle);
  });
  it("certifies garbage instead of expiring the attack", () => {
    const { w, now } = ready();
    const id = sendHidden(w, "alice", 1n, commit, 1n, troops(5n), cargo, 0n, now),
      m = { ...w.missions.get(id)! };
    reject(w, id);
    sim.advance(w, 1, m.arrival + 7200n);
    expect(w.missions.get(id)).toMatchObject({
      returning: true,
      start: m.arrival,
      arrival: m.arrival + m.duration,
    });
  });
  it("rejects a missing consumer configuration at construction", () => {
    expect(() =>
      sim.newWorld(rs, { openingConsumer: "0x" + "00".repeat(20), invalidPointConsumer: "bad" }),
    ).toThrow("ResolutionInvalidConsumers");
  });
});
