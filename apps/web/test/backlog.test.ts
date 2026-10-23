// Sending behind a backlog (B-08) with the reveals an operation can make (B-22), against the
// simulator as the chain. The first attempt carries an advance() for every due mission; a Backlog
// gets one retry. A dev account sends the calls one by one, so the calls of a failed attempt that
// landed stay committed: the retry must plan from the chain as it is.
import { describe, expect, it } from "vitest";
import { sim, vendetta as rs, type HiddenPlain } from "@vendetta/rules";
import { cloneWorld, project } from "../src/chain/load.js";
import { RevertedError, type Call } from "../src/account/signer.js";
import { gameCall, revealPlan, sendBehindQueue } from "../src/state/backlog.js";

const GAME = "0x0000000000000000000000000000000000000001";
const ROWDY = rs.troops.findIndex((t) => t.id === "rowdy");
const AMMUNITION = rs.resources.indexOf("ammunition");
const rowdies = (n: bigint) => rs.troops.map((_, i) => (i === ROWDY ? n : 0n));
const none = rs.resources.map(() => 0n);
const coord = (slot: number) => ({ city: 1n, neighborhood: 1n, slot: BigInt(slot) });
const room = (id: string) => rs.buildings.findIndex((b) => b.id === id);
const DAY = 86400n;

/**
 * Alice (player 1, building 1) is 475 ammunition short of one more rowdy. Thirteen hidden missions
 * are due at `at`, past their order windows and within their grace: twelve garbage ones (no
 * plaintext) ahead of a transport to Alice carrying 900 ammunition, whose plaintext is given
 * (900: five rowdies carry 1000 less their salary). The planner reveals whatever plaintexts it is
 * given; the app gives it the player's own only (B-22).
 */
function backlogWorld() {
  const w = sim.newWorld(rs);
  let now = 1_700_000_000n;
  sim.setGlobalPremium(w, now + 100_000_000n);
  const senders = ["bob", "carol", "dave"];
  sim.register(w, "alice", coord(1), now);
  senders.forEach((s, i) => sim.register(w, s, coord(2 + i), now));
  for (let b = 1n; b <= 4n; b++)
    sim.queueRoom(w, b === 1n ? "alice" : senders[Number(b) - 2]!, b, room("boot_camp"), now);
  now += 3n * DAY;
  sim.train(w, "alice", 1n, ROWDY, 7n, now);
  senders.forEach((s, i) => sim.train(w, s, BigInt(2 + i), ROWDY, 7n, now));
  now += DAY;
  for (let b = 1n; b <= 4n; b++) sim.poke(w, b, now);
  sim.train(w, "alice", 1n, ROWDY, 1n, now); // down to a few hundred ammunition
  expect(() => sim.train(w, "alice", 1n, ROWDY, 1n, now)).toThrow("CannotAfford");

  const known = new Map<string, HiddenPlain>();
  const hidden = (
    controller: string,
    building: bigint,
    plain: HiddenPlain,
    troops: bigint,
    cargo: bigint[],
  ) =>
    sim.sendHiddenMission(
      w,
      controller,
      building,
      sim.hiddenCommit(building, plain.kind, plain.target, plain.salt),
      3n,
      rowdies(troops),
      cargo,
      0n, // the natural arrival
      now,
    );
  // Same cover, so the same duration: all land in the same second, the transport last by seq.
  const garbage = (controller: string, building: bigint, salt: bigint) =>
    hidden(controller, building, { kind: sim.ATTACK, target: coord(1), salt }, 1n, none);
  for (let i = 0; i < 5; i++) garbage("bob", 2n, 100n + BigInt(i));
  for (let i = 0; i < 5; i++) garbage("carol", 3n, 200n + BigInt(i));
  for (let i = 0; i < 2; i++) garbage("dave", 4n, 300n + BigInt(i));
  const plain = { kind: sim.TRANSPORT, target: coord(1), salt: 999n };
  const transport = hidden(
    "dave",
    4n,
    plain,
    5n,
    none.map((_, i) => (i === AMMUNITION ? 900n : 0n)),
  );
  known.set(sim.hiddenCommit(4n, plain.kind, plain.target, plain.salt), plain);
  const arrival = w.missions.get(transport)!.arrival;
  expect(w.pending.length).toBe(13);
  expect(w.pending[12]).toBe(transport);
  expect([...w.missions.values()].every((m) => m.arrival === arrival)).toBe(true);
  const at = arrival + rs.config.hiddenOrderWindow + 1n;
  expect(at).toBeLessThan(arrival + rs.config.hiddenRevealGrace);
  return { w, known, transport, at };
}

/** The chain: the simulator run by the calls, as one operation or as one transaction each. */
function chainOf(world: sim.World, semantics: "atomic" | "plain", at: bigint) {
  const chain = cloneWorld(world);
  const attempts: string[][] = [];
  const exec = (x: sim.World, c: Call) => {
    const a = c.args as unknown[];
    switch (c.functionName) {
      case "advance":
        return void sim.advance(x, Number(a[0]), at);
      case "reveal": {
        const [city, neighborhood, slot] = a[2] as bigint[];
        return sim.reveal(
          x,
          a[0] as bigint,
          Number(a[1]),
          { city: city!, neighborhood: neighborhood!, slot: slot! },
          BigInt(a[3] as string),
          at,
        );
      }
      case "train":
        return sim.train(x, "alice", a[0] as bigint, Number(a[1]), a[2] as bigint, at);
    }
    throw new Error(`unexpected ${c.functionName}`);
  };
  const sent: Call[][] = [];
  const submit = async (calls: Call[]) => {
    sent.push(calls);
    attempts.push(calls.map((c) => c.functionName));
    if (semantics === "atomic") {
      const copy = cloneWorld(chain);
      try {
        for (const c of calls) exec(copy, c);
      } catch (e) {
        if (e instanceof sim.GameError) throw new RevertedError(e.code);
        throw e;
      }
      Object.assign(chain, copy);
      return;
    }
    for (const [i, c] of calls.entries()) {
      try {
        exec(chain, c);
      } catch (e) {
        if (e instanceof sim.GameError) throw new RevertedError(e.code, i);
        throw e;
      }
    }
  };
  return { chain, submit, attempts, sent };
}

describe("sendBehindQueue", () => {
  const train = gameCall(GAME, "train", [1n, ROWDY, 1n]);

  it("the projection accepts the action: the known transport funds it", () => {
    const { w, known, at } = backlogWorld();
    const p = project(w, at, known);
    sim.train(p, "alice", 1n, ROWDY, 1n, at);
  });

  for (const semantics of ["atomic", "plain"] as const) {
    it(`reveals the transport and trains behind the backlog (${semantics} operations)`, async () => {
      const { w, known, transport, at } = backlogWorld();
      const { chain, submit, attempts, sent } = chainOf(w, semantics, at);
      const ids = await sendBehindQueue({
        world: w,
        known,
        game: GAME,
        calls: [train],
        submit,
        clock: () => at,
      });
      expect(ids).toEqual([transport]);
      expect(chain.missions.get(transport)!.hidden).toBe(false);
      expect(chain.buildings.get(1n)!.training.some((q) => q.length > 0)).toBe(true);
      // One attempt: the advance covers the thirteen due missions.
      expect(attempts).toEqual([["advance", "reveal", "train"]]);
      expect(sent[0]![0]!.args).toEqual([13n]);
    });

    it(`with no action of its own, the reveal goes behind the advance (${semantics})`, async () => {
      const { w, known, transport, at } = backlogWorld();
      const { chain, submit } = chainOf(w, semantics, at);
      const ids = await sendBehindQueue({
        world: w,
        known,
        game: GAME,
        calls: [],
        submit,
        clock: () => at,
      });
      expect(ids).toEqual([transport]);
      expect(chain.missions.get(transport)!.hidden).toBe(false);
    });
  }

  // `clock` is a fresh block's time on a live chain: before the arrival, no reveal leaves (B-22).
  it("no reveal leaves before its mission arrived on chain, at arrival or in front of an action", async () => {
    const { w, known, transport } = backlogWorld();
    const arrival = w.missions.get(transport)!.arrival;
    const { chain, submit, attempts } = chainOf(w, "plain", arrival - 1n);
    const before = async () => arrival - 1n;
    const ids = await sendBehindQueue({
      world: w,
      known,
      game: GAME,
      calls: [],
      submit,
      clock: before,
    });
    expect(ids).toEqual([]);
    expect(attempts).toEqual([]); // nothing sent: the next tick tries again
    await expect(
      sendBehindQueue({ world: w, known, game: GAME, calls: [train], submit, clock: before }),
    ).rejects.toMatchObject({ errorName: "CannotAfford" }); // the transport stays hidden
    expect(attempts.flat()).not.toContain("reveal");
    expect(chain.missions.get(transport)!.hidden).toBe(true);
  });

  it("an action that landed before a later call reverted is not sent again (plain operations)", async () => {
    const { w, known, at } = backlogWorld();
    const { submit, attempts } = chainOf(w, "plain", at);
    // Two trains in a row: the first lands, the second cannot be afforded. Nothing is retried.
    await expect(
      sendBehindQueue({
        world: w,
        known,
        game: GAME,
        calls: [train, train],
        submit,
        clock: () => at,
      }),
    ).rejects.toMatchObject({ errorName: "CannotAfford" });
    expect(
      attempts
        .filter((a) => a.includes("train"))
        .at(-1)!
        .filter((x) => x === "train"),
    ).toHaveLength(2);
    expect(attempts.at(-1)!.at(-1)).toBe("train");
  });

  it("a Backlog gets one retry, planned from what landed, with the reveals of both attempts", async () => {
    const { w, known, transport, at } = backlogWorld();
    const { chain, submit, attempts } = chainOf(w, "plain", at);
    let blocked = true;
    // The first train hits a mission that came due on the way: advance and reveal stay committed.
    const flaky = async (calls: Call[]) => {
      if (blocked && calls.at(-1)!.functionName === "train") {
        blocked = false;
        await submit(calls.slice(0, -1));
        attempts.at(-1)!.push("train");
        throw new RevertedError("Backlog", calls.length - 1);
      }
      return submit(calls);
    };
    const ids = await sendBehindQueue({
      world: w,
      known,
      game: GAME,
      calls: [train],
      submit: flaky,
      clock: () => at,
    });
    expect(ids).toEqual([transport]);
    // The revealed transport re-entered the queue due now: the retry advances it, then trains.
    expect(attempts).toEqual([
      ["advance", "reveal", "train"],
      ["advance", "train"],
    ]);
    expect(chain.buildings.get(1n)!.training.some((q) => q.length > 0)).toBe(true);
  });

  it("a second Backlog fails: the keeper catches up the queue", async () => {
    const { w, known, at } = backlogWorld();
    let tries = 0;
    await expect(
      sendBehindQueue({
        world: w,
        known,
        game: GAME,
        calls: [train],
        submit: async () => {
          tries++;
          throw new RevertedError("Backlog");
        },
        clock: () => at,
      }),
    ).rejects.toMatchObject({ errorName: "Backlog" });
    expect(tries).toBe(2);
  });

  it("calls that do not drain the queue go out alone, whatever is due (B-26)", async () => {
    const { w, known, at } = backlogWorld();
    const revoke = gameCall(GAME, "revokeSession", ["0x0000000000000000000000000000000000000002"]);
    const sent: Call[][] = [];
    const ids = await sendBehindQueue({
      world: w,
      known,
      game: GAME,
      calls: [revoke],
      submit: async (c) => void sent.push(c),
      clock: () => at,
    });
    expect(ids).toEqual([]);
    expect(sent).toEqual([[revoke]]);
  });

  it("with nothing to reveal, a reveal at arrival sends nothing however much is due", async () => {
    const { w, known, transport } = backlogWorld();
    // Within the order window the parked missions ahead hold the transport (OutOfOrder).
    const held = w.missions.get(transport)!.arrival;
    expect(revealPlan(w, known, GAME, held)).toMatchObject({ due: 13, accepted: [] });
    const ids = await sendBehindQueue({
      world: w,
      known,
      game: GAME,
      calls: [],
      submit: async () => expect.unreachable("nothing to send"),
      clock: () => held,
    });
    expect(ids).toEqual([]);
  });

  it("a mission past its grace is not planned: the reveal would do nothing (B-22)", () => {
    const { w, known, transport } = backlogWorld();
    const end = w.missions.get(transport)!.arrival + rs.config.hiddenRevealGrace;
    expect(revealPlan(w, known, GAME, end - 1n).accepted.map((x) => x.id)).toEqual([transport]);
    expect(revealPlan(w, known, GAME, end).accepted).toEqual([]);
  });
});
