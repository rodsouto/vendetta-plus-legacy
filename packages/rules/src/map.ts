// Coordinates, distance, travel time and salary (05-formulas.md), exact (B-03).
import { floorPow, roundSqrt } from "./math.js";
import type { Ruleset } from "./ruleset.js";

export interface Coord {
  city: bigint;
  neighborhood: bigint;
  slot: bigint;
}

export function parseCoord(text: string): Coord {
  const parts = text.split(":").map((p) => BigInt(p));
  if (parts.length !== 3) throw new RangeError(`bad coordinate ${text}`);
  const [city, neighborhood, slot] = parts as [bigint, bigint, bigint];
  return { city, neighborhood, slot };
}

/** Grid position: x from the city, y from the neighborhood (legacy quirk). */
export function gridPosition(rs: Ruleset, c: Coord): { x: bigint; y: bigint } {
  const cols = rs.config.gridColumns;
  const col = c.slot % cols === 0n ? cols : c.slot % cols;
  const row = (c.slot + cols - 1n) / cols; // ceil(slot / cols)
  return {
    x: (c.city - 1n) * cols + col - 1n,
    y: (c.neighborhood - 1n) * rs.config.gridRows + row - 1n,
  };
}

/** round(√(dx² + dy²)) × distance unit. */
export function distance(rs: Ruleset, from: Coord, to: Coord): bigint {
  const a = gridPosition(rs, from);
  const b = gridPosition(rs, to);
  return roundSqrt((a.x - b.x) ** 2n + (a.y - b.y) ** 2n) * rs.config.distanceUnit;
}

/** Distance to the farthest corner of the map: the longest trip from `from` (B-22 cover cap). */
export function maxDistanceFrom(rs: Ruleset, from: Coord): bigint {
  const a = gridPosition(rs, from);
  const w = rs.config.cities * rs.config.gridColumns - 1n;
  const h = rs.config.neighborhoods * rs.config.gridRows - 1n;
  const dx = a.x > w - a.x ? a.x : w - a.x;
  const dy = a.y > h - a.y ? a.y : h - a.y;
  return roundSqrt(dx ** 2n + dy ** 2n) * rs.config.distanceUnit;
}

/**
 * One-way travel time in seconds: round(3600 × (d × factor / v)^exponent), v = slowest speed.
 * round(x) = ⌊(⌊2x⌋ + 1) / 2⌋, and ⌊2x⌋ is an exact rational power.
 */
export function travelSeconds(rs: Ruleset, dist: bigint, speed: bigint): bigint {
  if (speed <= 0n) throw new RangeError("speed must be positive");
  const f = rs.config.durationFactor;
  const e = rs.config.durationExponent;
  const twice = floorPow(dist * f.num, f.den * speed, Number(e.num), Number(e.den), 7200n);
  return (twice + 1n) / 2n;
}

/** Mission salary in dollars: ⌊d^exponent × Σ(quantity × salary) / divisor⌋. */
export function missionSalary(rs: Ruleset, dist: bigint, totalSalary: bigint): bigint {
  const e = rs.config.salaryExponent;
  return floorPow(dist, 1n, Number(e.num), Number(e.den), totalSalary) / rs.config.salaryDivisor;
}
