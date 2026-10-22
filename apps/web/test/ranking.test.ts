// The ranking from the loaded world (B-18): players and live families by points, ties to the lower
// id, current points through the projection even when no transaction settled the building, and no
// hidden-mission plaintext, so every client ranks the same.
import { describe, expect, it } from "vitest";
import { sim, vendetta as rs, type HiddenPlain } from "@vendetta/rules";
import { cloneWorld, project } from "../src/chain/load.js";
import { ranking } from "../src/state/ranking.js";

const coord = (slot: number) => ({ city: 1n, neighborhood: 1n, slot: BigInt(slot) });
const room = (id: string) => rs.buildings.findIndex((b) => b.id === id);
const ROWDY = rs.troops.findIndex((t) => t.id === "rowdy");
const rowdies = (n: bigint) => rs.troops.map((_, i) => (i === ROWDY ? n : 0n));
const none = rs.resources.map(() => 0n);
const DAY = 86400n;
const T0 = 1_700_000_000n;

const points = (r: ReturnType<typeof ranking>) =>
  new Map(r.players.map((p) => [p.id, p.centipoints]));

describe("ranking", () => {
  it("orders players by projected points and families by their members' sum", () => {
    const w = sim.newWorld(rs);
    const t = T0;
    for (const [i, c] of ["alice", "bob", "carol", "dave"].entries())
      sim.register(w, c, coord(i + 1), t);
    expect(ranking(w, t).players.map((p) => p.id)).toEqual([1n, 2n, 3n, 4n]); // a tie: oldest first

    const alpha = sim.createFamily(w, "alice", "AAA", "Alpha", t);
    sim.applyToFamily(w, "bob", alpha, t);
    sim.acceptApplication(w, "alice", 2n, t);
    const delta = sim.createFamily(w, "dave", "DDD", "Delta", t);
    sim.createFamily(w, "carol", "CCC", "Gamma", t);
    sim.dissolveFamily(w, "carol", t);
    sim.queueRoom(w, "dave", 4n, room("boot_camp"), t);

    // Nobody touches Dave's building after the room finishes: the stored points lag behind.
    const stored = (id: bigint) => w.players.get(id)!.centipoints;
    expect(stored(4n)).toBe(stored(1n));
    const { players, families } = ranking(w, t + 3n * DAY);
    expect(players.map((p) => p.id)).toEqual([4n, 1n, 2n, 3n]);
    expect(players[0]!.centipoints).toBeGreaterThan(stored(4n));
    expect(players[0]!.buildings).toBe(1n);

    // Dave's finished room outweighs Alpha's second member; the dissolved family is not listed.
    expect(families.map((f) => [f.id, f.tag, f.members])).toEqual([
      [delta, "DDD", 1n],
      [alpha, "AAA", 2n],
    ]);
    expect(families[0]!.centipoints).toBe(players[0]!.centipoints);
    expect(families[1]!.centipoints).toBe(players[1]!.centipoints + players[2]!.centipoints);
  });

  it("counts a room that finishes in the same second a mission settled its building", () => {
    const w = sim.newWorld(rs);
    sim.register(w, "alice", coord(1), T0);
    sim.queueRoom(w, "alice", 1n, room("boot_camp"), T0);
    const b = w.buildings.get(1n)!;
    const { finishAt, seq } = b.roomQueue[0]!;
    // What a mission created before the room leaves behind when it lands at `finishAt` (B-07):
    // the building integrated to that second, the room still queued.
    const c = cloneWorld(w);
    sim.settle(c, c.buildings.get(1n)!, finishAt, seq - 1n);
    expect(c.buildings.get(1n)!.lastUpdate).toBe(finishAt);
    expect(c.buildings.get(1n)!.roomQueue.length).toBe(1);
    expect(ranking(c, finishAt).players[0]!.centipoints).toBe(
      ranking(w, finishAt + 1n).players[0]!.centipoints,
    );
    expect(ranking(c, finishAt).players[0]!.centipoints).toBeGreaterThan(
      w.players.get(1n)!.centipoints,
    );
  });

  it("ignores hidden-mission plaintexts: a due attack counts once its reveal is on chain", () => {
    const w = sim.newWorld(rs);
    let now = T0;
    sim.setGlobalPremium(w, now + 100_000_000n);
    sim.register(w, "alice", coord(1), now);
    sim.register(w, "bob", coord(2), now);
    for (const [c, b] of [
      ["alice", 1n],
      ["bob", 2n],
    ] as const)
      sim.queueRoom(w, c, b, room("boot_camp"), now);
    now += 3n * DAY;
    sim.train(w, "alice", 1n, ROWDY, 7n, now);
    sim.train(w, "bob", 2n, ROWDY, 3n, now);
    now += DAY;
    const plain: HiddenPlain = { kind: sim.ATTACK, target: coord(2), salt: 7n };
    const id = sim.sendHiddenMission(
      w,
      "alice",
      1n,
      sim.hiddenCommit(1n, plain.kind, plain.target, plain.salt),
      3n,
      rowdies(7n),
      none,
      now + 10n ** 7n,
      now,
    );
    const at = w.missions.get(id)!.arrival + 1n; // due, nobody revealed it yet: parked
    const known = new Map([[w.missions.get(id)!.commit, plain]]);

    // The client that holds the plaintext would see the battle; the ranking does not.
    const blind = project(w, at);
    const sighted = project(w, at, known);
    const ranked = points(ranking(w, at));
    for (const p of [1n, 2n]) expect(ranked.get(p)).toBe(blind.players.get(p)!.centipoints);
    expect([1n, 2n].some((p) => sighted.players.get(p)!.centipoints !== ranked.get(p))).toBe(true);

    // Once the reveal is on chain, every client ranks the battle.
    const revealed = cloneWorld(w);
    sim.reveal(revealed, id, plain.kind, plain.target, plain.salt, at);
    const after = points(ranking(revealed, at));
    for (const p of [1n, 2n]) expect(after.get(p)).toBe(sighted.players.get(p)!.centipoints);
  });
});
