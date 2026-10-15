# Open Questions

Design questions still open for the new implementation. Decided items live in
[decisions.md](../decisions.md).

## Magic constants

The intent behind these legacy constants is undocumented; they are kept as-is in
[game_config.yaml](../data/game_config.yaml):

| Constant | Where | Observed effect |
|----------|-------|-----------------|
| `3.3479` | mission duration | distance-to-time scaling |
| `0.2` | mission duration exponent | travel time grows very slowly with distance |
| `2512`, `0.8` | salary | dollar cost of a mission |
| `10×` | combat | wipe threshold |
| `×10` | troop defense | defense dominates power sums (D-03) |

## Battle report presentation

The stored battle data is specified ([06-combat.md](../06-combat.md#battle-report)); the exact
presentation (compact vs full report) is a UI decision. On-chain all state is public
([blockchain.md](../blockchain.md#b-05--public-state--adapt)), so who sees what is no longer a question.

## Space4k extras

Space4k is a separate ruleset ([D-21](../decisions.md#d-21--space4k--second-ruleset)). Its test scenarios are positional translations of the Vendetta ones, so
some labels (e.g. the rowdy → demolition_expert counter) do not describe a real Space4k matchup;
Space4k-specific combat scenarios could be added.
