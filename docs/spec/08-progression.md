# Progression & Ranking

## Points

Per-entity values are in [data/vendetta.yaml](data/vendetta.yaml) (`points_per_level`,
`points_per_unit`).

| Pool | Legacy column | Definition |
|------|---------------|------------|
| Building points | `puntos_edificios` | Σ over owned buildings, Σ over rooms: `points_per_level × level` |
| Research points | `puntos_entrenamientos` | Σ over research: `points_per_level × level` |
| Troop points | `puntos_tropas` | Σ `points_per_unit × units`, counting troops at home **and on missions** |

`total_points = building + research + troop points`. Each map building also stores its own building
points (used by the neighborhood ranking).

### Legacy bookkeeping

Points are maintained **incrementally**: added when a room level, research level or troop batch
completes, and troop points are subtracted for units killed in combat (both sides). A full recompute
(`Update.php::actualizarPuntos`) runs when a player's first building is created and on demand.
Units lost in other ways (e.g. the consumed `occupation_troop`, troops lost returning to a lost
building) are not subtracted until a recompute.

**Target:** points are a pure function of the state (the definition above), so they cannot drift
([D-24](decisions.md#d-24--points-derived-from-state--fix)).

## Ranking

Players are ranked by `total_points` (`Mob_View_Helper_GetRankingJugadores`). Legacy also offers
rankings by number of buildings, by family (sum and average of members' points; average only for
families with more than 2 members) and by neighborhood (sum of building points per
`city:neighborhood`).

## Empire size

`buildings` = number of map buildings the player owns. It drives the honor penalty
([06-combat.md](06-combat.md#honor)). There is no cap on the number of buildings.

## Account lifecycle

- **First building:** after registering, the player picks a random free coordinate or a specific
  free coordinate and gets the starting state from [game_config.yaml](data/game_config.yaml)
  (`new_player`: `boss_office` 1, 10,000 of each resource). Legacy also had development-only setup
  options (import/export, "average building") that are not part of the game.
- **More buildings:** only by occupation missions ([07-missions.md](07-missions.md#arrival-rules)).
- **Abandoning a building:** a player can delete one of their buildings; its rooms, troops and
  queues are deleted (`Mob_Jugador::borrarEdificio`).
- **Vacation:** [09-social.md](09-social.md#vacation-mode).

## Premium

`application/modules/premium/` (payments) is a monetization layer outside core mechanics and is not
specified.
