// Hidden missions (blockchain.md B-22), the parts every client shares: the plaintext the timelock
// encrypts and the random cover distance. The commitment itself is sim.hiddenCommit.
import { distance, maxDistanceFrom, type Coord } from "./map.js";
import type { Ruleset } from "./ruleset.js";

/** What a hidden mission commits to and the timelock encrypts. */
export interface HiddenPlain {
  kind: number;
  target: Coord;
  salt: bigint;
}

export function encodeHiddenPlain(p: HiddenPlain): string {
  const { city, neighborhood, slot } = p.target;
  return JSON.stringify([p.kind, String(city), String(neighborhood), String(slot), String(p.salt)]);
}

/** The plaintext back, or null when it is not one (garbage or someone else's format). */
export function decodeHiddenPlain(text: string): HiddenPlain | null {
  try {
    const [kind, city, neighborhood, slot, salt] = JSON.parse(text) as unknown[];
    if (typeof kind !== "number") return null;
    const big = (x: unknown) => BigInt(x as string);
    return {
      kind,
      target: { city: big(city), neighborhood: big(neighborhood), slot: big(slot) },
      salt: big(salt),
    };
  } catch {
    return null;
  }
}

/**
 * The cover distance a client declares, in grid units: the real distance d plus a uniform
 * U(0, max(⌈d/2⌉, 20)) from `rand` ∈ [0, 1), capped at the farthest map corner. Calibrated in the
 * B-22 spike: ≥ 13 candidate targets in 9 of 10 sends with 200 buildings, for ~5% more travel time.
 */
export function coverFor(rs: Ruleset, from: Coord, to: Coord, rand: number): bigint {
  const unit = rs.config.distanceUnit;
  const d = distance(rs, from, to) / unit;
  const half = (d + 1n) / 2n;
  const pad = half > 20n ? half : 20n;
  const cover = d + BigInt(Math.floor(rand * Number(pad + 1n)));
  const cap = maxDistanceFrom(rs, from) / unit;
  return cover < cap ? cover : cap;
}
