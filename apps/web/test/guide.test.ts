import { describe, expect, it } from "vitest";
import { sim, vendetta as rs, type HiddenPlain } from "@vendetta/rules";
import {
  expansionGuide,
  expansionRecommendations,
  roomRecommendation,
} from "../src/state/guide.js";

function setup() {
  const w = sim.newWorld(rs);
  sim.register(w, "alice", { city: 1n, neighborhood: 1n, slot: 1n }, 1000n);
  return { w, p: w.players.get(1n)!, b: w.buildings.get(1n)! };
}
const steps = (s: ReturnType<typeof setup>) => expansionGuide(s.w, s.p, s.b);
const recommendations = (s: ReturnType<typeof setup>) => expansionRecommendations(steps(s));
const room = (id: string) => rs.buildings.find((r) => r.id === id)!.index;
const prepareEconomy = (s: ReturnType<typeof setup>) => {
  for (const step of steps(s))
    if (step.kind === "room" && step.phase < 4) s.b.levels[step.index] = step.level;
};

describe("expansion recommendations", () => {
  it("starts with production, preserves intermediate milestones and does not mutate the world", () => {
    const s = setup();
    const before = structuredClone(s.w);
    const path = steps(s);
    expect(path[0]).toMatchObject({
      kind: "room",
      index: room("ammunition_depot"),
      level: 1n,
      done: false,
    });
    expect(
      path
        .filter((r) => r.index === rs.roles.buildSpeedRoom && r.kind === "room")
        .map((r) => r.level),
    ).toEqual([2n, 5n]);
    for (const requirement of rs.troops[rs.roles.occupationTroop]!.requirements)
      expect(path).toContainEqual(expect.objectContaining(requirement));
    expect(s.w).toEqual(before);
  });

  it("recognizes queued work and advances past completed milestones", () => {
    const s = setup();
    const next = recommendations(s)[0]!;
    sim.queueRoom(s.w, "alice", s.b.id, next.index, 1000n);
    expect(recommendations(s)[0]!.pending).toBe(true);
    sim.settle(s.w, s.b, s.b.roomQueue[0]!.finishAt);
    expect(recommendations(s)[0]).toMatchObject({ index: rs.roles.buildSpeedRoom, level: 2n });
    s.b.levels[room("ammunition_depot")] = 14n;
    s.b.levels[rs.roles.buildSpeedRoom] = 5n;
    expect(recommendations(s)[0]).toMatchObject({ index: room("weapons_armoury"), level: 3n });
  });

  it("marks only the room queue head in progress, with later levels assigned to their own milestones", () => {
    const s = setup();
    sim.setGlobalPremium(s.w, 1000000n);
    const ammo = room("ammunition_depot");
    sim.queueRoom(s.w, "alice", s.b.id, ammo, 1000n);
    sim.queueRoom(s.w, "alice", s.b.id, rs.roles.buildSpeedRoom, 1000n);
    sim.queueRoom(s.w, "alice", s.b.id, ammo, 1000n);
    sim.queueRoom(s.w, "alice", s.b.id, room("weapons_armoury"), 1000n);
    const path = steps(s);
    expect(path.filter((r) => r.kind === "room" && r.pending)).toHaveLength(1);
    expect(path[0]).toMatchObject({ level: 1n, pending: true });
    expect(path.find((r) => r.index === ammo && r.level === 3n)).toMatchObject({
      pending: false,
      queued: true,
    });
    expect(path.find((r) => r.index === ammo && r.level === 5n)).toMatchObject({
      pending: false,
      queued: false,
    });
    expect(path.find((r) => r.index === rs.roles.buildSpeedRoom && r.level === 2n)).toMatchObject({
      pending: false,
      queued: true,
    });
    sim.settle(s.w, s.b, s.b.roomQueue[0]!.finishAt);
    const advanced = steps(s);
    expect(advanced.filter((r) => r.kind === "room" && r.pending)).toHaveLength(1);
    expect(advanced.find((r) => r.pending)).toMatchObject({
      index: rs.roles.buildSpeedRoom,
      level: 2n,
    });
    expect(advanced[0]!.done).toBe(true);
  });

  it("recommends research and camp upgrades in parallel once the economy and school are ready", () => {
    const s = setup();
    prepareEconomy(s);
    expect(recommendations(s).map((r) => r.index)).toEqual([rs.roles.researchSpeedRoom]);
    s.b.levels[rs.roles.researchSpeedRoom] = 1n;
    const actions = recommendations(s);
    expect(actions.map((r) => r.kind)).toEqual(["research", "room"]);
    expect(actions[1]).toMatchObject({ index: rs.roles.attackTrainingRoom, level: 2n });
    expect(actions[0]!.cost).toEqual(sim.researchJob(s.w, s.p, s.b, actions[0]!.index).cost);
    s.p.research[actions[0]!.index] = actions[0]!.level;
    expect(recommendations(s)[0]!.kind).toBe("room");
  });

  it("sends an already trained troop to the map without requiring optional economic milestones", () => {
    const s = setup();
    s.b.troops[rs.roles.occupationTroop] = 1n;
    expect(recommendations(s)[0]!.kind).toBe("occupy");
    s.p.buildings = 2n;
    expect(recommendations(s)).toEqual([]);
  });

  it("resolves prerequisites of locked storage rather than suggesting an inaccessible upgrade", () => {
    const s = setup();
    const storage = rs.buildings.find((r) => r.storage?.resource === "dollar")!;
    const goal = roomRecommendation(s.w, s.p, s.b, storage.index);
    expect(goal.index).not.toBe(storage.index);
    expect(
      rs.buildings[goal.index]!.requirements.every((r) => s.b.levels[r.index]! >= r.level),
    ).toBe(true);
  });

  it("recognizes an own hidden occupation and never treats a return as an outbound expedition", () => {
    const s = setup();
    s.w.missions.set(1n, {
      owner: s.p.id,
      returning: false,
      hidden: true,
      commit: "own",
      kind: 0,
    } as sim.Mission);
    const known = new Map([["own", { kind: sim.OCCUPY } as HiddenPlain]]);
    const actions = expansionRecommendations(expansionGuide(s.w, s.p, s.b, known));
    expect(actions[0]).toMatchObject({ kind: "occupy", pending: true });
    s.w.missions.get(1n)!.returning = true;
    expect(expansionGuide(s.w, s.p, s.b, known).at(-1)?.pending).toBe(false);
  });

  it("funds and trains the first occupation troop through real production, storage and parallel queues", () => {
    const s = setup();
    let finished = false;
    // One visit per simulated hour, without premium, gifts, trading or invented balances.
    for (let hour = 0; hour < 480; hour++) {
      const now = 1000n + BigInt(hour) * 3600n;
      sim.settle(s.w, s.b, now);
      if (s.b.troops[rs.roles.occupationTroop]! > 0n) {
        finished = true;
        break;
      }
      for (const action of recommendations(s)) {
        if (action.pending || action.queued || !action.available || !action.cost) continue;
        const caps = sim.capacities(s.w, s.b);
        for (const [i, resource] of rs.resources.entries())
          expect((action.cost[resource] ?? 0n) * sim.stockScale(rs)).toBeLessThanOrEqual(caps[i]!);
        if (!sim.affordable(s.w, s.b, action.cost)) continue;
        if (action.kind === "room" && !s.b.roomQueue.length)
          sim.queueRoom(s.w, "alice", s.b.id, action.index, now);
        if (action.kind === "research" && !s.p.researchQueue.length)
          sim.queueResearch(s.w, "alice", s.b.id, action.index, now);
        if (action.kind === "troop") sim.train(s.w, "alice", s.b.id, action.index, 1n, now);
      }
    }
    expect(finished).toBe(true);
    const targets = {
      boss_office: 5,
      weapons_armoury: 10,
      ammunition_depot: 14,
      brewery: 8,
      bar: 5,
      smuggle: 2,
      mob_school: 1,
      boot_camp: 2,
      weapon_storage: 1,
      ammunition_storage: 1,
      safe_room: 1,
    };
    for (const [id, level] of Object.entries(targets))
      expect(s.b.levels[room(id)]).toBe(BigInt(level));
    expect(s.b.levels[room("alcohol_storage")]).toBe(0n);
    expect(recommendations(s)[0]!.kind).toBe("occupy");
  });
});
