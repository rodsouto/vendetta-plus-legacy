import { describe, expect, it } from "vitest";
import { sim } from "../src/index.js";
import { legalFixture, runHistory } from "../scripts/experiments/frontier-histories.js";
import {
  acceptEvidence,
  canonicalWorld,
  cloneWorld,
  conflict,
  actionFootprint,
  missionFootprint,
  ResourceFrontier,
} from "../scripts/experiments/resource-frontier.js";

const c = (slot: bigint) => ({ city: 1n, neighborhood: 1n, slot });
function hidden(occupation = false) {
  const { world, now } = legalFixture(occupation);
  const rs = world.rs;
  const troop = occupation
    ? rs.roles.occupationTroop
    : rs.troops.findIndex((t) => t.id === "rowdy");
  const kind = occupation ? sim.OCCUPY : sim.ATTACK;
  const target = occupation ? c(4n) : c(2n);
  const salt = 42n;
  const id = sim.sendHiddenMission(
    world,
    "alice",
    1n,
    sim.hiddenCommit(1n, kind, target, salt),
    occupation ? 3n : 1n,
    rs.troops.map((_, i) => (i === troop ? 1n : 0n)),
    rs.resources.map(() => 0n),
    0n,
    now,
  );
  return {
    world,
    now,
    id,
    arrival: world.missions.get(id)!.arrival,
    evidence: { mission: id, kind, target, salt },
  };
}

describe("experimental resource frontier", () => {
  it("validates late evidence without changing the original arrival or sequence", () => {
    const { world, id, evidence, arrival } = hidden();
    const before = world.missions.get(id)!;
    const seq = before.seq;
    acceptEvidence(world, evidence);
    acceptEvidence(world, evidence);
    expect(world.missions.get(id)).toMatchObject({ arrival, seq, hidden: false });
    const planner = new ResourceFrontier(world);
    planner.advance(arrival + 7200n);
    expect(planner.execution[0]).toMatchObject({ at: arrival, seq, wall: arrival + 7200n });
  });

  it("rejects invalid evidence without mutating the world", () => {
    const { world, evidence } = hidden();
    const before = canonicalWorld(world);
    expect(() => acceptEvidence(world, { ...evidence, salt: evidence.salt + 1n })).toThrow(
      "BadReveal",
    );
    expect(canonicalWorld(world)).toBe(before);
  });

  it("rejects backwards wall time without changing game state", () => {
    const { world, arrival } = hidden();
    const planner = new ResourceFrontier(world);
    planner.advance(arrival + 1n);
    const before = canonicalWorld(world);
    expect(() => planner.advance(arrival)).toThrow("NonMonotonicTime");
    expect(canonicalWorld(world)).toBe(before);
  });

  it("computes an unknown mission's scope without its future kind or target", () => {
    const { world, id } = hidden();
    const altered = cloneWorld(world);
    altered.missions.get(id)!.kind = sim.OCCUPY;
    altered.missions.get(id)!.target = { city: 50n, neighborhood: 50n, slot: 200n };
    expect(missionFootprint(altered, altered.missions.get(id)!)).toEqual(
      missionFootprint(world, world.missions.get(id)!),
    );
  });

  it("permits unrelated settlement while blocking a global allocator consumer", () => {
    const { world, arrival } = hidden();
    const planner = new ResourceFrontier(world);
    expect(planner.attempt({ type: "poke", building: 3n }, arrival + 1n).status).toBe("accepted");
    expect(
      planner.attempt({ type: "queueRoom", caller: "carol", building: 3n, room: 2 }, arrival + 2n),
    ).toMatchObject({ status: "blocked", resource: "allocator:seq" });
    expect(
      planner.attempt(
        {
          type: "register",
          caller: "outside",
          coord: { city: 50n, neighborhood: 50n, slot: 250n },
        },
        arrival + 3n,
      ).status,
    ).toBe("accepted");
  });

  it("blocks a registration in an empty covered coordinate", () => {
    const { world, arrival } = hidden(true);
    const planner = new ResourceFrontier(world);
    const f = missionFootprint(world, world.missions.get(1n)!);
    // Remove the global allocator conflict to independently exercise the spatial guard.
    f.write.delete("allocator:building");
    const a = actionFootprint(world, { type: "register", caller: "new", coord: c(3n) });
    expect(conflict(world, f, a)).toBe("coord:1:1:3");
    expect(
      planner.attempt({ type: "register", caller: "new", coord: c(3n) }, arrival + 1n).status,
    ).toBe("blocked");
  });

  it("preserves occupation identities by guarding disjoint building allocation", () => {
    const { world, arrival } = hidden(true);
    expect(
      new ResourceFrontier(world).attempt(
        {
          type: "register",
          caller: "outside",
          coord: { city: 50n, neighborhood: 50n, slot: 250n },
        },
        arrival + 1n,
      ),
    ).toMatchObject({ status: "blocked", resource: "allocator:building" });
  });

  it("guards return allocation when a known station bounces from a foreign target", () => {
    const { world, now } = legalFixture();
    const rs = world.rs;
    const rowdy = rs.troops.findIndex((t) => t.id === "rowdy");
    const id = sim.sendMission(
      world,
      "bob",
      2n,
      sim.STATION,
      world.buildings.get(3n)!.coord,
      rs.troops.map((_, i) => (i === rowdy ? 1n : 0n)),
      [0n, 0n, 0n, 0n],
      0n,
      now,
    );
    const m = world.missions.get(id)!;
    expect(missionFootprint(world, m).write.has("allocator:seq")).toBe(true);
    const before = world.seq;
    sim.advance(world, 1, m.arrival);
    expect(world.missions.get(id)!.returning).toBe(true);
    expect(world.seq).toBe(before + 1n);
  });

  it("propagates a blocked public transport to a previously independent destination", () => {
    const { world, id, arrival, evidence, now } = hidden();
    const rs = world.rs;
    const rowdy = rs.troops.findIndex((t) => t.id === "rowdy");
    const transport = sim.sendMission(
      world,
      "bob",
      2n,
      sim.TRANSPORT,
      world.buildings.get(3n)!.coord,
      rs.troops.map((_, i) => (i === rowdy ? 1n : 0n)),
      [0n, 0n, 0n, 0n],
      0n,
      now,
    );
    const due = world.missions.get(transport)!.arrival;
    expect(due).toBeGreaterThan(arrival);
    const planner = new ResourceFrontier(world);
    expect(planner.attempt({ type: "poke", building: 3n }, arrival + 1n).status).toBe("accepted");
    expect(planner.attempt({ type: "poke", building: 3n }, due + 1n)).toMatchObject({
      status: "blocked",
      blocker: transport,
    });
    expect(world.missions.get(id)!.hidden).toBe(true);
    acceptEvidence(world, evidence);
    planner.advance(due + 100000n);
    expect(world.missions.size).toBe(0);
  });

  it("does not execute a later same-second mission when its earlier conflicting reveal is absent", () => {
    const { world, id, arrival, evidence, now } = hidden();
    const rs = world.rs,
      rowdy = rs.troops.findIndex((t) => t.id === "rowdy");
    const salt = 99n,
      target = c(1n);
    const second = sim.sendHiddenMission(
      world,
      "bob",
      2n,
      sim.hiddenCommit(2n, sim.ATTACK, target, salt),
      1n,
      rs.troops.map((_, i) => (i === rowdy ? 1n : 0n)),
      [0n, 0n, 0n, 0n],
      0n,
      now,
    );
    expect(world.missions.get(second)!.arrival).toBe(arrival);
    const planner = new ResourceFrontier(world);
    acceptEvidence(world, { mission: second, kind: sim.ATTACK, target, salt });
    planner.advance(arrival + 200n);
    expect(planner.execution).toHaveLength(0);
    acceptEvidence(world, evidence);
    planner.advance(arrival + 200n);
    expect(planner.execution.slice(0, 2).map((e) => e.mission)).toEqual([id, second]);
  });

  it("keeps valid missions pending during permanent unavailability", () => {
    const result = runHistory({ seed: 3, delay: 7200n, permanent: true });
    expect(result.equal).toBeNull();
    expect(result.pending).toBeGreaterThan(0);
    expect(result.accepted).toBeGreaterThan(0);
  });

  it("permits a legitimate recall before arrival and resolves its still-hidden return", () => {
    const { world, now, id } = hidden();
    const planner = new ResourceFrontier(world);
    expect(
      planner.attempt({ type: "recall", caller: "alice", mission: id }, now + 10n).status,
    ).toBe("accepted");
    expect(world.pending).toEqual([id]);
    planner.advance(now + 20n);
    expect(world.missions.has(id)).toBe(false);
    expect(planner.execution[0]).toMatchObject({ returning: true, at: now + 20n });
  });

  it("does not let a recall after arrival cancel the pending attack", () => {
    const { world, arrival, id } = hidden();
    expect(
      new ResourceFrontier(world).attempt(
        { type: "recall", caller: "alice", mission: id },
        arrival + 1n,
      ),
    ).toMatchObject({ status: "blocked", blocker: id });
    expect(world.missions.get(id)!.returning).toBe(false);
  });

  it("blocks an outside capo through the family resource, not the caller's location", () => {
    const { world, arrival } = hidden();
    expect(
      new ResourceFrontier(world).attempt(
        { type: "dissolveFamily", caller: "carol" },
        arrival + 1n,
      ),
    ).toMatchObject({ status: "blocked", resource: "family:1" });
  });

  it("allows independent research to complete during an unresolved arrival", () => {
    const { world, arrival, id } = hidden();
    const research = world.rs.research.findIndex((r) => r.id === "routing");
    const planner = new ResourceFrontier(world);
    expect(
      planner.attempt(
        { type: "queueResearch", caller: "carol", building: 3n, research },
        arrival - 1n,
      ).status,
    ).toBe("accepted");
    expect(planner.attempt({ type: "poke", building: 3n }, arrival + 10000n).status).toBe(
      "accepted",
    );
    expect(world.players.get(3n)!.research[research]).toBe(1n);
    expect(world.missions.get(id)!.hidden).toBe(true);
  });

  it("executes an independent known return past an earlier unknown attack", () => {
    const fixture = legalFixture();
    const world = fixture.world,
      rs = world.rs;
    const rowdy = rs.troops.findIndex((t) => t.id === "rowdy");
    const boot = rs.buildings.findIndex((b) => b.id === "boot_camp");
    const year = 365n * 86400n;
    sim.queueRoom(world, "carol", 3n, boot, fixture.now);
    sim.train(world, "carol", 3n, rowdy, 1n, fixture.now + year);
    const now = fixture.now + 2n * year;
    const troops = rs.troops.map((_, i) => (i === rowdy ? 1n : 0n));
    const transport = sim.sendMission(
      world,
      "carol",
      3n,
      sim.TRANSPORT,
      { city: 50n, neighborhood: 50n, slot: 250n },
      troops,
      [0n, 0n, 0n, 0n],
      0n,
      now,
    );
    const out = world.missions.get(transport)!.arrival;
    sim.advance(world, 10, out);
    const back = world.missions.get(transport)!.arrival;
    const target = c(2n),
      salt = 77n;
    const attack = sim.sendHiddenMission(
      world,
      "alice",
      1n,
      sim.hiddenCommit(1n, sim.ATTACK, target, salt),
      1n,
      troops,
      [0n, 0n, 0n, 0n],
      0n,
      out,
    );
    expect(world.missions.get(attack)!.arrival).toBeLessThan(back);
    const planner = new ResourceFrontier(world);
    planner.advance(back);
    expect(world.missions.get(attack)!.hidden).toBe(true);
    expect(world.missions.has(transport)).toBe(false);
    expect(planner.execution).toHaveLength(1);
    expect(planner.execution[0]).toMatchObject({ mission: transport, returning: true });
  });

  for (const occupation of [false, true])
    for (const delay of [0n, 20n, 300n, 7200n]) {
      it(`matches the complete chronological world across 16 legal preparations: occupation=${occupation}, delay=${delay}`, () => {
        for (let seed = 1; seed <= 16; seed++) {
          const result = runHistory({ seed, delay, occupation });
          expect(result.equal).toBe(true);
          expect(result.receiptsEqual).toBe(true);
          expect(result.tradePaymentApplied).toBe(true);
        }
      });
    }
});
