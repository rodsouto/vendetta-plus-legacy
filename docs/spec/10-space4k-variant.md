# Space4k Ruleset

Space4k is a space-themed game that runs on the **same engine** as Vendetta (`GAME_TYPE=space4k` in
legacy) but with its **own balance**. In the new implementation it is a second **ruleset**
([D-21](decisions.md#d-21--space4k--second-ruleset)):

- Data: [data/space4k.yaml](data/space4k.yaml) (generated from `library/Mob/*/Space4k/`).
- Entity chapters: [space4k/02-buildings.md](space4k/02-buildings.md),
  [space4k/03-research.md](space4k/03-research.md), [space4k/04-troops.md](space4k/04-troops.md).
- Appendices: [tech tree](space4k/appendix/tech-tree.md),
  [modifier matrix](space4k/appendix/modifier-matrix.md), [glossary](space4k/appendix/glossary.md).

Every rule in chapters 01 and 05–09 applies unchanged. Those chapters use Vendetta names; read them
through the **role** table below.

## What is the same

- All formulas (cost and time curves, production curve shapes, storage, distance, travel time,
  salary, honor table, loss ratios, loot), queues, missions, social systems and constants in
  [game_config.yaml](data/game_config.yaml).
- Entity counts: 15 rooms, 16 research, 16 attack + 5 defense troops.
- Resource slots: Space4k resources occupy the same legacy columns.

## What is different

| Aspect | Vendetta | Space4k |
|--------|----------|---------|
| Costs, durations, points, stats, salaries, requirements, modifiers | `vendetta.yaml` | `space4k.yaml` (all differ) |
| `rules.troop_defense_multiplier` | 10 | 1 (legacy applies ×10 only to Vendetta) |
| Basic resource producer factor (`drilling_rig` vs `brewery`) | 50 | 10 |

## Roles

The engine refers to entities only through roles (`roles` block of each ruleset file).

| Role | Vendetta | Space4k |
|------|----------|---------|
| `build_speed_room` | `boss_office` | `headquarter` |
| `research_speed_room` | `mob_school` | `research_lab` |
| `attack_training_room` | `boot_camp` | `shipyard` |
| `defense_training_room` | `security` | `orbital_defense_station` |
| `cargo_research` | `smuggling` | `enhanced_cargo_capacity` |
| `honor_research` | `honor` | `diplomacy` |
| `occupation_troop` | `occupation_troop` | `colony_ship` |
| `spy_troop` | `spy` | `espionage_probe` |

## Resources and production

| Vendetta | Space4k | Produced by (Space4k) |
|----------|---------|-----------------------|
| `weapons` | `iron` | `iron_mine` |
| `ammunition` | `lutinum` | `lutinum_refinery` |
| `alcohol` | `water` | `drilling_rig` |
| `dollar` | `hydrogen` | `chemical_plant`, `enhanced_chemical_plant` (consume water) |

Storage: `iron_storage`, `lutinum_storage`, `water_tank`, `hydrogen_tank`.

## Positional correspondence

Each Space4k entity occupies the same position (and legacy slot) as a Vendetta entity; the full
mapping is in `scripts/space4k_id_map.py` (`VENDETTA_TO_SPACE4K_*`). The correspondence is structural
only. Matching entities do **not** have the same numbers.
