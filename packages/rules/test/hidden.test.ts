import { describe, expect, it } from "vitest";
import {
  coverFor,
  decodeHiddenPlain,
  distance,
  encodeHiddenPlain,
  maxDistanceFrom,
  sim,
} from "../src/index.js";
import { rs } from "./helpers.js";

const c = (city: number, neighborhood: number, slot: number) => ({
  city: BigInt(city),
  neighborhood: BigInt(neighborhood),
  slot: BigInt(slot),
});

describe("hidden missions (B-22)", () => {
  it("covers at least the real distance and at most d + max(⌈d/2⌉, 20)", () => {
    const from = c(1, 1, 1);
    for (const to of [c(1, 1, 2), c(3, 2, 40), c(25, 25, 100)]) {
      const d = distance(rs, from, to) / rs.config.distanceUnit;
      const pad = (d + 1n) / 2n > 20n ? (d + 1n) / 2n : 20n;
      expect(coverFor(rs, from, to, 0)).toBe(d);
      expect(coverFor(rs, from, to, 0.999999)).toBe(d + pad);
    }
  });

  it("never covers beyond the farthest corner", () => {
    const from = c(1, 1, 1);
    const to = c(50, 50, 255);
    const cap = maxDistanceFrom(rs, from) / rs.config.distanceUnit;
    expect(distance(rs, from, to) / rs.config.distanceUnit).toBe(cap);
    expect(coverFor(rs, from, to, 0.9)).toBe(cap);
  });

  it("round-trips the plaintext and rejects garbage", () => {
    const p = { kind: sim.ATTACK, target: c(12, 34, 200), salt: 2n ** 255n + 7n };
    expect(decodeHiddenPlain(encodeHiddenPlain(p))).toEqual(p);
    expect(decodeHiddenPlain("not json")).toBeNull();
    expect(decodeHiddenPlain('["x"]')).toBeNull();
  });

  it("commits to owner, kind, target and salt as abi.encode does", () => {
    // keccak256(abi.encode(uint64(1), uint8(1), 1, 1, 2, bytes32(uint256(5)))), from cast.
    expect(sim.hiddenCommit(1n, sim.ATTACK, c(1, 1, 2), 5n)).toBe(EXPECTED);
  });
  it("rejects a salt that would lose its last hex digit instead of aliasing a valid salt", () => {
    expect(() => sim.hiddenCommit(1n, sim.ATTACK, c(1, 1, 2), 1n << 256n)).toThrow(RangeError);
    expect(sim.hiddenCommit(1n, sim.ATTACK, c(1, 1, 2), 1n << 252n)).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it("rejects negative words instead of converting a negative byte to an unsigned value", () => {
    expect(() => sim.hiddenCommit(1n, sim.ATTACK, c(1, 1, 2), -5n)).toThrow(RangeError);
    expect(() => sim.hiddenCommit(-1n, sim.ATTACK, c(1, 1, 2), 5n)).toThrow(RangeError);
    expect(() => sim.hiddenCommit(1n, sim.ATTACK, { ...c(1, 1, 2), slot: -1n }, 5n)).toThrow(
      RangeError,
    );
  });
  it("preserves all bits of the largest ABI word", () => {
    const max = (1n << 256n) - 1n;
    // Independently encoded and hashed with cast's uint64/uint8/bytes32 ABI codec.
    expect(sim.hiddenCommit(1n, sim.ATTACK, c(1, 1, 2), max)).toBe(
      "0x625f44773c5e5b2bd846b7a262b98f0de65d83561f2c49e438b2bdbac6201a63",
    );
  });
});

const EXPECTED = "0x23829e3166d9bb69103ff874ef807062e06f83205762e3166557c8377b1a0f88";
