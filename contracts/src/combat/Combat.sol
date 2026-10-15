// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {TROOPS, RESEARCH, VendettaRuleset as Ruleset} from "../generated/VendettaRuleset.sol";
import {LossRatio} from "./LossRatio.sol";

/// Battle resolution under the target rules (06-combat.md, decisions.md D-04, D-15, D-16, D-25).
/// Pure and memory-only: the caller loads armies from storage and writes the survivors back.
library Combat {
    uint256 internal constant MAX_ROUNDS = 5;
    uint256 private constant NONE = type(uint256).max;
    uint256 private constant NO_MODIFIER = 10;

    /// One side of a battle. `attack`/`defense` are effective stats (TroopStats), `pct` the honor
    /// power percentage (Honor).
    struct Side {
        uint256[TROOPS] count;
        uint256[TROOPS] attack;
        uint256[TROOPS] defense;
        uint256 pct;
    }

    /// `rounds` is the number of reported rounds; deaths are per round and troop type.
    struct Result {
        uint256 rounds;
        uint256[TROOPS] attackerRemaining;
        uint256[TROOPS] defenderRemaining;
        uint256[TROOPS][MAX_ROUNDS] attackerDeaths;
        uint256[TROOPS][MAX_ROUNDS] defenderDeaths;
    }

    function resolve(Side memory a, Side memory d) internal pure returns (Result memory r) {
        bytes memory mods = Ruleset.modifiers();
        uint256[TROOPS] memory ac = a.count;
        uint256[TROOPS] memory dc = d.count;
        bool attackerAlive = true;
        bool defenderAlive = true;
        uint256 lastRoundFights;
        uint256 round;

        while (round < MAX_ROUNDS && attackerAlive && defenderAlive) {
            attackerAlive = false;
            defenderAlive = false;
            lastRoundFights = 0;

            // Attacker phase: each attacker stack picks a defender stack.
            for (uint256 x; x < TROOPS; ++x) {
                if (ac[x] == 0) continue;
                uint256 y = _target(mods, x, dc);
                if (y == NONE) break;
                _fight(r, round, mods, a, d, x, y);
                ++lastRoundFights;
                attackerAlive = attackerAlive || ac[x] > 0;
                defenderAlive = defenderAlive || dc[y] > 0;
            }
            // Defender phase: each defender stack picks an attacker stack (D-16: pairs may repeat).
            for (uint256 y; y < TROOPS; ++y) {
                if (dc[y] == 0) continue;
                uint256 x = _target(mods, y, ac);
                if (x == NONE) break;
                _fight(r, round, mods, a, d, x, y);
                ++lastRoundFights;
                attackerAlive = attackerAlive || ac[x] > 0;
                defenderAlive = defenderAlive || dc[y] > 0;
            }
            ++round;
        }

        // A trailing round with no fights is not reported (unless it is the only one).
        if (round > 1 && lastRoundFights == 0) --round;
        r.rounds = round;
        r.attackerRemaining = ac;
        r.defenderRemaining = dc;
    }

    /// Attacker stack x against defender stack y; casualties apply immediately.
    function _fight(
        Result memory r,
        uint256 round,
        bytes memory mods,
        Side memory a,
        Side memory d,
        uint256 x,
        uint256 y
    ) private pure {
        uint256 attackerPower =
            a.count[x] * (a.attack[x] + a.defense[x]) * _modifier(mods, x, y) * a.pct;
        uint256 defenderPower =
            d.count[y] * (d.attack[y] + d.defense[y]) * _modifier(mods, y, x) * d.pct;
        (uint256 ppa, uint256 ppd) = LossRatio.compute(attackerPower, defenderPower);
        uint256 attackerDeaths = (a.count[x] * ppa + LossRatio.ONE / 2) / LossRatio.ONE;
        uint256 defenderDeaths = (d.count[y] * ppd + LossRatio.ONE / 2) / LossRatio.ONE;
        a.count[x] -= attackerDeaths;
        d.count[y] -= defenderDeaths;
        r.attackerDeaths[round][x] += attackerDeaths;
        r.defenderDeaths[round][y] += defenderDeaths;
    }

    /// D-04: the enemy stack with the highest modifier > 1, then the most units, then the first in
    /// canonical order. NONE if the enemy has no units.
    function _target(bytes memory mods, uint256 actor, uint256[TROOPS] memory enemy)
        private
        pure
        returns (uint256 best)
    {
        best = NONE;
        uint256 bestMod;
        uint256 bestCount;
        for (uint256 t; t < TROOPS; ++t) {
            uint256 count = enemy[t];
            if (count == 0) continue;
            uint256 m = _modifier(mods, actor, t);
            if (m <= NO_MODIFIER) m = 0;
            if (best == NONE || m > bestMod || (m == bestMod && count > bestCount)) {
                (best, bestMod, bestCount) = (t, m, count);
            }
        }
    }

    function _modifier(bytes memory mods, uint256 x, uint256 y) private pure returns (uint256) {
        return uint8(mods[x * TROOPS + y]);
    }
}
