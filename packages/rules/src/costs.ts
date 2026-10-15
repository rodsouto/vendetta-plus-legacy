// Upgrade and training costs and durations (05-formulas.md), exact. Durations in whole seconds.
import { roundHalfUp } from "./math.js";
import type { Building, Research, ResourceCosts, Ruleset, Troop } from "./ruleset.js";

const scale = (c: ResourceCosts, k: bigint): ResourceCosts =>
  Object.fromEntries(Object.entries(c).map(([r, v]) => [r, v * k]));

export interface Upgrade {
  cost: ResourceCosts;
  seconds: bigint;
}

/** Room level n → n+1: cost base × (n+1)², time round((n+1)² × duration / max(1, build-speed room) / multiplier). */
export function roomUpgrade(
  rs: Ruleset,
  room: Building,
  fromLevel: bigint,
  buildSpeedLevel: bigint,
): Upgrade {
  const sq = (fromLevel + 1n) ** 2n;
  const speed = buildSpeedLevel > 1n ? buildSpeedLevel : 1n;
  return {
    cost: scale(room.cost, sq),
    seconds: roundHalfUp(sq * room.baseSeconds, speed * rs.config.upgradeSpeedMultiplier),
  };
}

/** Research level n → n+1: time round(round((n+1)² × duration / school) / multiplier). D-14: school ≥ 1. */
export function researchUpgrade(
  rs: Ruleset,
  research: Research,
  fromLevel: bigint,
  schoolLevel: bigint,
): Upgrade {
  if (schoolLevel < 1n)
    throw new RangeError("research requires the research-speed room at level ≥ 1 (D-14)");
  const sq = (fromLevel + 1n) ** 2n;
  return {
    cost: scale(research.cost, sq),
    seconds: roundHalfUp(
      roundHalfUp(sq * research.baseSeconds, schoolLevel),
      rs.config.upgradeSpeedMultiplier,
    ),
  };
}

/**
 * Training a batch: cost base × quantity, time ⌊duration × quantity / training-room level⌋ (legacy
 * stores the finish time truncated to whole seconds). D-14: training room ≥ 1.
 */
export function troopTraining(troop: Troop, quantity: bigint, trainingRoomLevel: bigint): Upgrade {
  if (trainingRoomLevel < 1n)
    throw new RangeError("training requires the training room at level ≥ 1 (D-14)");
  return {
    cost: scale(troop.cost, quantity),
    seconds: (troop.trainingSeconds * quantity) / trainingRoomLevel,
  };
}
