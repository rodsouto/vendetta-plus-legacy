# Formulas

Central reference for every shared formula, as implemented in legacy PHP. Constants come from
[data/game_config.yaml](data/game_config.yaml); per-entity values from [data/vendetta.yaml](data/vendetta.yaml).
Expected outputs for many inputs are in [data/test_vectors.yaml](data/test_vectors.yaml).
Target-rule differences are in [decisions.md](decisions.md).

## Numeric model

Implementations must reproduce legacy arithmetic exactly, or combat results drift by one unit in edge
cases:

- **Doubles everywhere** for power, ratios and stat multipliers (IEEE-754 binary64). Never use 32-bit
  floats or decimal types for these.
- **Operation order** as written in the formulas (e.g. `((units × stat) × modifier) × pct / 100`).
- **`round(x, n)` = PHP 7.4 `round()`**: first round the value to 15 significant digits, then round half
  away from zero to `n` places. (So `0.285`, stored as `0.28499999999999998`, rounds to `0.29`.)
  The same applies to `number_format(x, 3)` used on loss ratios.
- `floor`/`ceil` as usual; `int` casts truncate toward zero.
- Unit counts, resources and costs are integers.

Reference: `php_round()` in `scripts/combat_reference.py`, checked against the real PHP on 6,000
random battles.

---

## Room (building) upgrade

**Source:** `library/Mob/Habitacion/Abstract.php`

```
cost_r(n → n+1) = base_r × (n+1)²
seconds(n → n+1) = round( ((n+1)² × base_duration / max(1, boss_office_level)) / upgrade_speed_multiplier )
```

- `boss_office_level` is the level of `boss_office` in the **same** building, at the moment the item
  is (re)scheduled (see [queues](#queues)).
- Several levels of the same room can be queued; each queued level uses its own `n`.
- Test vectors: `building_upgrade`.

## Research upgrade

**Source:** `library/Mob/Entrenamiento/Abstract.php`

```
cost_r(n → n+1) = base_r × (n+1)²
seconds(n → n+1) = round( round((n+1)² × base_duration / mob_school_level) / upgrade_speed_multiplier )
```

- Research levels are per player; cost is paid by, and `mob_school_level` read from, the building
  where the research is queued. Legacy does not guard `mob_school_level = 0` (division by zero);
  target requires ≥ 1 ([D-14](decisions.md#d-14--level-0-timing-rooms--new)).
- Test vectors: `research_upgrade`.

## Troop training

**Source:** `library/Mob/Tropa/Abstract.php::getTiempoEntrenamiento`, `application/models/Tropa/Nueva.php`

```
cost_r(batch) = base_r × quantity
seconds(batch) = training_duration / training_room_level × quantity    # not rounded, no speed multiplier
```

- `training_room_level` = `boot_camp` (attack troops) or `security` (defense troops) in the same building.
- Legacy stores finish times as whole-second datetimes, so fractional seconds are truncated.
- Test vectors: `troop_training`.

## Queues

**Source:** `application/models/Construccion.php`, `models/Habitacion/Nueva.php`,
`models/Entrenamiento/Nuevo.php`, `models/Tropa/Nueva.php`, `Controller/Plugin/Update.php::procesarCola`

| Queue | Scope | Max items | Payment |
|-------|-------|-----------|---------|
| Rooms | per building | 6 (including the one in progress) | first item when queued; others when they start |
| Research | per player, all items in **one** building | 6 | first item when queued; others when they start |
| Attack troops | per building (`boot_camp`) | unlimited | whole batch when queued |
| Defense troops | per building (`security`) | unlimited | whole batch when queued |

- Items run sequentially: each starts when the previous finishes.
- A room or research item that cannot be afforded when it starts is **removed** and the player is
  notified; the next item is tried ([D-11](decisions.md#d-11--deferred-payment-for-roomresearch-queues--keep)).
- When an item finishes, the remaining room/research items are re-timed using the timing room's
  current level. Troop queues are re-timed when `boot_camp`/`security` finishes, but legacy does it
  before the level increments ([D-23](decisions.md#d-23--queue-re-timing-on-level-up--fix)).
- Research cannot be queued in building B while research is running in building A.
- **Cancellation:** cancelling the item in progress refunds it and the next item starts now (paying for
  it if deferred). Cancelling a later item refunds nothing for rooms/research (it was not paid yet),
  and refunds in full for troop batches. The queue is then re-timed.
- Legacy has no server-side requirement check when queuing ([D-13](decisions.md#d-13--requirement-validation--new)).

---

## Troop effective stats

**Source:** `library/Mob/Tropa/Abstract.php` (Modificadores branch)

`levels(list)` = sum of the player's levels in the listed research.

```
base_defense_eff = base_defense × rules.troop_defense_multiplier   # ruleset: 10 Vendetta, 1 Space4k (D-03)

attack   = floor((1 + sqrt(levels(attack_research_bonuses))  / 10) × base_attack)
defense  = floor((1 + sqrt(levels(defense_research_bonuses)) / 10) × base_defense_eff)
speed    = round(base_speed    × (1 + sqrt(level(speed_research)) / 10))
capacity = round(base_capacity × (1 + sqrt(level(smuggling))     / 10))
```

- `smuggling` is the research, not the room `smuggle`.
- Defense troops have no speed or capacity (they never move).
- Legacy sums `firearms_training` twice for `tactical_expert` ([D-05](decisions.md#d-05--tactical-expert-duplicate-bonus--fix)).
- Test vectors: `troop_stats`.

---

## Distance

**Source:** `library/Mob/Edificio.php::getDistancia`

Each neighborhood is a 17 × 15 grid of slots; cities and neighborhoods tile the plane.

```
x(city, slot)         = (city − 1) × 17 + col(slot) − 1
    col(slot)         = 17 if slot % 17 == 0 else slot % 17
y(neighborhood, slot) = (neighborhood − 1) × 15 + ceil(slot / 17) − 1

distance = round( sqrt((x₁ − x₂)² + (y₁ − y₂)²) ) × 1000
```

Legacy computes `col` as `(slot/17 − floor(slot/17)) × 17` in floating point. The final `round`
absorbs the imprecision, so integer `slot % 17` is equivalent.

**Quirk:** the x axis uses the **city** and the y axis the **neighborhood**, so neighborhoods of the
same city are stacked vertically and different cities are side by side. Test vectors: `distance_mission`.

## Mission travel time

**Source:** `application/forms/Misiones/Coordenadas.php`

```
duration_seconds = round( ((distance × 3.3479) / v)^0.2 × 3600 )
v = min(effective speed of the troop types sent)        # slowest unit
```

The same duration applies to the return trip.

## Mission salary

```
salary = floor( distance^0.8 × Σ(quantity × salary_per_unit) / 2512 )    # dollars
```

Paid by the origin building when the mission is sent; it also reduces usable cargo
([07-missions.md](07-missions.md#salary-and-cargo)).

---

## Honor (attack power percentage)

**Source:** `library/Mob/Jugador.php::calcPoderAtaque`, `application/configs/honor.php`

`B` = number of buildings the player owns, `h` = player's `honor` research level.

```
if B < 5:    return 100
if B > 100:  return round(100 × table[100][h] / B)       # legacy: h NOT capped here (D-17)
h = min(h, 8)
if B in table:  return table[B][h]                       # rows 5, 10, ..., 100
base = floor(B / 5) × 5
return round(table[base][h] − (table[base][h] − table[base+5][h]) / 5 × (B − base))
```

The table is in [06-combat.md](06-combat.md#honor-table). Note the step from 100 % (4 buildings) to
99 % (5 buildings). Test vectors: `honor`.

---

## Combat loss ratios

**Source:** `library/Mob/Combat/Abstract.php::_getPorcentPerdidas`

Inputs are the four power values of one fight (after modifiers and honor):
`PAA`, `PDA` (attacker attack/defense power), `PAD`, `PDD` (defender attack/defense power).

```
A = PAA + PDA ;  D = PAD + PDD
if D > A × 10:   PPA = 1, PPD = 0          # attacker stack wiped
elif A > D × 10: PPA = 0, PPD = 1          # defender stack wiped
else:
    PPA = D / (D + 2A)
    PPD = A / (A + 2D)
    if A > D:  PPA = PPA × (1 − ((A×100/D) − 100) / 10 / 2 / 100)
    else:      PPD = PPD × (1 − ((D×100/A) − 100) / 10 / 2 / 100)

PPA, PPD = round(PPA, 3), round(PPD, 3)    # number_format(x, 3) (D-15)
attacker_deaths = round(attacker_units × PPA)
defender_deaths = round(defender_units × PPD)
```

The 10× branches take precedence. When `A = D = 0` legacy divides by zero; the target rule gives
`PPA = PPD = 0` ([D-25](decisions.md#d-25--loss-ratios-with-zero-power--new)). No troop in either ruleset
has zero attack *and* zero defense, so this cannot happen with current data.

## Loot

**Source:** `library/Mob/Combat/Manager.php::getRobo`

```
if any defender troop survived: loot = 0
capacity = Σ surviving attacker units × effective capacity
U[r] = lootable[r] of the defender building ; T = Σ U[r]
if T == 0: loot = 0
loot[r] = min( round(U[r] × 100 / T × capacity / 100), U[r] )
```

The sum can exceed capacity by rounding. Target: [D-06](decisions.md#d-06--loot-apportionment--fix).
The salary already paid does **not** reduce loot capacity. Test vectors: `loot`.

---

## Points

See [08-progression.md](08-progression.md).
