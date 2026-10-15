# Mercenarios Combat Engine (historical)

**Not part of the target game** ([D-02](../decisions.md#d-02--combat-engine)). Used by legacy servers
`old` and `test` (`application/configs/application.ini`, `combatSystemType = "Mercenarios"`).
**Source:** `library/Mob/Combat/Mercenarios.php`.

## Differences from Modificadores

| Aspect | Mercenarios | Modificadores |
|--------|-------------|---------------|
| Fights | One aggregate fight per round (all troops vs all troops) | Pairwise stack fights |
| Matchup modifiers | Not used | Used |
| Defense ×10 | No | Yes, all troops |
| Research bonus | Multiplicative: `Π (1 + sqrt(level_i)/10)`, then `round` | Additive: `1 + sqrt(Σ levels)/10`, then `floor` |
| Honor scaling | Attack power only (`PAA`, `PAD`) | Attack and defense power |
| Casualties | Same ratio applied to every stack of a side | Per fight |

## Algorithm

Up to 5 rounds, stopping when a side has no units:

```
PAA, PDA = Σ attacker units × attack, Σ attacker units × defense   (all types)
PAD, PDD = Σ defender units × attack, Σ defender units × defense
PAA *= pctA / 100 ; PAD *= pctD / 100
(PPA, PPD) = loss_ratios(PAA, PDA, PAD, PDD)          # same function as Modificadores
for each troop type:
    a_units = round(a_units − a_units × round(PPA, 3))
    d_units = round(d_units − d_units × round(PPD, 3))
```

The report also shows a "chance of victory" `round((PAA + PDA) × 100 / (PAA + PDA + PAD + PDD))`.
Espionage information is revealed only if that chance is higher for the attacker.

## Dead code: `scrap_calc`

`Mob_Combat_Abstract::scrap_calc` is a logistic survivor-ratio formula referenced only in a commented-out
line of `_getPorcentPerdidas`. It was never used by either engine and is not part of the spec.
