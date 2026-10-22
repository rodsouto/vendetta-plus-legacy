// Timing of hidden missions on a live chain (B-22): the fixed arrival and its quicknet round, the
// check of drand's chain info, and the clock offset that keeps the client behind the chain.
import { describe, expect, it } from "vitest";
import { defaultChainInfo, roundAt, roundTime } from "tlock-js";
import { clockOffset, type Snapshot } from "../src/chain/load.js";
import {
  HEAD_START,
  QUICKNET,
  SEND_MARGIN,
  checkQuicknet,
  quicknetPrepare,
} from "../src/chain/hidden.js";

describe("quicknetPrepare", () => {
  // A natural arrival whose target time falls on a round, one second after it and two after.
  const onRound = QUICKNET.genesis + 1000n * QUICKNET.period - SEND_MARGIN - HEAD_START;
  for (const phase of [0n, 1n, 2n]) {
    it(`fixes the arrival a head start before the next round (phase ${phase})`, () => {
      const natural = onRound + phase;
      const { arrival, round } = quicknetPrepare(natural);
      const opens = BigInt(roundTime(defaultChainInfo, Number(round)) / 1000);
      expect(opens).toBe(arrival + HEAD_START);
      expect(roundAt(Number(opens) * 1000, defaultChainInfo)).toBe(Number(round));
      expect(arrival - natural).toBe(SEND_MARGIN + (phase === 0n ? 0n : QUICKNET.period - phase));
    });
  }
});

describe("checkQuicknet", () => {
  it("accepts quicknet's chain info", () => {
    expect(() => checkQuicknet(defaultChainInfo)).not.toThrow();
  });
  it("rejects another hash, genesis or period", () => {
    expect(() => checkQuicknet({ ...defaultChainInfo, hash: "00" })).toThrow();
    expect(() => checkQuicknet({ ...defaultChainInfo, genesis_time: 1 })).toThrow();
    expect(() => checkQuicknet({ ...defaultChainInfo, period: 30 })).toThrow();
  });
});

describe("clockOffset", () => {
  const snap = (chainTime: bigint, wallAt: number) =>
    ({ chainTime, wallAt, block: 1n }) as Snapshot;

  it("a live chain follows the latest snapshot, behind or ahead", () => {
    const ahead = clockOffset(0, snap(1000n, 1025), true); // device clock 25 s ahead
    expect(ahead).toBe(-25);
    expect(clockOffset(ahead, snap(1006n, 1041), true)).toBe(-35); // and then jumps 10 s
    expect(clockOffset(-35, snap(1012n, 1012), true)).toBe(0);
  });

  it("is measured when the block arrived, not when the world finished loading", () => {
    expect(clockOffset(0, snap(1000n, 1000), true)).toBe(0); // however long the reads took
  });

  it("a local chain only grows: an idle anvil's latest block lags", () => {
    expect(clockOffset(0, snap(1000n, 1300), false)).toBe(0);
    expect(clockOffset(0, snap(5000n, 1300), false)).toBe(3700); // time travel
  });
});
