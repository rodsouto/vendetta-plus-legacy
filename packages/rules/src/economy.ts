// Production rates (01-resources.md) with the target alcohol → dollar flow (D-07), and storage.
// Rates are per hour in units of 1/RATE_DEN, so the partial converter flows ((a − fixed) / per_unit)
// stay exact integers. RATE_DEN = lcm of the converters' consumption_per_unit (28 for Vendetta).
import { gcd, roundHalfUp } from "./math.js";
import type { Ruleset } from "./ruleset.js";

export function rateDenominator(rs: Ruleset): bigint {
  return rs.buildings.reduce((den, b) => {
    const k = BigInt(b.production?.consumption_per_unit ?? 1);
    return (den * k) / gcd(den, k);
  }, 1n);
}

const quarterSquare = (factor: number, level: bigint) =>
  roundHalfUp(BigInt(factor) * (level + 1n) ** 2n, 4n);

/** Output of a producer room: base_rate at level 0, else base_rate + round(factor × ((L+1)/2)²). */
export function producerRate(base: number, factor: number, level: bigint): bigint {
  return level === 0n ? BigInt(base) : BigInt(base) + quarterSquare(factor, level);
}

/** A converter room at level L: full output R and full consumption C = R × per_unit + fixed (0, 0 at L = 0). */
export function converter(factor: number, perUnit: number, fixed: number, level: bigint) {
  if (level === 0n) return { output: 0n, consumption: 0n };
  const output = quarterSquare(factor, level);
  return { output, consumption: output * BigInt(perUnit) + BigInt(fixed) };
}

/**
 * Net hourly rate per resource (× rateDenominator) of one building, given its room levels and
 * whether its stock of the converted resource is above zero. D-07:
 *  - stock > 0 or brewery output ≥ total consumption: converters run at full rate;
 *  - otherwise only the brewery flow is available; each converter in file order takes what it can
 *    (all, or a partial output max(0, (taken − fixed) / per_unit)), and the stock stays at 0.
 */
export function productionRates(
  rs: Ruleset,
  levels: readonly bigint[],
  convertedStock: bigint,
): Record<string, bigint> {
  const den = rateDenominator(rs);
  const rates: Record<string, bigint> = Object.fromEntries(rs.resources.map((r) => [r, 0n]));
  const converters: {
    output: string;
    input: string;
    full: bigint;
    consumption: bigint;
    perUnit: bigint;
    fixed: bigint;
  }[] = [];
  for (const b of rs.buildings) {
    const p = b.production;
    if (!p) continue;
    const level = levels[b.index]!;
    if (p.kind === "producer") {
      rates[p.resource]! += producerRate(p.base_rate!, p.factor, level) * den;
    } else {
      const c = converter(p.factor, p.consumption_per_unit!, p.consumption_fixed!, level);
      converters.push({
        output: p.resource,
        input: p.consumes!,
        full: c.output,
        consumption: c.consumption,
        perUnit: BigInt(p.consumption_per_unit!),
        fixed: BigInt(p.consumption_fixed!),
      });
    }
  }
  const inputs = new Set(converters.map((c) => c.input));
  for (const input of inputs) {
    const group = converters.filter((c) => c.input === input);
    const supply = rates[input]!; // × den
    const demand = group.reduce((s, c) => s + c.consumption, 0n) * den;
    if (convertedStock > 0n || supply >= demand) {
      rates[input]! -= demand;
      for (const c of group) rates[c.output]! += c.full * den;
      continue;
    }
    let available = supply / den; // brewery output is an integer rate
    for (const c of group) {
      const taken = available < c.consumption ? available : c.consumption;
      available -= taken;
      if (taken === c.consumption) rates[c.output]! += c.full * den;
      else if (taken > c.fixed) rates[c.output]! += ((taken - c.fixed) * den) / c.perUnit;
    }
    rates[input] = 0n; // everything produced is consumed; the stock stays at 0
  }
  return rates;
}

/** Storage capacity and protected (unlootable) amount of a storage room at level L. */
export function storage(base: bigint, perLevel: bigint, safeDivisor: bigint, level: bigint) {
  const capacity = base + perLevel * level;
  return { capacity, safe: capacity / safeDivisor };
}
