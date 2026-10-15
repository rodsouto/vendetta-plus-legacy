# Resources

Vendetta has **four resources**. Stocks belong to each **map building** (not to the player): every
building produces, stores and spends its own resources.

| Spec ID | Legacy column | Produced by | Used for |
|---------|---------------|-------------|----------|
| `weapons` | `recursos_arm` | `weapons_armoury` | Room/research upgrades, troops |
| `ammunition` | `recursos_mun` | `ammunition_depot` | Room/research upgrades, troops |
| `alcohol` | `recursos_alc` | `brewery` | Converted into dollars by `bar` and `smuggle` |
| `dollar` | `recursos_dol` | `bar`, `smuggle` | Upgrades, troops, mission salaries |

No entity costs alcohol. Alcohol can be transported and looted like any other resource.

## Production rates (per hour)

`L` = room level in that building. Parameters are in [data/vendetta.yaml](data/vendetta.yaml)
(`production`).

| Room | Rate |
|------|------|
| `weapons_armoury` | `10` if L = 0, else `10 + round(10 × ((L+1)/2)²)` |
| `ammunition_depot` | `10` if L = 0, else `10 + round(10 × ((L+1)/2)²)` |
| `brewery` | `10` if L = 0, else `10 + round(50 × ((L+1)/2)²)` |
| `bar` | dollars `Rb = round(2 × ((L+1)/2)²)`, consuming `Cb = Rb × 7 + 3` alcohol (0 and 0 at L = 0) |
| `smuggle` | dollars `Rs = round(21 × ((L+1)/2)²)`, consuming `Cs = Rs × 4 + 1` alcohol (0 and 0 at L = 0) |

There is no base dollar production: a building with no Bar/Smuggle produces no dollars.

## Alcohol → dollar

### Legacy algorithm

**Source:** `library/Mob/Habitacion/Manager.php::getProduccion`, evaluated on every resource update.
All values are per hour.

```
prodAlc = brewery_rate
cant    = brewery_rate + alcohol_stock     # stock counts only if non-empty
dollars = 0

# Bar first
if cant > Cb:
    dollars += Rb ; prodAlc -= Cb ; cant -= Cb
else:
    dollars += (cant == 0) ? 0 : (cant - 3) / 7    # can be fractional or NEGATIVE (cant 1..2)
    prodAlc = 0 ; cant = 0                         # stock is NOT consumed

# Smuggle second
if cant > Cs:
    dollars += Rs ; prodAlc -= Cs ; cant -= Cs
else:
    dollars += (prodAlc == 0) ? 0 : (prodAlc - 1) / 4   # BUG: uses prodAlc, not cant
    prodAlc = 0 ; cant = 0

return weapons_rate, ammunition_rate, alcohol = prodAlc (may be negative), dollar = dollars
```

A negative alcohol rate drains the stock; the stock is clamped at 0 after each update.

**Target rule:** continuous flow model, see [decisions.md D-07](decisions.md#d-07--alcohol--dollar-economy--fix).

## Applying production over time

### Legacy

**Source:** `library/Mob/Controller/Plugin/Update.php::updateRecursos`

```
Δt = now − last_update        # seconds
gained[r] = ceil(rate[r] / 3600 × Δt)    # per resource; ceil of a negative rounds toward 0
stock[r] = min(stock[r] + gained[r], capacity[r])
alcohol = max(alcohol, 0)
last_update = now
```

Because of `ceil`, the more often a building is updated, the more it produces (up to +1 unit per
update per resource).

**Target rule:** exact accumulation, see [D-12](decisions.md#d-12--resource-accumulation--fix), within the
event model of [D-08](decisions.md#d-08--time-model--new).

## Storage capacity and protection

Each resource has one storage room. Its level `L` sets both a **hard cap** and a **protected amount**.

| Resource | Storage room |
|----------|--------------|
| `weapons` | `weapon_storage` |
| `ammunition` | `ammunition_storage` |
| `dollar` | `safe_room` |
| `alcohol` | `alcohol_storage` |

```
capacity(L) = 10,000 + 150,000 × L        # also applies at L = 0
safe(L)     = capacity(L) / 10            # cannot be looted
lootable[r] = max(stock[r] − safe(L_r), 0)
```

**Hard cap:** every addition to a stock (production, transport delivery, troops returning with loot,
market delivery) is clamped to `capacity` (`models/Edificio.php::sumarRecursos`, `LEAST(...)`). The
excess is lost ([D-10](decisions.md#d-10--storage-overflow--keep)). The only exception is a new
building's starting resources, which are inserted directly (10,000 each exactly fills a level-0 storage).

## Spending

- **Room / research upgrade**, cost of resource `r` to go from level `n` to `n+1`: `base_r × (n+1)²`.
- **Troop batch**: `base_r × quantity`.
- **Mission salary**: dollars, paid by the origin building when the mission is sent
  ([07-missions.md](07-missions.md#salary-and-cargo)).

A building can only spend what it holds. Costs are checked against that building's stock only.
