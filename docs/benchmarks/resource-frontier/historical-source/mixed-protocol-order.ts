// Executable activation blocker: legacy forfeit can allocate a sequence across a v2 wait.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { sim } from "../../src/index.js";
import { rs } from "../../test/helpers.js";
const w = sim.newWorld(rs),
  root = "0x" + "12".repeat(32),
  consumer = "0x" + "11".repeat(20);
let now = 1700000000n;
const target = { city: 1n, neighborhood: 1n, slot: 2n },
  cargo = [0n, 0n, 0n, 0n];
const rowdy = rs.troops.findIndex((t) => t.id === "rowdy"),
  camp = rs.buildings.findIndex((b) => b.id === "boot_camp");
const troops = (n: bigint) => rs.troops.map((_, i) => (i === rowdy ? n : 0n));
sim.register(w, "alice", { ...target, slot: 1n }, now);
sim.register(w, "bob", target, now);
sim.queueRoom(w, "alice", 1n, camp, now);
now += 86400n;
sim.train(w, "alice", 1n, rowdy, 7n, now);
now += 86400n;
sim.poke(w, 1n, now);
const send = (n: bigint) =>
  sim.sendHiddenMission(
    w,
    "alice",
    1n,
    sim.hiddenCommit(1n, sim.ATTACK, target, 5n),
    1n,
    troops(n),
    cargo,
    0n,
    now,
  );
const historical = send(5n);
sim.hiddenEvidence.bindForAdmission(w, historical, root, consumer, consumer, now);
const legacy = send(1n),
  arrival = w.missions.get(historical)!.arrival,
  late = arrival + 7200n;
assert.equal(w.missions.get(legacy)!.arrival, arrival);
const { rs: rules, ...state } = w;
const oracle: sim.World = { ...structuredClone(state), rs: rules };
const verifier: sim.hiddenEvidence.EvidenceVerifier = {
  opening: () => ({
    valid: true,
    plain: Uint8Array.from(Buffer.from("0201010102" + "00".repeat(31) + "05", "hex")),
  }),
  invalidPoint: () => true,
};
sim.hiddenEvidence.submitOpening(oracle, historical, "trusted mock", [], verifier);
sim.advance(oracle, 20, arrival);
sim.forfeit(oracle, legacy, late);
sim.advance(oracle, 20, late);
assert.equal(sim.advance(w, 20, late), 0);
sim.forfeit(w, legacy, late);
sim.hiddenEvidence.submitOpening(w, historical, "trusted mock", [], verifier);
sim.advance(w, 20, late);
const expected = oracle.missions.get(legacy)!,
  actual = w.missions.get(legacy)!;
assert.notEqual(actual.seq, expected.seq);
assert.equal(actual.arrival, expected.arrival);
const dir = new URL("../../../../docs/benchmarks/timelock-opening/game-context/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(
  new URL("mixed-protocol-counterexample.json", dir),
  JSON.stringify(
    {
      scope:
        "Reference engine with trusted-result mock; executable activation blocker, not a cryptographic test",
      historicalMission: String(historical),
      legacyMission: String(legacy),
      delaySeconds: "7200",
      punctualLegacyReturnSequence: String(expected.seq),
      delayedLegacyReturnSequence: String(actual.seq),
      equalReturnArrival: true,
      wholeWorldEquality: false,
      finding:
        "Legacy forfeit allocates a sequence while an earlier v2 mission waits. Mixed admission must remain disabled until a transition/ordering policy prevents this interleaving.",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Confirmed mixed-protocol ordering blocker: legacy return seq ${actual.seq} vs punctual ${expected.seq}`,
);
