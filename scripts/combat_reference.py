#!/usr/bin/env python3
"""Reference implementation of the Vendetta combat rules (Modificadores engine).

Two modes:
  * legacy — reproduces library/Mob/Combat/Modificadores.php bit for bit (validated against
    docs/spec/data/test_vectors*.yaml by scripts/generate_target_vectors.py).
  * target — the rules adopted in docs/spec/decisions.md:
      D-04 target selection by highest modifier, then largest stack, then canonical order;
      D-05 duplicated research bonuses count once;
      canonical troop order for iteration;
      loss ratios defined as 0 when both sides have zero power (legacy divides by zero).

Everything else (rounds, phases, D-15 3-decimal loss ratios, D-16 double fight, wipe rule,
honor scaling, PHP rounding) is identical in both modes.

Numeric model: IEEE-754 double for all power/ratio arithmetic, PHP 7.4 rounding semantics
(`php_round`) wherever the legacy code calls round() or number_format().
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

MAX_ROUNDS = 5
WIPE_RATIO = 10
LOSS_RATIO_DECIMALS = 3


# --------------------------------------------------------------------------- numeric helpers

def php_round(value: float, places: int = 0) -> float:
    """PHP 7.4 round(): half away from zero, after pre-rounding to 15 significant digits.

    The pre-rounding makes values like 0.285 (stored as 0.28499999999999998) round to 0.29, as PHP does.
    """
    if value == 0 or not math.isfinite(value):
        return value
    pre = Decimal(repr(value))
    exp = pre.adjusted() - 14                      # keep 15 significant digits
    pre = pre.quantize(Decimal(1).scaleb(exp), rounding=ROUND_HALF_UP)
    return float(pre.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP))


def effective_stats(troop: dict, research: dict[str, int], rules: dict, *, legacy: bool) -> dict:
    """Effective attack/defense/speed/capacity of one troop type (05-formulas.md#troop-effective-stats).

    `troop` is an entry of data/<ruleset>.yaml; `research` maps research id -> level.
    `rules` is the ruleset `rules` block plus `cargo_research` (from roles).
    """
    def bonuses(key: str) -> list[str]:
        if legacy and f"legacy_{key}" in troop:
            return troop[f"legacy_{key}"]
        return troop[key]

    def lvl(ids: list[str]) -> int:
        return sum(research.get(r, 0) for r in ids)

    base_def = troop["base_defense"] * rules["troop_defense_multiplier"]
    out = {
        "attack": math.floor((1 + math.sqrt(lvl(bonuses("attack_research_bonuses"))) / 10) * troop["base_attack"]),
        "defense": math.floor((1 + math.sqrt(lvl(bonuses("defense_research_bonuses"))) / 10) * base_def),
    }
    if troop["role"] == "attack":
        out["speed"] = int(php_round(troop["base_speed"] * (1 + math.sqrt(research.get(troop["speed_research"], 0)) / 10)))
        out["capacity"] = int(php_round(troop["base_capacity"]
                                        * (1 + math.sqrt(research.get(rules["cargo_research"], 0)) / 10)))
    return out


def loss_ratios(paa: float, pda: float, pad: float, pdd: float, *, legacy: bool) -> tuple[float, float]:
    """(PPA, PPD) before the 3-decimal rounding — 05-formulas.md#combat-loss-ratios."""
    a, d = paa + pda, pad + pdd
    if d > a * WIPE_RATIO:
        return 1.0, 0.0
    if a > d * WIPE_RATIO:
        return 0.0, 1.0
    if a == 0 and d == 0:
        if legacy:
            raise ZeroDivisionError("legacy loss ratio with zero power on both sides")
        return 0.0, 0.0
    ppa = d / (d + a * 2)
    ppd = a / (a + d * 2)
    if a > d:
        k_at, k_def = ((a * 100 / d) - 100) / 10, 0.0
    else:
        k_at, k_def = 0.0, ((d * 100 / a) - 100) / 10
    k_at /= 2
    k_def /= 2
    return ppa - ppa * k_at / 100, ppd - ppd * k_def / 100


# --------------------------------------------------------------------------- battle

@dataclass
class Side:
    total: float = 0
    attack: float = 0
    defense: float = 0


@dataclass
class Battle:
    """Battle input. `order` is the iteration order of troop types."""
    order: list[str]
    attacker: dict[str, Side]
    defender: dict[str, Side]
    modifiers: dict[str, dict[str, float]]          # modifiers[X][Y]
    pct_attacker: float = 100
    pct_defender: float = 100
    rounds: list[dict] = field(default_factory=list)

    def side(self, who: str) -> dict[str, Side]:
        return self.attacker if who == "a" else self.defender

    def mod(self, x: str, y: str) -> float:
        return self.modifiers.get(x, {}).get(y, 1)


def get_rival(b: Battle, troop: str, enemy_side: str, *, legacy: bool) -> str | None:
    enemies = b.side(enemy_side)
    alive = [t for t in b.order if php_round(enemies[t].total) > 0]
    if not alive:
        return None
    if legacy:
        # Mob_Combat_Modificadores::_getRival: LAST enemy with modifier > 1, else largest stack (first on ties).
        best_mod, biggest, biggest_total = None, None, 0
        for t in alive:
            if b.mod(troop, t) > 1:
                best_mod = t
            if enemies[t].total > biggest_total:
                biggest, biggest_total = t, enemies[t].total
        return best_mod if best_mod is not None else biggest
    # D-04: highest modifier > 1, then most units, then canonical order (alive is in canonical order).
    strong = [t for t in alive if b.mod(troop, t) > 1]
    pool = strong or alive
    return max(pool, key=lambda t: (b.mod(troop, t) if strong else 0, enemies[t].total, -alive.index(t)))


def fight(b: Battle, x: str, y: str, *, legacy: bool) -> dict:
    """Attacker stack x vs defender stack y (06-combat.md#fight)."""
    ax, dy = b.attacker[x], b.defender[y]
    mod_at, mod_def = b.mod(x, y), b.mod(y, x)
    # Same operation order as legacy (_getPower then _fightMod): ((units * stat) * mod) * pct / 100.
    paa = (ax.total * ax.attack) * mod_at * b.pct_attacker / 100
    pda = (ax.total * ax.defense) * mod_at * b.pct_attacker / 100
    pad = (dy.total * dy.attack) * mod_def * b.pct_defender / 100
    pdd = (dy.total * dy.defense) * mod_def * b.pct_defender / 100
    ppa, ppd = loss_ratios(paa, pda, pad, pdd, legacy=legacy)
    ppa = php_round(ppa, LOSS_RATIO_DECIMALS)
    ppd = php_round(ppd, LOSS_RATIO_DECIMALS)
    return {
        "a": php_round(ax.total * ppa),
        "d": php_round(dy.total * ppd),
        "PAA": paa, "PDA": pda, "PAD": pad, "PDD": pdd,
    }


def simulate(b: Battle, *, legacy: bool) -> dict:
    """Run the battle; returns the same structure as test_vectors combat[].expected."""
    rounds: list[dict] = []
    has_a = has_d = True
    rnd = 1
    while rnd <= MAX_ROUNDS and has_a and has_d:
        rd = {"round": rnd, "troops": {}, "attacker_strikes": [], "defender_strikes": []}
        has_a = has_d = False
        for t in b.order:
            if php_round(b.attacker[t].total) == 0 and php_round(b.defender[t].total) == 0:
                continue
            rd["troops"][t] = {"attacker_count": b.attacker[t].total, "attacker_deaths": 0,
                               "defender_count": b.defender[t].total, "defender_deaths": 0}
        sums = {"PAA": 0.0, "PDA": 0.0, "PAD": 0.0, "PDD": 0.0}

        # Attacker phase
        for t in b.order:
            if php_round(b.attacker[t].total) == 0:
                continue
            enemy = get_rival(b, t, "d", legacy=legacy)
            if enemy is None:
                break
            m = fight(b, t, enemy, legacy=legacy)
            for k in sums:
                sums[k] += m[k]
            rd["troops"][t]["attacker_deaths"] += m["a"]
            rd["troops"][enemy]["defender_deaths"] += m["d"]
            rd["attacker_strikes"].append({"attacker": t, "target": enemy, "defender_deaths": m["d"]})
            b.attacker[t].total -= m["a"]
            b.defender[enemy].total -= m["d"]
            has_a = has_a or php_round(b.attacker[t].total) > 0
            has_d = has_d or php_round(b.defender[enemy].total) > 0

        # Defender phase
        for t in b.order:
            if php_round(b.defender[t].total) == 0:
                continue
            enemy = get_rival(b, t, "a", legacy=legacy)
            if enemy is None:
                break
            m = fight(b, enemy, t, legacy=legacy)
            for k in sums:
                sums[k] += m[k]
            rd["troops"][enemy]["attacker_deaths"] += m["a"]
            rd["troops"][t]["defender_deaths"] += m["d"]
            rd["defender_strikes"].append({"attacker": enemy, "defender": t, "attacker_deaths": m["a"]})
            b.attacker[enemy].total -= m["a"]
            b.defender[t].total -= m["d"]
            has_a = has_a or php_round(b.attacker[enemy].total) > 0
            has_d = has_d or php_round(b.defender[t].total) > 0

        rd["power_sums"] = {k: php_round(v) for k, v in sums.items()}
        rounds.append(rd)
        rnd += 1

    # A trailing round with no fights at all is dropped from the report.
    if len(rounds) != 1 and not rounds[-1]["attacker_strikes"] and not rounds[-1]["defender_strikes"]:
        rounds.pop()

    return {
        "rounds_count": len(rounds),
        "attacker_remaining": {t: int(b.attacker[t].total) for t in b.order if int(b.attacker[t].total) > 0},
        "defender_remaining": {t: int(b.defender[t].total) for t in b.order if int(b.defender[t].total) > 0},
        "rounds": rounds,
    }


# --------------------------------------------------------------------------- loot

def loot_target(capacity: int, unprotected: dict[str, int]) -> dict[str, int]:
    """D-06: largest-remainder apportionment, never exceeding capacity.

    `unprotected` must be ordered by the tie-break order (weapons, ammunition, dollar, alcohol).
    """
    order = list(unprotected)
    loot = dict.fromkeys(order, 0)
    rem = dict(unprotected)
    cap = capacity
    while cap > 0:
        active = [r for r in order if rem[r] > 0]
        if not active:
            break
        total = sum(rem[r] for r in active)
        if cap >= total:
            for r in active:
                loot[r] += rem[r]
                rem[r] = 0
            break
        share = {r: cap * rem[r] // total for r in active}
        frac = {r: cap * rem[r] % total for r in active}
        left = cap - sum(share.values())
        ranked = sorted(active, key=lambda r: (-frac[r], order.index(r)))
        for i in range(left):
            share[ranked[i % len(ranked)]] += 1
        new_cap = 0
        for r in active:
            take = min(share[r], rem[r])
            new_cap += share[r] - take
            loot[r] += take
            rem[r] -= take
        if new_cap == cap:
            break
        cap = new_cap
    return loot


def loot_legacy(capacity: int, unprotected: dict[str, int]) -> dict[str, int]:
    """Mob_Combat_Manager::getRobo as it actually behaves (the redistribution code is dead)."""
    total = sum(unprotected.values())
    if total == 0:
        return dict.fromkeys(unprotected, 0)
    out = {}
    for r, u in unprotected.items():
        pct = u * 100 / total
        out[r] = int(min(php_round(pct * capacity / 100), u))
    return out
