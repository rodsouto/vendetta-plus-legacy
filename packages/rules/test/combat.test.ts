import { describe, expect, it } from "vitest";
import { allTroopStats, resolveBattle, type Side } from "../src/index.js";
import { allResearch, rs, target, type Any } from "./helpers.js";

const side = (army: Record<string, number>, research: number, pct: number): Side => {
  const stats = allTroopStats(rs, allResearch(research));
  return {
    count: rs.troops.map((t) => BigInt(army[t.id] ?? 0)),
    attack: stats.map((s) => s.attack),
    defense: stats.map((s) => s.defense),
    pct: BigInt(pct),
  };
};

const perTroop = (m: Record<string, number>) => rs.troops.map((t) => m[t.id] ?? 0);

describe("combat (target rules)", () => {
  const cases = [...target("combat_target_vendetta"), ...target("combat_target_vendetta_random")];
  it(`matches all ${cases.length} target vectors round by round`, () => {
    const bad: string[] = [];
    for (const c of cases as Any[]) {
      const r = resolveBattle(
        rs,
        side(c.attacker, c.attacker_research_all, c.pct_power_attacker),
        side(c.defender, c.defender_research_all, c.pct_power_defender),
      );
      const exp = c.expected;
      const got = {
        rounds: r.rounds,
        a: r.attackerRemaining.map(Number),
        d: r.defenderRemaining.map(Number),
        ad: r.attackerDeaths.map((x) => x.map(Number)),
        dd: r.defenderDeaths.map((x) => x.map(Number)),
      };
      const want = {
        rounds: exp.rounds_count,
        a: perTroop(exp.attacker_remaining),
        d: perTroop(exp.defender_remaining),
        ad: exp.rounds.map((x: Any) => rs.troops.map((t) => x.troops[t.id]?.attacker_deaths ?? 0)),
        dd: exp.rounds.map((x: Any) => rs.troops.map((t) => x.troops[t.id]?.defender_deaths ?? 0)),
      };
      if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(c.label);
    }
    expect(bad).toEqual([]);
  });
});
