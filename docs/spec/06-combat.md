# Combat

Combat happens when an **attack** mission arrives at a building owned by another player. The engine
is **Modificadores** (legacy server `s1`); the older Mercenarios engine is documented only in
[appendix/mercenarios-engine.md](appendix/mercenarios-engine.md) ([D-02](decisions.md#d-02--combat-engine)).

**Sources:** `library/Mob/Combat/Manager.php`, `Combat/Abstract.php`, `Combat/Modificadores.php`.

**Reference implementation:** `scripts/combat_reference.py` implements this chapter with a `legacy` mode
and a `target` mode (the decisions below). Legacy mode is validated to reproduce the PHP engine exactly:
every case of [data/test_vectors.yaml](data/test_vectors.yaml) and
[data/test_vectors_space4k.yaml](data/test_vectors_space4k.yaml), plus 3,000 random battles per ruleset
compared round by round against the real PHP (`scripts/combat_oracle.php`).

**Expected results:**
- Legacy rules: the `combat` sections of the legacy vector files.
- Target rules: [data/test_vectors_target.yaml](data/test_vectors_target.yaml). It covers each D-04
  targeting difference that exists in the data, D-05, tie-breaks, iteration order and a mixed battle,
  each with the legacy outcome for comparison. **A new implementation must match this file.**

## Participants

- **Attacker:** the troops in the mission, with stats computed from the **attacker's** research.
- **Defender:** **every troop present in the target building** — defense troops *and* attack troops
  that are at home (troops away on missions do not fight). Stats use the **defender's** research.
- Troops of other players stationed there do not exist: stationing is only allowed in your own
  buildings, and stationed troops merge into that building's troops.

## Battle state

For each troop type `t`, per side `s ∈ {a, d}`: `units[t][s]`, `attack[t][s]`, `defense[t][s]`
(effective stats, [05-formulas.md](05-formulas.md#troop-effective-stats)). Unit counts are integers.

**Iteration order** (matters for targeting and casualty order): attacker troop types in the order of
the mission's troop list, then defender-only types in canonical order (`Mob_Data`). Target:
canonical troop order for everything ([D-04](decisions.md#d-04--target-selection--fix)).

`pctA`, `pctD` = honor power percentage of attacker and defender ([honor](#honor)).

## Rounds

Up to **5 rounds**. The battle stops early after a round in which one side has no units left.

Each round:

1. **Attacker phase.** For each troop type `X` (iteration order) with attacker units > 0: choose a
   target `Y` among defender types with units > 0 ([targeting](#targeting)); if none, end the phase.
   Run a **fight** between attacker stack `X` and defender stack `Y`.
2. **Defender phase.** For each troop type `Y` with defender units > 0: choose a target `X` among
   attacker types with units > 0; if none, end the phase. Run a **fight** between attacker stack `X`
   and defender stack `Y`.

Casualties apply **immediately** after each fight, so later fights in the same round see the reduced
stacks. The same pairing can fight in both phases ([D-16](decisions.md#d-16--double-fight-per-round--keep)).

If the last recorded round had no fights at all, it is dropped from the report.

**Continuation flags (exact legacy rule):** at the start of each round both flags are false. After each
fight, the attacker flag becomes true if the attacking stack still has units, and the defender flag
becomes true if the defending stack does. The next round runs only if both flags are true. A stack that
was set to true and then killed later in the same round can cause one extra round with no fights; that
round is the one dropped above. The outcome equals "continue while both sides have units".

### Fight

```
modX = modifier[X][Y]   # X's multiplier vs Y, default 1 (appendix/modifier-matrix.md)
modY = modifier[Y][X]

PAA = units[X][a] × attack[X][a]  × modX × pctA / 100
PDA = units[X][a] × defense[X][a] × modX × pctA / 100
PAD = units[Y][d] × attack[Y][d]  × modY × pctD / 100
PDD = units[Y][d] × defense[Y][d] × modY × pctD / 100

(PPA, PPD) = loss_ratios(PAA, PDA, PAD, PDD)        # 05-formulas.md#combat-loss-ratios
units[X][a] −= round(units[X][a] × PPA)
units[Y][d] −= round(units[Y][d] × PPD)
```

Both stacks take losses in every fight, whichever phase started it.

### Targeting

**Legacy** (`_getRival`): scanning enemy types in iteration order, remember the **last** one whose
modifier (acting troop vs enemy) is > 1; if there is one, target it. Otherwise target the enemy type
with the most units (first one on ties).

**Target rule:** highest modifier > 1, then most units, then canonical order
([D-04](decisions.md#d-04--target-selection--fix)).

## Aftermath

1. The defender building's troops are set to the survivors.
2. Both players lose **troop points** equal to the points of their destroyed units.
3. **Loot** is computed only if the defender has **no surviving troops** (including the case where it
   had none). See [05-formulas.md](05-formulas.md#loot) and [D-06](decisions.md#d-06--loot-apportionment--fix).
   The loot is removed from the defender immediately.
4. A battle record is saved with the result (see [report](#battle-report)).
5. If the two players' families are at war, both sides' lost points are added to the war score
   ([09-social.md](09-social.md#wars)).
6. Surviving attacker troops start the return trip carrying the loot
   ([07-missions.md](07-missions.md#mission-lifecycle)). If no attacker unit survived, no return
   mission is created (a mission with 0 units is never inserted).

## Battle report

Stored in `mob_batallas` (`resultado` JSON) and visible to both participants.

| Field | Content |
|-------|---------|
| `coord_atacante`, `coord_defensor` | Origin and target coordinates |
| `batalla` | Per round: units and deaths per troop type and side, list of fights `[X, Y, deaths]` per phase, and total `PAA`/`PDA`/`PAD`/`PDD` |
| `trp_atacante`, `trp_defensor` | Units at start |
| `trp_rest_atacante`, `trp_rest_defensor` | Survivors |
| `robo` | Loot per resource |
| `habitaciones_defensor` | Defender's room levels (always stored) |
| `recursos_disponibles` | Defender's resources after the loot (always stored) |
| `pts_*`, `pts_perd_*` | Total and lost troop points per side |

### Espionage

There is **no spy mission**. Espionage is a side effect of an attack: the report shows the
defender's **room levels** and **remaining resources** only if at least one **`spy`** survived the
battle and the attacker did not lose all its troop points (`GetBatalla.php`). Spies fight like any other troop
(`espionage` research boosts their attack/defense). A common tactic is sending spies alone.

## Honor

Honor penalizes players who own many buildings. `pct = calcPoderAtaque(buildings, honor_level)`
([05-formulas.md](05-formulas.md#honor-attack-power-percentage)) scales **all** power of that player
(attack and defense), whether attacking or defending.

### Honor table

`application/configs/honor.php` — percentage of power by buildings owned (rows) and honor level (columns).

| Buildings | Honor 0 | Honor 1 | Honor 2 | Honor 3 | Honor 4 | Honor 5 | Honor 6 | Honor 7 | Honor 8 |
|-----------|---------|---------|---------|---------|---------|---------|---------|---------|---------|
| 5 | 99 | 99 | 99 | 99 | 99 | 99 | 99 | 99 | 99 |
| 10 | 99 | 99 | 99 | 99 | 99 | 99 | 99 | 99 | 99 |
| 15 | 98 | 98 | 99 | 99 | 99 | 99 | 99 | 99 | 99 |
| 20 | 94 | 95 | 96 | 97 | 98 | 98 | 99 | 99 | 99 |
| 25 | 86 | 89 | 92 | 94 | 95 | 96 | 97 | 98 | 98 |
| 30 | 72 | 78 | 83 | 87 | 90 | 93 | 95 | 96 | 97 |
| 35 | 56 | 64 | 72 | 78 | 84 | 88 | 91 | 93 | 95 |
| 40 | 40 | 49 | 59 | 67 | 74 | 81 | 86 | 89 | 92 |
| 45 | 28 | 36 | 46 | 55 | 64 | 72 | 79 | 85 | 89 |
| 50 | 19 | 26 | 35 | 44 | 54 | 63 | 71 | 79 | 84 |
| 55 | 13 | 19 | 26 | 34 | 44 | 54 | 63 | 72 | 79 |
| 60 | 9 | 13 | 19 | 26 | 35 | 45 | 55 | 65 | 73 |
| 65 | 6 | 10 | 14 | 20 | 28 | 37 | 47 | 57 | 67 |
| 70 | 5 | 7 | 11 | 15 | 22 | 30 | 40 | 50 | 61 |
| 75 | 3 | 5 | 8 | 12 | 17 | 25 | 33 | 44 | 54 |
| 80 | 2 | 4 | 6 | 9 | 14 | 20 | 28 | 38 | 48 |
| 85 | 2 | 3 | 5 | 7 | 11 | 16 | 23 | 32 | 43 |
| 90 | 1 | 2 | 3 | 6 | 9 | 13 | 19 | 28 | 37 |
| 95 | 1 | 2 | 3 | 4 | 7 | 11 | 16 | 24 | 33 |
| 100 | 1 | 1 | 2 | 3 | 6 | 9 | 14 | 20 | 29 |

Between rows: linear interpolation (rounded). Below 5 buildings: 100. Above 100: `round(100 × table[100][h] / B)`.

## Spring Gun & Hidden Mines

The rooms `spring_gun` and `hidden_mines` have **no effect on combat** in legacy; they only give
points ([D-09](decisions.md#d-09--spring-gun--hidden-mines--keep)).
