import { CONSUMERS } from "./v2-helpers.js";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { sim } from "../src/index.js";
import { rs } from "./helpers.js";
const vectors = JSON.parse(
  readFileSync(
    new URL("../../../docs/benchmarks/timelock-opening/codec-v2/vectors.json", import.meta.url),
    "utf8",
  ),
).vectors;
const env = { chainId: 100n, game: "0x1111111111111111111111111111111111111111" };
const consumer = "0x2222222222222222222222222222222222222222";
function setup(v = vectors[0]) {
  const w = sim.newWorld(rs, CONSUMERS),
    c = v.context;
  const packet = Uint8Array.from(Buffer.from(v.packet, "hex"));
  const m: sim.Mission = {
    id: BigInt(c.mission),
    owner: BigInt(c.owner),
    origin: 1n,
    kind: 0,
    returning: false,
    target: { city: 0n, neighborhood: 0n, slot: 0n },
    start: BigInt(c.arrival) - 100n,
    arrival: BigInt(c.arrival),
    duration: 100n,
    seq: 7n,
    troops: rs.troops.map(() => 0n),
    cargo: c.cargo.map(BigInt),
    trade: 0n,
    from: {
      city: BigInt(c.from.city),
      neighborhood: BigInt(c.from.neighborhood),
      slot: BigInt(c.from.slot),
    },
    hidden: true,
    cover: BigInt(c.cover),
    commit: c.commitment,
  };
  w.missions.set(m.id, m);
  w.pending.push(m.id);
  return { w, m, packet };
}
describe("storage-derived v2 research context", () => {
  it("matches all archived TS/Go full-mission statement encodings byte for byte", () => {
    for (const v of vectors) {
      const { w, m, packet } = setup(v);
      expect(
        "0x" + Buffer.from(sim.hiddenContext.encode(w, m.id, packet, env)).toString("hex"),
      ).toBe(v.abi);
      expect(sim.hiddenContext.statement(w, m.id, packet, env)).toBe(v.statement);
    }
  });
  it("binds the storage-derived statement and original queue identity", () => {
    const { w, m, packet } = setup();
    sim.hiddenEvidence.bindPacketForAdmission(w, m.id, packet, env, consumer, consumer, m.start);
    expect(w.hiddenEvidence.get(m.id)!.receipt).toMatchObject({
      statement: vectors[0].statement,
      arrival: m.arrival,
      seq: m.seq,
    });
    expect(() =>
      sim.hiddenEvidence.bindPacketForAdmission(w, m.id, packet, env, consumer, consumer, m.start),
    ).toThrow("ResolutionAlreadyInitialized");
  });
  it("changes the statement for every stored semantic field and execution domain", () => {
    for (const change of [
      (m: sim.Mission) => m.owner++,
      (m: sim.Mission) => m.from.city++,
      (m: sim.Mission) => m.from.neighborhood++,
      (m: sim.Mission) => m.from.slot++,
      (m: sim.Mission) => m.cover++,
      ...[0, 1, 2, 3].map((i) => (m: sim.Mission) => (m.cargo[i] = 1n)),
      (m: sim.Mission) => (m.commit = "0x" + "00".repeat(32)),
    ]) {
      const { w, m, packet } = setup();
      change(m);
      expect(sim.hiddenContext.statement(w, m.id, packet, env)).not.toBe(vectors[0].statement);
    }
    const { w, m, packet } = setup();
    for (const e of [
      { ...env, chainId: 101n },
      { ...env, game: consumer },
    ])
      expect(sim.hiddenContext.statement(w, m.id, packet, e)).not.toBe(vectors[0].statement);
    w.missions.set(2n, { ...m, id: 2n });
    expect(sim.hiddenContext.statement(w, 2n, packet, env)).not.toBe(vectors[0].statement);
  });
  it("rejects framing errors and out-of-profile rounds", () => {
    const { m, packet } = setup();
    for (const offset of [0, 3, 4, 35]) {
      const p = Uint8Array.from(packet);
      p[offset] = p[offset]! ^ 1;
      expect(() => sim.hiddenContext.packetRound(p, m.arrival)).toThrow("ResolutionInvalidPacket");
    }
    for (const p of [packet.subarray(0, 272), new Uint8Array(274)])
      expect(() => sim.hiddenContext.packetRound(p, m.arrival)).toThrow("ResolutionInvalidPacket");
    for (const round of [0n, 1n << 53n, (1n << 64n) - 1n]) {
      const p = Buffer.from(packet);
      p.writeBigUInt64BE(round, 36);
      expect(() => sim.hiddenContext.packetRound(p, m.arrival)).toThrow("ResolutionInvalidPacket");
    }
    expect(() => sim.hiddenContext.packetRound(packet, m.arrival + 1n)).toThrow(
      "ResolutionInvalidContext",
    );
  });
  it("accepts opaque garbage U/MAC/body for subsequent certified invalidity", () => {
    const { w, m, packet } = setup();
    packet.fill(0, 44);
    expect(sim.hiddenContext.packetRound(packet, m.arrival)).toBe(1000n);
    expect(sim.hiddenContext.statement(w, m.id, packet, env)).not.toBe(vectors[0].statement);
  });
  it("rejects missing, public, returning and late-bound missions without installing receipts", () => {
    const { w, m, packet } = setup();
    expect(() => sim.hiddenContext.encode(w, 99n, packet, env)).toThrow("ResolutionInvalidContext");
    m.hidden = false;
    expect(() => sim.hiddenContext.encode(w, m.id, packet, env)).toThrow(
      "ResolutionInvalidContext",
    );
    m.hidden = true;
    m.returning = true;
    expect(() => sim.hiddenContext.encode(w, m.id, packet, env)).toThrow(
      "ResolutionInvalidContext",
    );
    m.returning = false;
    expect(() =>
      sim.hiddenEvidence.bindPacketForAdmission(
        w,
        m.id,
        packet,
        env,
        consumer,
        consumer,
        m.start + 1n,
      ),
    ).toThrow("ResolutionInvalidBinding");
    expect(w.hiddenEvidence.size).toBe(0);
  });
});
