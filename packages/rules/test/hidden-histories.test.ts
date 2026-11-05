import { expect, it } from "vitest";
import { sim } from "../src/index.js";
import { rs } from "./helpers.js";
import { certify, reject, sendHidden, world } from "./v2-helpers.js";
const target = { city: 1n, neighborhood: 1n, slot: 2n };
const none = [0n, 0n, 0n, 0n];
const rowdy = rs.troops.findIndex((t) => t.id === "rowdy");
const camp = rs.buildings.findIndex((b) => b.id === "boot_camp");
const troops = rs.troops.map((_, i) => (i === rowdy ? 1n : 0n));
function clone(w: sim.World): sim.World {
  const { rs, ...state } = w;
  return { ...structuredClone(state), rs };
}
function ready() {
  const w = world(rs);
  let now = 1700000000n;
  sim.setGlobalPremium(w, now + 3650n * 86400n);
  sim.register(w, "alice", { city: 1n, neighborhood: 1n, slot: 1n }, now);
  sim.register(w, "bob", target, now);
  sim.queueRoom(w, "alice", 1n, camp, now);
  now += 86400n;
  sim.train(w, "alice", 1n, rowdy, 7n, now);
  now += 86400n;
  sim.poke(w, 1n, now);
  const ids = [1n, 2n, 3n, 4n].map((salt) =>
    sendHidden(
      w,
      "alice",
      1n,
      sim.hiddenCommit(1n, sim.ATTACK, target, salt),
      1n,
      troops,
      none,
      0n,
      now,
    ),
  );
  sim.recall(w, "alice", ids[3]!, now + 1n);
  const first = w.missions.get(ids[0]!)!;
  const publicId = sim.sendMission(
    w,
    "alice",
    1n,
    sim.ATTACK,
    target,
    troops,
    none,
    0n,
    first.arrival - first.duration,
  );
  expect(w.missions.get(publicId)!.arrival).toBe(first.arrival);
  return { w, ids, end: first.arrival + 7n * 86400n };
}
const permutations = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];
for (const order of permutations)
  for (const budget of [1, 2, 20]) {
    it(`matches the entire punctual world after seven days, evidence order ${order}, drain budget ${budget}`, () => {
      const { w, ids, end } = ready();
      const oracle = clone(w);
      const apply = (state: sim.World, index: number) =>
        index === 1
          ? reject(state, ids[index]!)
          : certify(state, ids[index]!, sim.ATTACK, target, BigInt(index + 1));
      for (let i = 0; i < 3; i++) apply(oracle, i);
      while (oracle.pending.length) {
        const next = oracle.missions.get(oracle.pending[0]!)!.arrival;
        expect(next).toBeLessThanOrEqual(end);
        expect(sim.advance(oracle, 20, next)).toBeGreaterThan(0);
      }
      sim.advance(oracle, 20, end);
      // Recall may drain, but unresolved hidden heads hold later arrivals indefinitely.
      while (sim.advance(w, budget, end)) {
        /* drain only unblocked work */
      }
      for (const index of order) {
        const before = clone(w);
        expect(() =>
          sim.hiddenEvidence.submitOpening(w, ids[index]!, "unavailable", [], {
            opening: () => {
              throw new Error("Producer/RPC unavailable");
            },
            invalidPoint: () => false,
          }),
        ).toThrow("Producer/RPC unavailable");
        expect(w).toEqual(before);
        apply(w, index);
        apply(w, index); // repeated certificates never change an established result
        while (sim.advance(w, budget, end)) {
          /* preserve original queue order */
        }
      }
      const beforeCancelled = clone(w);
      expect(
        sim.hiddenEvidence.submitOpening(w, ids[3]!, "ignored", [], {
          opening: () => {
            throw new Error("Cancelled evidence must be ignored");
          },
          invalidPoint: () => false,
        }),
      ).toBe(false);
      expect(w).toEqual(beforeCancelled);
      expect(w).toEqual(oracle);
    });
  }
