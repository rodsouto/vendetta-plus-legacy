import { RevertedError } from "../src/account/signer.js";
import { describe, it, expect } from "vitest";
import { sim, vendetta as rs } from "@vendetta/rules";
import { world, sendHidden, certify } from "../../../packages/rules/test/v2-helpers.js";
import { cloneWorld, project } from "../src/chain/load.js";
import { gameCall, queuePlan, sendBehindQueue } from "../src/state/backlog.js";
const GAME = "0x1111111111111111111111111111111111111111";
const target = { city: 1n, neighborhood: 1n, slot: 2n };
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
  const id = sendHidden(
    w,
    "alice",
    1n,
    sim.hiddenCommit(1n, sim.ATTACK, target, 5n),
    1n,
    rs.troops.map((_, i) => (i === 0 ? 5n : 0n)),
    [0n, 0n, 0n, 0n],
    0n,
    now,
  );
  return { w, id, at: w.missions.get(id)!.arrival + 7200n };
}
describe("certificate-aware queue planning", () => {
  it("never creates a plaintext reveal or forfeiture while evidence is missing", async () => {
    const { w, at } = ready();
    expect(queuePlan(w, at)).toBe(0);
    expect(project(w, at).buildings).toEqual(w.buildings);
    const sent: string[] = [];
    await sendBehindQueue({
      world: w,
      game: GAME,
      calls: [gameCall(GAME, "poke", [2n])],
      clock: () => at,
      submit: async (c) => {
        sent.push(...c.map((x) => x.functionName));
      },
    });
    expect(sent).toEqual(["poke"]);
  });
  it("advances certified missions before an action", async () => {
    const { w, id, at } = ready();
    certify(w, id, sim.ATTACK, target, 5n);
    const before = cloneWorld(w),
      sent: string[] = [];
    await sendBehindQueue({
      world: w,
      game: GAME,
      calls: [gameCall(GAME, "poke", [2n])],
      clock: () => at,
      submit: async (c) => {
        sent.push(...c.map((x) => x.functionName));
      },
    });
    expect(sent).toEqual(["advance", "poke"]);
    expect(w.missions.size).toBe(0);
    expect(before.missions.size).toBe(1);
  });
  it("submits certificates without attempting to drain the stalled queue", async () => {
    const { w, at } = ready(),
      sent: string[] = [];
    await sendBehindQueue({
      world: w,
      game: GAME,
      calls: [gameCall(GAME, "submitHiddenEvidence", [1n, "0x"])],
      clock: () => at,
      submit: async (c) => {
        sent.push(...c.map((x) => x.functionName));
      },
    });
    expect(sent).toEqual(["submitHiddenEvidence"]);
  });
  it("keeps protective account calls available while evidence is missing", async () => {
    const { w, at } = ready(),
      sent: string[] = [];
    await sendBehindQueue({
      world: w,
      game: GAME,
      calls: [gameCall(GAME, "revokeSession", [GAME])],
      clock: () => at,
      submit: async (c) => {
        sent.push(...c.map((x) => x.functionName));
      },
    });
    expect(sent).toEqual(["revokeSession"]);
  });
  it("replans after an advance landed before a Backlog", async () => {
    const { w, id, at } = ready();
    certify(w, id, sim.ATTACK, target, 5n);
    const attempts: string[][] = [];
    await sendBehindQueue({
      world: w,
      game: GAME,
      calls: [gameCall(GAME, "poke", [2n])],
      clock: () => at,
      submit: async (c) => {
        attempts.push(c.map((x) => x.functionName));
        if (attempts.length === 1) throw new RevertedError("Backlog", 1);
      },
    });
    expect(attempts).toEqual([["advance", "poke"], ["poke"]]);
    expect(w.missions.size).toBe(0);
  });
  it("stops after the second Backlog without cancelling the pending attack", async () => {
    const { w, at } = ready();
    let attempts = 0;
    await expect(
      sendBehindQueue({
        world: w,
        game: GAME,
        calls: [gameCall(GAME, "poke", [2n])],
        clock: () => at,
        submit: async () => {
          attempts++;
          throw new RevertedError("Backlog", 0);
        },
      }),
    ).rejects.toThrow("Backlog");
    expect(attempts).toBe(2);
    expect(w.missions.size).toBe(1);
  });
  it("does not resubmit an action that already landed before a later failure", async () => {
    const { w, at } = ready();
    let attempts = 0;
    await expect(
      sendBehindQueue({
        world: w,
        game: GAME,
        calls: [gameCall(GAME, "poke", [1n]), gameCall(GAME, "poke", [2n])],
        clock: () => at,
        submit: async () => {
          attempts++;
          throw new RevertedError("Backlog", 1);
        },
      }),
    ).rejects.toThrow("Backlog");
    expect(attempts).toBe(1);
  });
});
