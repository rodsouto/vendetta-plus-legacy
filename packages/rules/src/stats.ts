// Effective troop stats (05-formulas.md#troop-effective-stats), exact (B-03):
//   floor((1 + √L/10) × base) = base + ⌊isqrt(base² × L) / 10⌋
//   round((1 + √L/10) × base) = base + ⌊(isqrt(base² × L) + 5) / 10⌋
// Mirrors contracts/src/combat/TroopStats.sol.
import { isqrt } from "./math.js";
import type { Ruleset, Troop } from "./ruleset.js";

export interface Stats {
  attack: bigint;
  defense: bigint;
  speed: bigint;
  capacity: bigint;
}

const floorBoost = (base: bigint, level: bigint) => base + isqrt(base * base * level) / 10n;
const roundBoost = (base: bigint, level: bigint) => base + (isqrt(base * base * level) + 5n) / 10n;
const sum = (levels: readonly bigint[], research: number[]) =>
  research.reduce((s, r) => s + levels[r]!, 0n);

/** Stats of one troop type for a player's research levels (indexed by research). */
export function troopStats(rs: Ruleset, troop: Troop, levels: readonly bigint[]): Stats {
  return {
    attack: floorBoost(troop.baseAttack, sum(levels, troop.attackResearch)),
    defense: floorBoost(troop.baseDefense, sum(levels, troop.defenseResearch)),
    speed:
      troop.speedResearch === null ? 0n : roundBoost(troop.baseSpeed, levels[troop.speedResearch]!),
    capacity: troop.isAttack ? roundBoost(troop.baseCapacity, levels[rs.roles.cargoResearch]!) : 0n,
  };
}

/** Stats of every troop type, in canonical order. */
export function allTroopStats(rs: Ruleset, levels: readonly bigint[]): Stats[] {
  return rs.troops.map((t) => troopStats(rs, t, levels));
}
