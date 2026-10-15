import { describe, expect, it } from "vitest";
import {
  distance,
  honorPct,
  missionSalary,
  parseCoord,
  researchUpgrade,
  roomUpgrade,
  storage,
  travelSeconds,
  troopStats,
  troopTraining,
  apportionLoot,
} from "../src/index.js";
import {
  allResearch,
  building,
  costsOf,
  legacy,
  research,
  rs,
  target,
  troop,
  type Any,
} from "./helpers.js";

describe("building_upgrade", () => {
  it.each(legacy("building_upgrade"))(
    "$building $from_level→$to_level (boss $boss_office_level)",
    (c: Any) => {
      const u = roomUpgrade(
        rs,
        building(c.building),
        BigInt(c.from_level),
        BigInt(c.boss_office_level),
      );
      expect(costsOf(u.cost)).toEqual(c.cost);
      expect(Number(u.seconds)).toBe(c.time_seconds);
    },
  );
});

describe("research_upgrade", () => {
  it.each(legacy("research_upgrade"))(
    "$research $from_level→$to_level (school $mob_school_level)",
    (c: Any) => {
      const u = researchUpgrade(
        rs,
        research(c.research),
        BigInt(c.from_level),
        BigInt(c.mob_school_level),
      );
      expect(costsOf(u.cost)).toEqual(c.cost);
      expect(Number(u.seconds)).toBe(c.time_seconds);
    },
  );
});

describe("troop_training", () => {
  it.each(legacy("troop_training"))(
    "$troop ×$quantity (room $training_building_level)",
    (c: Any) => {
      const u = troopTraining(
        troop(c.troop),
        BigInt(c.quantity),
        BigInt(c.training_building_level),
      );
      expect(costsOf(u.cost)).toEqual(c.cost);
      expect(Number(u.seconds)).toBe(Math.floor(c.batch_time_seconds));
    },
  );
});

describe("troop_stats", () => {
  // tactical_expert: legacy counts firearms_training twice; the target rule (D-05) is checked below.
  const cases = legacy("troop_stats").filter((c: Any) => c.troop !== "tactical_expert");
  it.each(cases)("$troop", (c: Any) => {
    for (const e of c.effective) {
      const s = troopStats(rs, troop(c.troop), allResearch(e.all_research_level));
      expect(Number(s.attack)).toBe(e.attack);
      expect(Number(s.defense)).toBe(e.defense);
      if (e.speed !== null) expect(Number(s.speed)).toBe(e.speed);
      if (e.capacity !== null) expect(Number(s.capacity)).toBe(e.capacity);
    }
  });

  it("D-05 target stats from the target combat vectors", () => {
    let checked = 0;
    for (const c of target("combat_target_vendetta")) {
      for (const [side, level] of [
        ["attacker", c.attacker_research_all],
        ["defender", c.defender_research_all],
      ]) {
        for (const [id, s] of Object.entries(c.effective_stats[side] as Record<string, Any>)) {
          const got = troopStats(rs, troop(id), allResearch(level));
          expect([Number(got.attack), Number(got.defense)]).toEqual([s.attack, s.defense]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("storage", () => {
  it.each(legacy("storage"))("$building L$level", (c: Any) => {
    const s = building(c.building).storage!;
    const got = storage(s.base, s.perLevel, s.safeDivisor, BigInt(c.level));
    expect([Number(got.capacity), Number(got.safe)]).toEqual([c.capacity, c.safe_amount]);
  });
});

describe("honor", () => {
  it.each(legacy("honor"))("$total_buildings buildings, honor $honor_level", (c: Any) => {
    expect(Number(honorPct(rs, BigInt(c.total_buildings), c.honor_level))).toBe(c.attack_power_pct);
  });
  it("D-17 caps honor before every branch", () => {
    expect(honorPct(rs, 150n, 12)).toBe(honorPct(rs, 150n, 8));
  });
});

describe("distance_mission", () => {
  it.each(legacy("distance_mission"))("$label", (c: Any) => {
    const d = distance(rs, parseCoord(c.from), parseCoord(c.to));
    expect(Number(d)).toBe(c.distance);
    for (const x of c.duration)
      expect(Number(travelSeconds(rs, d, BigInt(x.vmax)))).toBe(x.duration_seconds);
    for (const x of c.salary)
      expect(Number(missionSalary(rs, d, BigInt(x.total_salary)))).toBe(x.mission_salary);
  });

  it("distance_mission_random", () => {
    const bad: string[] = [];
    for (const c of legacy("distance_mission_random")) {
      const d = distance(rs, parseCoord(c.from), parseCoord(c.to));
      const got = [
        Number(d),
        Number(travelSeconds(rs, d, BigInt(c.vmax))),
        Number(missionSalary(rs, d, BigInt(c.total_salary))),
      ];
      const exp = [c.distance, c.duration_seconds, c.mission_salary];
      if (got.join() !== exp.join())
        bad.push(`${c.from}→${c.to} v=${c.vmax} s=${c.total_salary}: got ${got} expected ${exp}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("loot (D-06 target)", () => {
  it.each(legacy("loot"))("$label", (c: Any) => {
    const order = rs.lootOrder;
    const got = apportionLoot(
      BigInt(c.capacity),
      order.map((r) => BigInt(c.unprotected[r])),
    );
    expect(got.map(Number)).toEqual(order.map((r) => c.loot_target[r]));
  });
});
