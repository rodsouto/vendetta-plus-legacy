// Honor power percentage (05-formulas.md#honor-attack-power-percentage), exact, with D-17 and D-27.
// Mirrors contracts/src/combat/Honor.sol.
import type { Ruleset } from "./ruleset.js";

export function honorPct(rs: Ruleset, buildings: bigint, honorLevel: number): bigint {
  const p = rawPct(rs, buildings, honorLevel);
  return p < rs.config.honorMinPercent ? rs.config.honorMinPercent : p; // D-27
}

function rawPct(rs: Ruleset, buildings: bigint, honorLevel: number): bigint {
  const c = rs.config;
  if (buildings < c.honorMinBuildings) return 100n;
  const h = Math.min(honorLevel, c.honorMaxLevel); // D-17: before every branch
  const cell = (b: bigint) => BigInt(c.honorTable[Number(b / 5n) - 1]![h]!);
  if (buildings > c.honorTableMaxBuildings) {
    return (200n * cell(c.honorTableMaxBuildings) + buildings) / (2n * buildings);
  }
  const base = (buildings / 5n) * 5n;
  const high = cell(base);
  if (base === buildings) return high;
  // round(high − (high − low) / 5 × (B − base)): a multiple of 1/5, never a tie.
  const low = cell(base + 5n);
  return (2n * (5n * high - (high - low) * (buildings - base)) + 5n) / 10n;
}
