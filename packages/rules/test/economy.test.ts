import { describe, expect, it } from "vitest";
import {
  buildingPoints,
  converter,
  productionRates,
  rateDenominator,
  researchPoints,
  troopPoints,
} from "../src/index.js";
import { legacy, levelsOf, rs, type Any } from "./helpers.js";

const DEN = rateDenominator(rs);
const perHour = (rates: Record<string, bigint>) =>
  Object.fromEntries(Object.entries(rates).map(([r, v]) => [r, Number(v) / Number(DEN)]));

/** Total converter consumption of a building (bar + smuggle). */
const demand = (levels: Record<string, number>) =>
  rs.buildings
    .filter((b) => b.production?.kind === "converter")
    .reduce((s, b) => {
      const p = b.production!;
      return (
        s +
        converter(
          p.factor,
          p.consumption_per_unit!,
          p.consumption_fixed!,
          BigInt(levels[b.id] ?? 0),
        ).consumption
      );
    }, 0n);

describe("production", () => {
  it("rate denominator is the lcm of consumption per unit", () => {
    expect(DEN).toBe(28n);
  });

  // Where legacy converts at full rate (brewery output + stock > total consumption), legacy and the
  // target rule (D-07) agree. Starvation cases differ on purpose (legacy can go negative).
  const all = legacy("production");
  const full = all.filter((c: Any) => {
    const brewery = productionRates(rs, levelsOf(c.levels), 1n).alcohol! / DEN + demand(c.levels);
    return brewery + BigInt(c.alcohol_stock) > demand(c.levels);
  });
  it(`has comparable cases (${full.length} of ${all.length})`, () =>
    expect(full.length).toBeGreaterThan(10));
  it.each(full)("levels $levels, stock $alcohol_stock", (c: Any) => {
    expect(perHour(productionRates(rs, levelsOf(c.levels), BigInt(c.alcohol_stock)))).toEqual(
      c.production_per_hour,
    );
  });
});

describe("D-07 alcohol starvation (target rule)", () => {
  // bar L1: Rb = round(2 × 1) = 2, Cb = 2×7+3 = 17. smuggle L1: Rs = 21, Cs = 85. brewery L0: P = 10.
  it("brewery below bar consumption: partial bar, smuggle starved, no negative values", () => {
    const r = perHour(productionRates(rs, levelsOf({ bar: 1, smuggle: 1 }), 0n));
    expect(r.alcohol).toBe(0);
    expect(r.dollar).toBeCloseTo((10 - 3) / 7, 12); // bar takes all 10 alcohol
  });

  it("bar satisfied, smuggle gets the rest", () => {
    // brewery L1: 10 + round(50 × 1) = 60 → bar takes 17, smuggle takes 43 of 85: (43 − 1) / 4.
    const r = perHour(productionRates(rs, levelsOf({ brewery: 1, bar: 1, smuggle: 1 }), 0n));
    expect(r.alcohol).toBe(0);
    expect(r.dollar).toBe(2 + (43 - 1) / 4);
  });

  it("any stock left: both run at full rate and the stock drains", () => {
    const r = perHour(productionRates(rs, levelsOf({ bar: 1, smuggle: 1 }), 1n));
    expect(r.dollar).toBe(2 + 21);
    expect(r.alcohol).toBe(10 - 17 - 85);
  });
});

describe("points (centipoints, D-24)", () => {
  it("rooms, research and troops", () => {
    // mob_school 31.75 per level, boss_office 6 per level.
    expect(buildingPoints(rs, levelsOf({ boss_office: 2, mob_school: 3 }))).toBe(
      2n * 600n + 3n * 3175n,
    );
    expect(
      researchPoints(
        rs,
        rs.research.map((r, i) => (i === 0 ? 4n : 0n)),
      ),
    ).toBe(4n * rs.research[0]!.centipoints);
    const rowdy = rs.troops.find((t) => t.id === "rowdy")!;
    expect(
      troopPoints(
        rs,
        rs.troops.map((t) => (t === rowdy ? 10n : 0n)),
      ),
    ).toBe(10n * rowdy.centipoints);
  });
});
