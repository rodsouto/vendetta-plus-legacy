# Vendetta — Game Specification

Specification of **Vendetta**, a persistent browser-based mafia strategy game, extracted from the
legacy PHP codebase (`library/Mob/`, `application/`) to build a modern implementation from scratch.

## How to read this spec

- **Chapters describe legacy behavior** exactly as the PHP implements it, with source citations.
- **[decisions.md](decisions.md) describes the target game** wherever it differs from legacy (bug fixes,
  new rules, quirks kept on purpose). For the new implementation, **decisions.md wins**.
- **Data is generated** from the PHP classes; do not edit generated files by hand.
- **[data/test_vectors.yaml](data/test_vectors.yaml)** holds expected outputs produced by running the
  original PHP code. A new implementation should reproduce them, except where a decision changes the
  rule (those cases carry a separate target field, e.g. `loot_target`).

Conventions: player-facing text in English; IDs in English `snake_case`; legacy Spanish IDs in the
[glossary](appendix/glossary.md).

## Document index

| Document | Contents |
|----------|----------|
| [00-overview.md](00-overview.md) | Genre, core loop, concepts, world map |
| [01-resources.md](01-resources.md) | Resources, production, alcohol → dollar, storage |
| [02-buildings.md](02-buildings.md) | 15 rooms *(generated)* |
| [03-research.md](03-research.md) | 16 research *(generated)* |
| [04-troops.md](04-troops.md) | 21 troops *(generated)* |
| [05-formulas.md](05-formulas.md) | All formulas, queues |
| [06-combat.md](06-combat.md) | Battle resolution, loot, espionage, honor, battle report |
| [07-missions.md](07-missions.md) | Mission types, travel, salary, lifecycle |
| [08-progression.md](08-progression.md) | Points, ranking, account lifecycle |
| [09-social.md](09-social.md) | Vacation, market, families, wars, messaging, moderation |
| [10-space4k-variant.md](10-space4k-variant.md) | Space4k as a second ruleset |
| [decisions.md](decisions.md) | Legacy → target decisions (D-01 … D-25) |
| [blockchain.md](blockchain.md) | Fully on-chain EVM implementation decisions (B-01 … B-26) |

### Appendix

| Document | Contents |
|----------|----------|
| [appendix/tech-tree.md](appendix/tech-tree.md) | Requirement graph *(generated)* |
| [appendix/modifier-matrix.md](appendix/modifier-matrix.md) | Troop matchup modifiers *(generated)* |
| [appendix/glossary.md](appendix/glossary.md) | Legacy ↔ spec IDs *(generated)* |
| [appendix/mercenarios-engine.md](appendix/mercenarios-engine.md) | Historical combat engine (not in target) |
| [appendix/open-questions.md](appendix/open-questions.md) | Undecided design questions |
| [space4k/](space4k/) | Space4k entity chapters and appendices *(generated)* |

### Data

| File | Contents |
|------|----------|
| [data/game_config.yaml](data/game_config.yaml) | Server constants shared by all rulesets (hand-written) |
| [data/vendetta.yaml](data/vendetta.yaml) | Vendetta ruleset: roles, rules, entities *(generated)* |
| [data/space4k.yaml](data/space4k.yaml) | Space4k ruleset *(generated)* |
| [data/test_vectors.yaml](data/test_vectors.yaml) | Expected outputs from the legacy PHP (Vendetta) *(generated)* |
| [data/test_vectors_target.yaml](data/test_vectors_target.yaml) | Combat under the **target** rules, both rulesets, with legacy comparison *(generated)* |
| [data/test_vectors_space4k.yaml](data/test_vectors_space4k.yaml) | Same for Space4k; scenarios are positional translations of the Vendetta ones *(generated)* |

## Regenerating

Requires Python 3 with PyYAML and PHP 7.4 CLI (the legacy code uses `create_function`).

```bash
python3 scripts/extract_vendetta_spec.py    # data/vendetta.yaml, data/space4k.yaml
python3 scripts/generate_entity_docs.py     # 02/03/04 chapters (both rulesets)
python3 scripts/generate_spec_appendix.py   # tech tree, modifier matrix, glossary (both rulesets)
php scripts/generate_test_vectors.php           # data/test_vectors.yaml
php scripts/generate_test_vectors.php space4k   # data/test_vectors_space4k.yaml
python3 scripts/generate_target_vectors.py      # validates combat_reference.py vs PHP, then data/test_vectors_target.yaml
```

## Sources of truth (legacy)

| Data | Source |
|------|--------|
| Entity stats | `library/Mob/{Habitacion,Entrenamiento,Tropa}/{Vendetta,Space4k}/` |
| Canonical entity order | `library/Mob/Data.php` |
| Engine roles | `library/Mob/Server.php` |
| Formulas | `library/Mob/*/Abstract.php`, `library/Mob/Combat/`, `application/forms/Misiones/` |
| State updates | `library/Mob/Controller/Plugin/Update.php`, `application/models/` |
| English text | `application/languages/{vendetta,space4k}/en.php` |
| Honor table | `application/configs/honor.php` |

**Not authoritative:** `application/configs/gameconfig.php` (registered but never read; stale) and
`application/modules/register/` (dead code with a different schema).
