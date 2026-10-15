#!/usr/bin/env python3
"""Validate scripts/combat_reference.py against the legacy PHP and generate target-rule combat vectors.

Steps (any failure aborts without writing):
  1. Legacy mode must reproduce every combat, troop_stats and loot case of
     data/test_vectors.yaml and data/test_vectors_space4k.yaml.
  2. Fuzz: FUZZ_BATTLES random battles per ruleset are run through the real PHP engine
     (scripts/combat_oracle.php) and through legacy mode; every round must match.
  3. Write data/test_vectors_target.yaml: combat cases under the target rules (decisions.md),
     each with the legacy result for comparison.

Usage: python3 scripts/generate_target_vectors.py
"""

from __future__ import annotations

import json
import random
import subprocess
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from combat_reference import Battle, Side, effective_stats, loot_legacy, loot_target, simulate  # noqa: E402

DATA = ROOT / "docs/spec/data"
OUT = DATA / "test_vectors_target.yaml"
RULESETS = {"vendetta": DATA / "test_vectors.yaml", "space4k": DATA / "test_vectors_space4k.yaml"}
FUZZ_BATTLES = 3000
SEED = 20261015
RANDOM_TARGET_BATTLES = 300          # combat_target_<ruleset>_random: wide coverage for the contracts


class Ruleset:
    def __init__(self, name: str):
        self.name = name
        self.data = yaml.safe_load((DATA / f"{name}.yaml").read_text(encoding="utf-8"))
        self.troops = {t["id"]: t for t in self.data["troops"]}
        self.order = [t["id"] for t in self.data["troops"]]          # canonical order
        self.mods = {t["id"]: t["combat_modifiers"] for t in self.data["troops"]}
        self.rules = dict(self.data["rules"], cargo_research=self.data["roles"]["cargo_research"])
        self.research_ids = [r["id"] for r in self.data["research"]]

    def stats(self, troop: str, research_all: int, *, legacy: bool) -> dict:
        levels = dict.fromkeys(self.research_ids, research_all)
        return effective_stats(self.troops[troop], levels, self.rules, legacy=legacy)

    def battle(self, order, attacker: dict, defender: dict, res_a: int, res_d: int, pct_a, pct_d, *, legacy: bool):
        def side(army: dict, res: int) -> dict:
            out = {}
            for t in order:
                if army.get(t, 0) > 0:
                    s = self.stats(t, res, legacy=legacy)
                    out[t] = Side(army[t], s["attack"], s["defense"])
                else:
                    out[t] = Side()
            return out
        return Battle(list(order), side(attacker, res_a), side(defender, res_d), self.mods, pct_a, pct_d)


# --------------------------------------------------------------------------- step 1

def battle_from_case(rs: Ruleset, c: dict) -> Battle:
    order = c["troop_order"]

    def side(key):
        return {t: Side(c["input"][t][key]["count"], c["input"][t][key]["attack"], c["input"][t][key]["defense"])
                for t in order}
    return Battle(order, side("attacker"), side("defender"), rs.mods, c["pct_power_attacker"], c["pct_power_defender"])


def validate_vectors(rs: Ruleset, vectors: dict) -> int:
    errors = 0
    for c in vectors["combat"]["cases"]:
        if simulate(battle_from_case(rs, c), legacy=True) != c["expected"]:
            print(f"  [{rs.name}] combat mismatch: {c['label']}")
            errors += 1
    for c in vectors["troop_stats"]["cases"]:
        for e in c["effective"]:
            got = rs.stats(c["troop"], e["all_research_level"], legacy=True)
            if any(e.get(k) != v for k, v in got.items()):
                print(f"  [{rs.name}] stats mismatch: {c['troop']} @ {e['all_research_level']}: {got}")
                errors += 1
    for c in vectors["loot"]["cases"]:
        if loot_legacy(c["capacity"], c["unprotected"]) != c["loot_legacy"]:
            print(f"  [{rs.name}] loot_legacy mismatch: {c['label']}")
            errors += 1
        if loot_target(c["capacity"], c["unprotected"]) != c["loot_target"]:
            print(f"  [{rs.name}] loot_target mismatch: {c['label']}")
            errors += 1
    return errors


# --------------------------------------------------------------------------- step 2

def random_battles(rs: Ruleset, rng: random.Random, n: int) -> list[tuple[list[str], dict, dict, int, int, int, int]]:
    attackers = [t for t in rs.order if rs.troops[t]["role"] == "attack"]
    out = []
    for _ in range(n):
        att = {t: int(10 ** rng.uniform(0, 5)) for t in rng.sample(attackers, rng.randint(1, 5))}
        dfn = {t: int(10 ** rng.uniform(0, 5)) for t in rng.sample(rs.order, rng.randint(0, 6))}
        # Legacy order: attacker troops in mission order (shuffled here), then defender-only troops.
        order = list(att)
        rng.shuffle(order)
        order += [t for t in rs.order if t in dfn and t not in att]
        pcts = [100, 100, 99, 86, 40, 19, 5, 1]
        out.append((order, att, dfn, rng.randint(0, 15), rng.randint(0, 15), rng.choice(pcts), rng.choice(pcts)))
    return out


def fuzz(rs: Ruleset) -> int:
    rng = random.Random(f"{SEED}-{rs.name}")
    cases = random_battles(rs, rng, FUZZ_BATTLES)
    legacy_id = {t: rs.troops[t]["legacy_id"] for t in rs.order}
    payload, battles = [], []
    for order, att, dfn, ra, rd, pa, pd in cases:
        b = rs.battle(order, att, dfn, ra, rd, pa, pd, legacy=True)
        battles.append(b)
        payload.append({
            "order": [legacy_id[t] for t in order],
            "troops": {legacy_id[t]: {
                "a": {"total": b.attacker[t].total, "ataque": b.attacker[t].attack, "defensa": b.attacker[t].defense},
                "d": {"total": b.defender[t].total, "ataque": b.defender[t].attack, "defensa": b.defender[t].defense},
            } for t in order},
            "pctA": pa, "pctD": pd,
        })
    proc = subprocess.run(["php", str(ROOT / "scripts/combat_oracle.php"), rs.name], input=json.dumps(payload),
                          capture_output=True, text=True, check=True)
    results = json.loads(proc.stdout)
    spec_id = {v: k for k, v in legacy_id.items()}
    errors = 0
    for i, (b, php) in enumerate(zip(battles, results)):
        got = simulate(b, legacy=True)
        exp_rounds = []
        for n, r in sorted(((int(k), v) for k, v in php["data"].items()), key=lambda kv: kv[0]):
            exp_rounds.append({
                "round": n,
                "troops": {spec_id[t]: {"attacker_count": v["a"], "attacker_deaths": v["muertesA"],
                                        "defender_count": v["d"], "defender_deaths": v["muertesD"]}
                           for t, v in r["tropas"].items()},
                "attacker_strikes": [{"attacker": spec_id[a], "target": spec_id[d], "defender_deaths": k}
                                     for a, d, k in r["ataquesA"]],
                "defender_strikes": [{"attacker": spec_id[a], "defender": spec_id[d], "attacker_deaths": k}
                                     for a, d, k in r["ataquesD"]],
                "power_sums": {k: r[k] for k in ("PAA", "PDA", "PAD", "PDD")},
            })
        exp = {
            "rounds_count": len(exp_rounds),
            "attacker_remaining": {spec_id[t]: n for t, n in php["rest_a"].items()},
            "defender_remaining": {spec_id[t]: n for t, n in php["rest_d"].items()},
            "rounds": exp_rounds,
        }
        if got != exp:
            errors += 1
            if errors <= 3:
                print(f"  [{rs.name}] fuzz mismatch #{i}: {json.dumps(payload[i])[:300]}")
    return errors


# --------------------------------------------------------------------------- step 3

def first_divergence(target: dict, legacy: dict) -> str | None:
    """Describe the first strike where the target rules and legacy differ (None if identical)."""
    for rt, rl in zip(target["rounds"], legacy["rounds"]):
        for phase, actor, enemy, deaths in (("attacker_strikes", "attacker", "target", "defender_deaths"),
                                            ("defender_strikes", "defender", "attacker", "attacker_deaths")):
            for st, sl in zip(rt[phase], rl[phase]):
                if st == sl:
                    continue
                where = f"round {rt['round']}, {phase.split('_')[0]} phase"
                if (st[actor], st[enemy]) != (sl[actor], sl[enemy]):
                    return (f"{where}: target rule {st[actor]} -> {st[enemy]}; "
                            f"legacy {sl[actor]} -> {sl[enemy]}")
                return (f"{where}: {st[actor]} vs {st[enemy]} kills {st[deaths]:g} (legacy {sl[deaths]:g}) "
                        f"because effective stats differ")
            if len(rt[phase]) != len(rl[phase]):
                return f"round {rt['round']}: different number of strikes"
        if rt != rl:
            return f"round {rt['round']}: different casualties"
    if len(target["rounds"]) != len(legacy["rounds"]):
        return "different number of rounds"
    return None


def d04_scenarios(rs: Ruleset) -> list[dict]:
    """One scenario per troop whose legacy target (last mod > 1) differs from the D-04 target (highest mod)."""
    out = []
    for x in rs.order:
        role = rs.troops[x]["role"]
        strong = [(y, m) for y, m in rs.mods[x].items() if m > 1
                  and (role == "attack" or rs.troops[y]["role"] == "attack")]
        if len(strong) < 2:
            continue
        strong.sort(key=lambda ym: rs.order.index(ym[0]))
        legacy_pick = strong[-1][0]
        target_pick = max(strong, key=lambda ym: (ym[1], -rs.order.index(ym[0])))[0]
        if legacy_pick == target_pick:
            continue
        mine, theirs = {x: 200}, {y: 100 for y, _ in strong}
        att, dfn = (mine, theirs) if role == "attack" else (theirs, mine)
        mods = ", ".join(f"{y} ×{m}" for y, m in strong)
        out.append({
            "label": f"D-04: {x} ({role}) vs {mods} — target picks {target_pick}, legacy picks {legacy_pick}",
            "decisions": ["D-04"], "attacker": att, "defender": dfn, "research": (5, 5), "pct": (100, 100),
        })
    return out


def custom_scenarios(rs: Ruleset) -> list[dict]:
    o = rs.order
    attack = [t for t in o if rs.troops[t]["role"] == "attack"]
    defense = [t for t in o if rs.troops[t]["role"] == "defense"]
    out = []
    # D-05: a troop whose legacy bonus list has duplicates gets lower stats under the target rule.
    for t in o:
        if any(k.startswith("legacy_") and k.endswith("_research_bonuses") for k in rs.troops[t]):
            out.append({
                "label": f"D-05: {t} counts duplicated research once (research 10)",
                "decisions": ["D-05"], "attacker": {t: 100}, "defender": {defense[-1]: 60},
                "research": (10, 10), "pct": (100, 100),
            })
    out.append({
        "label": "Tie-break: no modifiers, two defender stacks of equal size -> earliest in canonical order",
        "decisions": ["D-04"], "attacker": {attack[0]: 300}, "defender": {defense[2]: 150, defense[1]: 150},
        "research": (0, 0), "pct": (100, 100),
    })
    out.append({
        "label": "Iteration order: mission lists troops in reverse canonical order (legacy iterates mission order)",
        "decisions": ["D-04"], "attacker": {attack[i]: 400 - 60 * n for n, i in enumerate((9, 6, 3, 1))},
        "defender": {defense[0]: 300, defense[1]: 120, attack[2]: 80}, "research": (4, 4), "pct": (100, 100),
        "legacy_mission_order": [attack[i] for i in (9, 6, 3, 1)],
    })
    out.append({
        "label": "Mixed armies with honor penalty on both sides",
        "decisions": ["D-04", "D-05"],
        "attacker": {attack[0]: 3000, attack[3]: 800, attack[10]: 120, attack[12]: 60, attack[15]: 5},
        "defender": {defense[0]: 1500, defense[1]: 400, defense[3]: 80, defense[4]: 20, attack[13]: 15},
        "research": (8, 6), "pct": (72, 94),
    })
    return out


def build_case(rs: Ruleset, sc: dict) -> dict:
    canon = [t for t in rs.order if t in sc["attacker"] or t in sc["defender"]]
    ra, rd = sc["research"]
    pa, pd = sc["pct"]
    target = simulate(rs.battle(canon, sc["attacker"], sc["defender"], ra, rd, pa, pd, legacy=False), legacy=False)
    mission = sc.get("legacy_mission_order", [t for t in canon if t in sc["attacker"]])
    legacy_order = mission + [t for t in canon if t not in sc["attacker"]]
    legacy = simulate(rs.battle(legacy_order, sc["attacker"], sc["defender"], ra, rd, pa, pd, legacy=True),
                      legacy=True)

    def stats_of(army, res):
        return {t: rs.stats(t, res, legacy=False) for t in canon if t in army}

    case = {
        "label": sc["label"],
        "decisions": sc["decisions"],
        "attacker": {t: sc["attacker"][t] for t in canon if t in sc["attacker"]},
        "defender": {t: sc["defender"][t] for t in canon if t in sc["defender"]},
        "attacker_research_all": ra,
        "defender_research_all": rd,
        "pct_power_attacker": pa,
        "pct_power_defender": pd,
        "troop_order": canon,
        "effective_stats": {
            "attacker": {t: {k: s[k] for k in ("attack", "defense")} for t, s in stats_of(sc["attacker"], ra).items()},
            "defender": {t: {k: s[k] for k in ("attack", "defense")} for t, s in stats_of(sc["defender"], rd).items()},
        },
        "expected": target,
        "legacy": {
            "troop_order": legacy_order,
            "rounds_count": legacy["rounds_count"],
            "attacker_remaining": legacy["attacker_remaining"],
            "defender_remaining": legacy["defender_remaining"],
            "first_divergence": first_divergence(target, legacy),
        },
    }
    return case


def random_target_cases(rs: Ruleset) -> list[dict]:
    """Random battles under the target rules, wider than the fuzz set (up to every troop type, research 0-20).

    Compact on purpose: per round only troop counts and deaths (no strikes, no power sums).
    """
    rng = random.Random(f"{SEED}-{rs.name}-target")
    attackers = [t for t in rs.order if rs.troops[t]["role"] == "attack"]
    pcts = [100, 100, 99, 86, 40, 19, 5, 1]
    cases = []
    for i in range(RANDOM_TARGET_BATTLES):
        att = {t: int(10 ** rng.uniform(0, 6)) for t in rng.sample(attackers, rng.randint(1, len(attackers)))}
        dfn = {t: int(10 ** rng.uniform(0, 6)) for t in rng.sample(rs.order, rng.randint(0, len(rs.order)))}
        ra, rd = rng.randint(0, 20), rng.randint(0, 20)
        pa, pd = rng.choice(pcts), rng.choice(pcts)
        canon = [t for t in rs.order if t in att or t in dfn]
        res = simulate(rs.battle(canon, att, dfn, ra, rd, pa, pd, legacy=False), legacy=False)
        cases.append({
            "label": f"random #{i}",
            "attacker": {t: att[t] for t in canon if t in att},
            "defender": {t: dfn[t] for t in canon if t in dfn},
            "attacker_research_all": ra,
            "defender_research_all": rd,
            "pct_power_attacker": pa,
            "pct_power_defender": pd,
            "expected": {
                "rounds_count": res["rounds_count"],
                "attacker_remaining": res["attacker_remaining"],
                "defender_remaining": res["defender_remaining"],
                "rounds": [{"round": r["round"], "troops": r["troops"]} for r in res["rounds"]],
            },
        })
    return cases


def ints(o):
    """Emit integral floats as ints (PHP-style), recursively."""
    if isinstance(o, float) and o.is_integer():
        return int(o)
    if isinstance(o, dict):
        return {k: ints(v) for k, v in o.items()}
    if isinstance(o, list):
        return [ints(v) for v in o]
    return o


def main() -> None:
    doc = {}
    failed = 0
    for name, vec_path in RULESETS.items():
        rs = Ruleset(name)
        vectors = yaml.safe_load(vec_path.read_text(encoding="utf-8"))
        e1 = validate_vectors(rs, vectors)
        e2 = fuzz(rs)
        print(f"[{name}] legacy vectors: {'OK' if not e1 else f'{e1} errors'}; "
              f"fuzz vs PHP ({FUZZ_BATTLES} battles): {'OK' if not e2 else f'{e2} mismatches'}")
        failed += e1 + e2
        cases = [build_case(rs, sc) for sc in d04_scenarios(rs) + custom_scenarios(rs)]
        doc[f"combat_target_{name}"] = {
            "_ruleset": f"data/{name}.yaml",
            "cases": ints(cases),
        }
        print(f"[{name}] target cases: {len(cases)} "
              f"({sum(c['legacy']['first_divergence'] is not None for c in cases)} differ from legacy)")
        doc[f"combat_target_{name}_random"] = {
            "_ruleset": f"data/{name}.yaml",
            "_note": f"{RANDOM_TARGET_BATTLES} random battles (seed {SEED}-{name}-target), canonical order, "
                     "target rules; per round only troop counts and deaths.",
            "cases": ints(random_target_cases(rs)),
        }
    if failed:
        sys.exit("Reference implementation does not match legacy PHP; nothing written.")

    header = f"""# =============================================================================
# TARGET-RULE combat test vectors. GENERATED by scripts/generate_target_vectors.py. DO NOT EDIT.
#
# Expected results under the rules of decisions.md (D-04 target selection, D-05 deduplicated
# research bonuses, canonical troop order), computed by scripts/combat_reference.py (target mode).
#
# The reference implementation is validated before writing this file:
#   - legacy mode reproduces every combat/troop_stats/loot case of test_vectors*.yaml;
#   - legacy mode matches the real PHP engine (scripts/combat_oracle.php) round by round on
#     {FUZZ_BATTLES} random battles per ruleset (seed {SEED}).
#
# Per case: inputs are troop counts + research level (applied to every research) + honor power %.
# effective_stats are derived from data/<ruleset>.yaml under the target rules (informative).
# expected has the same structure as test_vectors.yaml combat[].expected.
# legacy: what the legacy engine does with the same armies (mission in canonical order unless
# stated), and the first point where it diverges from the target rule (null = identical).
# =============================================================================
"""
    OUT.write_text(header + yaml.safe_dump(doc, sort_keys=False, allow_unicode=True, width=120), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
