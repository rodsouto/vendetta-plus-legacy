// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {TROOPS, RESEARCH, VendettaRuleset as Ruleset} from "../generated/VendettaRuleset.sol";

/// Effective troop stats (05-formulas.md#troop-effective-stats) in exact integer arithmetic.
///
/// floor((1 + sqrt(L) / 10) × base) = base + floor(isqrt(base² × L) / 10), and
/// round((1 + sqrt(L) / 10) × base) = base + floor((isqrt(base² × L) + 5) / 10).
/// Research listed twice for a troop counts once (D-05): bonuses are bit masks.
library TroopStats {
    struct Stats {
        uint256[TROOPS] attack;
        uint256[TROOPS] defense;
    }

    /// Attack and defense of every troop type for one player's research levels.
    function combat(uint256[RESEARCH] memory levels) internal pure returns (Stats memory s) {
        uint256[TROOPS] memory baseAttack = Ruleset.baseAttack();
        uint256[TROOPS] memory baseDefense = Ruleset.baseDefense();
        uint256[TROOPS] memory attackMask = Ruleset.attackResearchMask();
        uint256[TROOPS] memory defenseMask = Ruleset.defenseResearchMask();
        for (uint256 t; t < TROOPS; ++t) {
            s.attack[t] = _floorBoost(baseAttack[t], _sum(levels, attackMask[t]));
            s.defense[t] = _floorBoost(baseDefense[t], _sum(levels, defenseMask[t]));
        }
    }

    /// Cargo capacity of one unit of troop `t` (0 for defense troops).
    function capacity(uint256 t, uint256[RESEARCH] memory levels) internal pure returns (uint256) {
        return _roundBoost(Ruleset.baseCapacity()[t], levels[Ruleset.CARGO_RESEARCH]);
    }

    /// Speed of troop `t` (0 for defense troops).
    function speed(uint256 t, uint256[RESEARCH] memory levels) internal pure returns (uint256) {
        uint256 research = Ruleset.speedResearch()[t];
        if (research == Ruleset.NO_RESEARCH) return 0;
        return _roundBoost(Ruleset.baseSpeed()[t], levels[research]);
    }

    function _sum(uint256[RESEARCH] memory levels, uint256 mask)
        private
        pure
        returns (uint256 total)
    {
        for (uint256 r; mask != 0; ++r) {
            if (mask & 1 != 0) total += levels[r];
            mask >>= 1;
        }
    }

    function _floorBoost(uint256 base, uint256 level) private pure returns (uint256) {
        return base + Math.sqrt(base * base * level) / 10;
    }

    function _roundBoost(uint256 base, uint256 level) private pure returns (uint256) {
        return base + (Math.sqrt(base * base * level) + 5) / 10;
    }
}
