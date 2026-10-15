// Points as a pure function of state (08-progression.md, D-24), in centipoints (×100): some
// per-level values have two decimals.
import type { Ruleset } from "./ruleset.js";

const dot = (weights: bigint[], amounts: readonly bigint[]) =>
  weights.reduce((s, w, i) => s + w * (amounts[i] ?? 0n), 0n);

/** Room levels of one building, indexed by room. */
export const buildingPoints = (rs: Ruleset, levels: readonly bigint[]) =>
  dot(
    rs.buildings.map((b) => b.centipoints),
    levels,
  );

/** A player's research levels, indexed by research. */
export const researchPoints = (rs: Ruleset, levels: readonly bigint[]) =>
  dot(
    rs.research.map((r) => r.centipoints),
    levels,
  );

/** Units per troop type (at home and on missions). */
export const troopPoints = (rs: Ruleset, units: readonly bigint[]) =>
  dot(
    rs.troops.map((t) => t.centipoints),
    units,
  );
