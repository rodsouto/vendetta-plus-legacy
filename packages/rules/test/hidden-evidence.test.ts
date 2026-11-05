import { world, sendHidden } from "./v2-helpers.js";
import { describe, it, expect } from "vitest";
import { sim } from "../src/index.js";
import { rs } from "./helpers.js";
let ROOT = "0x" + "12".repeat(32);
const OPEN = "0x" + "11".repeat(20),
  BAD = "0x" + "22".repeat(20);
const target = { city: 1n, neighborhood: 1n, slot: 2n },
  none = [0n, 0n, 0n, 0n];
const rowdy = rs.troops.findIndex((t) => t.id === "rowdy"),
  camp = rs.buildings.findIndex((b) => b.id === "boot_camp");
const troops = (n: bigint) => rs.troops.map((_, i) => (i === rowdy ? n : 0n));
const plain = Uint8Array.from(
  Buffer.from("02010101020000000000000000000000000000000000000000000000000000000000000005", "hex"),
);
const OPEN_INPUTS = Array<bigint>(55).fill(0n),
  POINT_INPUTS = [BigInt(ROOT) >> 128n, BigInt(ROOT) & ((1n << 128n) - 1n)];
OPEN_INPUTS[48] = POINT_INPUTS[0]!;
OPEN_INPUTS[49] = POINT_INPUTS[1]!;
const verifier: sim.hiddenEvidence.EvidenceVerifier = {
  opening(consumer, statement, proof, inputs) {
    expect(consumer).toBe(OPEN);
    expect(statement).toBe(ROOT);
    expect(inputs.length).toBe(55);
    if (((inputs[48]! << 128n) | inputs[49]!) !== BigInt(statement))
      throw new Error("MockRejected");
    if (proof === "reject") throw new Error("MockRejected");
    if (proof === "invalid") return { valid: false, plain: new Uint8Array() };
    const bytes = Uint8Array.from(plain);
    if (proof === "bad-plain") bytes[36] = 6;
    return { valid: true, plain: bytes };
  },
  invalidPoint(consumer, statement, proof, inputs) {
    expect(consumer).toBe(BAD);
    expect(statement).toBe(ROOT);
    expect(inputs.length).toBe(2);
    if (((inputs[0]! << 128n) | inputs[1]!) !== BigInt(statement)) throw new Error("MockRejected");
    if (proof === "reject") throw new Error("MockRejected");
    return proof !== "false";
  },
};
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
  const id = sendHidden(
    w,
    "alice",
    1n,
    sim.hiddenCommit(1n, sim.ATTACK, target, 5n),
    1n,
    troops(5n),
    none,
    0n,
    now,
  );
  ROOT = w.hiddenEvidence.get(id)!.receipt.statement;
  POINT_INPUTS[0] = BigInt(ROOT) >> 128n;
  POINT_INPUTS[1] = BigInt(ROOT) & ((1n << 128n) - 1n);
  OPEN_INPUTS[48] = POINT_INPUTS[0]!;
  OPEN_INPUTS[49] = POINT_INPUTS[1]!;
  return { w, id, now };
}
const clone = (w: sim.World) => {
  const { rs, ...state } = w;
  return { ...structuredClone(state), rs };
};
describe("bound historical evidence (no production admission yet)", () => {
  it("blocks overtaking but accepts a late result without draining, matching punctual execution", () => {
    const { w, id, now } = ready();
    const publicId = sim.sendMission(
      w,
      "alice",
      1n,
      sim.ATTACK,
      target,
      troops(1n),
      none,
      0n,
      w.missions.get(id)!.arrival - w.missions.get(id)!.duration,
    );
    const arrival = w.missions.get(id)!.arrival,
      seq = w.missions.get(id)!.seq,
      duration = w.missions.get(id)!.duration,
      late = arrival + 7200n;
    expect(w.missions.get(publicId)!.arrival).toBe(arrival);
    const oracle = clone(w);
    sim.hiddenEvidence.submitOpening(oracle, id, "valid", OPEN_INPUTS, verifier);
    sim.advance(oracle, 20, arrival);
    sim.advance(oracle, 20, late);
    expect(sim.advance(w, 20, late)).toBe(0);
    expect(w.pending[0]).toBe(id);
    expect(() => sim.poke(w, 2n, late)).toThrow("Backlog");
    expect(sim.hiddenEvidence.submitOpening(w, id, "valid", OPEN_INPUTS, verifier)).toBe(true);
    expect(sim.hiddenEvidence.submitOpening(w, id, "valid", OPEN_INPUTS, verifier)).toBe(false);
    expect(w.missions.get(id)!.arrival).toBe(arrival);
    expect(w.missions.get(id)!.seq).toBe(seq);
    expect(sim.advance(w, 1, late)).toBe(1);
    expect(w.missions.get(id)!.start).toBe(arrival);
    expect(w.missions.get(id)!.arrival).toBe(arrival + duration);
    expect(w.pending[0]).toBe(publicId);
    sim.advance(w, 20, late);
    expect(w).toEqual(oracle);
    expect(sim.hiddenEvidence.submitOpening(w, id, "reject", OPEN_INPUTS, verifier)).toBe(false);
  });
  it("normalizes invalidity paths and only returns troops at the original time", () => {
    const a = ready(),
      b = { ...a, w: clone(a.w) };
    const arrival = a.w.missions.get(a.id)!.arrival,
      late = arrival + 7200n;
    sim.hiddenEvidence.submitOpening(a.w, a.id, "invalid", OPEN_INPUTS, verifier);
    sim.hiddenEvidence.submitInvalidPoint(b.w, b.id, "valid", POINT_INPUTS, verifier);
    expect(a.w).toEqual(b.w);
    sim.advance(a.w, 1, late);
    expect(a.w.missions.get(a.id)!.start).toBe(arrival);
    sim.advance(b.w, 1, late);
    expect(a.w).toEqual(b.w);
  });
  it("never translates rejected evidence into invalidity or changes the pending queue", () => {
    const { w, id } = ready();
    const before = clone(w);
    expect(() => sim.hiddenEvidence.submitOpening(w, id, "reject", OPEN_INPUTS, verifier)).toThrow(
      "MockRejected",
    );
    expect(w).toEqual(before);
    expect(() =>
      sim.hiddenEvidence.submitInvalidPoint(w, id, "false", POINT_INPUTS, verifier),
    ).toThrow("ResolutionInvalidProof");
    expect(w).toEqual(before);
  });
  it("rolls back consumption and dequeue if defensive plaintext validation fails", () => {
    const { w, id } = ready(),
      late = w.missions.get(id)!.arrival + 7200n;
    sim.hiddenEvidence.submitOpening(w, id, "bad-plain", OPEN_INPUTS, verifier);
    const before = clone(w);
    expect(() => sim.advance(w, 1, late)).toThrow("BadReveal");
    expect(w).toEqual(before);
    expect(w.hiddenEvidence.get(id)!.receipt.consumed).toBe(false);
  });
  it("allows a pre-arrival recall and ignores later evidence without changing the return", () => {
    const { w, id, now } = ready();
    sim.recall(w, "alice", id, now + 1n);
    const before = clone(w);
    expect(w.hiddenEvidence.get(id)!.cancelled).toBe(true);
    expect(sim.hiddenEvidence.submitOpening(w, id, "reject", OPEN_INPUTS, verifier)).toBe(false);
    expect(w).toEqual(before);
  });
  it("cannot rebind an old v1 mission retroactively", () => {
    const { w, id, now } = ready();
    expect(() => sim.hiddenEvidence.bindForAdmission(w, id, ROOT, OPEN, BAD, now + 1n)).toThrow(
      "ResolutionInvalidBinding",
    );
  });
  it("rejects unknown evidence kinds and malformed input widths without changing state", () => {
    const { w, id } = ready(),
      before = clone(w);
    expect(() => sim.hiddenEvidence.submit(w, id, 9, "valid", new Uint8Array(), verifier)).toThrow(
      "ResolutionInvalidProof",
    );
    expect(() =>
      sim.hiddenEvidence.submit(w, id, 1, "valid", new Uint8Array(55 * 32 - 1), verifier),
    ).toThrow("ResolutionInvalidProof");
    expect(w).toEqual(before);
    const bytes = Uint8Array.from(
      Buffer.from(OPEN_INPUTS.map((v) => v.toString(16).padStart(64, "0")).join(""), "hex"),
    );
    expect(sim.hiddenEvidence.submit(w, id, 1, "valid", bytes, verifier)).toBe(true);
  });
  it("rejects certificates for unknown missions", () => {
    const { w } = ready();
    expect(() =>
      sim.hiddenEvidence.submitOpening(w, 999n, "reject", OPEN_INPUTS, verifier),
    ).toThrow("ResolutionUnknown");
  });
});
