// Normalizes test vectors into index-based arrays for Foundry (troops by ruleset order). Object keys
// are snake_case and listed alphabetically: forge's parseJson decodes objects into structs by sorted
// key, so the Solidity structs declare their fields in the same order. Do not edit the output.

type Army = Record<string, number>;

interface TroopRound {
  attacker_deaths: number;
  defender_deaths: number;
}

interface CombatCase {
  label: string;
  attacker: Army;
  defender: Army;
  attacker_research_all: number;
  defender_research_all: number;
  pct_power_attacker: number;
  pct_power_defender: number;
  effective_stats?: Record<
    "attacker" | "defender",
    Record<string, { attack: number; defense: number }>
  >;
  expected: {
    rounds_count: number;
    attacker_remaining: Army;
    defender_remaining: Army;
    rounds: { troops: Record<string, TroopRound> }[];
  };
}

interface TroopStatsCase {
  troop: string;
  effective: {
    all_research_level: number;
    attack: number;
    defense: number;
    speed: number | null;
    capacity: number | null;
  }[];
}

interface LootCase {
  label: string;
  capacity: number;
  unprotected: Record<string, number>;
  loot_target: Record<string, number>;
}

interface HonorCase {
  total_buildings: number;
  honor_level: number;
  attack_power_pct: number;
}

/// Loot apportionment tie-break order (D-06).
const LOOT_ORDER = ["weapons", "ammunition", "dollar", "alcohol"];

export function combatFixtures(troops: string[], cases: CombatCase[]) {
  const vec = (army: Army) => {
    for (const t of Object.keys(army))
      if (!troops.includes(t)) throw new Error(`unknown troop ${t}`);
    return troops.map((t) => army[t] ?? 0);
  };
  const deaths = (c: CombatCase, side: "attacker_deaths" | "defender_deaths") =>
    c.expected.rounds.map((r) => troops.map((t) => r.troops[t]?.[side] ?? 0));
  return {
    cases: cases.map((c) => ({
      attacker: vec(c.attacker),
      attacker_deaths: deaths(c, "attacker_deaths"),
      attacker_remaining: vec(c.expected.attacker_remaining),
      defender: vec(c.defender),
      defender_deaths: deaths(c, "defender_deaths"),
      defender_remaining: vec(c.expected.defender_remaining),
      label: c.label,
      pct_a: c.pct_power_attacker,
      pct_d: c.pct_power_defender,
      research_a: c.attacker_research_all,
      research_d: c.defender_research_all,
      rounds: c.expected.rounds_count,
    })),
  };
}

/// Legacy troop_stats, except troops whose legacy bonus list has duplicates (D-05): those come from
/// the target vectors' effective_stats instead.
export function troopStatsFixtures(
  troops: { id: string; role: string; legacy_attack_research_bonuses?: string[] }[],
  legacyCases: TroopStatsCase[],
  targetCases: CombatCase[],
) {
  const index = new Map(troops.map((t, i) => [t.id, i]));
  const d05 = new Set(troops.filter((t) => t.legacy_attack_research_bonuses).map((t) => t.id));
  const out: object[] = [];
  for (const c of legacyCases) {
    if (d05.has(c.troop)) continue;
    for (const e of c.effective) {
      out.push({
        attack: e.attack,
        capacity: e.capacity ?? 0,
        defense: e.defense,
        level: e.all_research_level,
        speed: e.speed ?? 0,
        troop: index.get(c.troop)!,
        with_mobility: e.speed !== null,
      });
    }
  }
  for (const c of targetCases) {
    for (const [side, level] of [
      ["attacker", c.attacker_research_all],
      ["defender", c.defender_research_all],
    ] as const) {
      for (const [t, s] of Object.entries(c.effective_stats?.[side] ?? {})) {
        if (!d05.has(t)) continue;
        out.push({
          attack: s.attack,
          capacity: 0,
          defense: s.defense,
          level,
          speed: 0,
          troop: index.get(t)!,
          with_mobility: false,
        });
      }
    }
  }
  if (!out.some((o) => d05.has(troops[(o as { troop: number }).troop]!.id)) && d05.size > 0)
    throw new Error("no target stats found for D-05 troops");
  return { cases: out };
}

export function lootFixtures(cases: LootCase[]) {
  return {
    cases: cases.map((c) => ({
      capacity: c.capacity,
      label: c.label,
      loot: LOOT_ORDER.map((r) => c.loot_target[r]!),
      unprotected: LOOT_ORDER.map((r) => c.unprotected[r]!),
    })),
  };
}

export function honorFixtures(cases: HonorCase[]) {
  return {
    cases: cases.map((c) => ({
      buildings: c.total_buildings,
      honor: c.honor_level,
      pct: c.attack_power_pct,
    })),
  };
}
