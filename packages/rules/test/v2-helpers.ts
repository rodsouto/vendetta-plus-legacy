// Test-only trusted verifier boundary. Never imported by production/browser code.
import { sim, distance, type Coord, type Ruleset } from "../src/index.js";
export const CONSUMERS = {
  openingConsumer: "0x" + "11".repeat(20),
  invalidPointConsumer: "0x" + "22".repeat(20),
};
export const ENV = { chainId: 100n, game: "0x" + "33".repeat(20) };
export function world(rs: Ruleset): sim.World {
  return sim.newWorld(rs, CONSUMERS);
}
export function packet(arrival: bigint): Uint8Array {
  const p = Buffer.alloc(273);
  p.set(Buffer.from("56444832" + sim.hiddenContext.NETWORK, "hex"));
  p.writeBigUInt64BE((arrival + 15n - 1692803367n) / 3n + 1n, 36);
  return p;
}
export function sendHidden(
  w: sim.World,
  caller: string,
  building: bigint,
  commit: string,
  cover: bigint,
  troops: bigint[],
  cargo: bigint[],
  arrival: bigint,
  now: bigint,
): bigint {
  const natural = sim.previewHiddenMission(
    w,
    caller,
    building,
    commit,
    cover,
    troops,
    cargo,
    now,
  ).arrival;
  if (arrival === 0n) arrival = natural + ((3n - ((natural + 15n - 1692803367n) % 3n)) % 3n);
  return sim.sendHiddenMission(
    w,
    caller,
    building,
    commit,
    cover,
    troops,
    cargo,
    packet(arrival),
    arrival,
    now,
    ENV,
  );
}
export function certify(
  w: sim.World,
  id: bigint,
  kind: number,
  target: Coord,
  salt: bigint,
  _now?: bigint,
): void {
  const plain = Buffer.concat([
    Buffer.from([2, kind, Number(target.city), Number(target.neighborhood), Number(target.slot)]),
    Buffer.from(salt.toString(16).padStart(64, "0"), "hex"),
  ]);
  const m = w.missions.get(id)!;
  const valid =
    kind >= 1 &&
    kind <= 4 &&
    target.city >= 1n &&
    target.city <= w.rs.config.cities &&
    target.neighborhood >= 1n &&
    target.neighborhood <= w.rs.config.neighborhoods &&
    target.slot >= 1n &&
    target.slot <= w.rs.config.slots &&
    sim.coordKey(m.from) !== sim.coordKey(target) &&
    sim.hiddenCommit(m.owner, kind, target, salt) === m.commit &&
    distance(w.rs, m.from, target) <= m.cover * w.rs.config.distanceUnit &&
    (kind === sim.TRANSPORT || m.cargo.every((n) => n === 0n));
  sim.hiddenEvidence.submitOpening(w, id, "trusted-test-result", [], {
    opening: () => ({ valid, plain: valid ? plain : new Uint8Array() }),
    invalidPoint: () => true,
  });
}
export function reject(w: sim.World, id: bigint): void {
  sim.hiddenEvidence.submitInvalidPoint(w, id, "trusted-test-result", [], {
    opening: () => ({ valid: false, plain: new Uint8Array() }),
    invalidPoint: () => true,
  });
}
