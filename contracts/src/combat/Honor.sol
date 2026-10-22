// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {VendettaRuleset as Ruleset} from "../generated/VendettaRuleset.sol";

/// Honor power percentage (05-formulas.md#honor-attack-power-percentage, D-17, D-27).
library Honor {
    uint256 internal constant MAX_LEVEL = 8;
    uint256 private constant MIN_BUILDINGS = 5;
    uint256 private constant MAX_BUILDINGS = 100;
    uint256 private constant ROW = 5;
    uint256 private constant LEVELS = MAX_LEVEL + 1;

    function pct(uint256 buildings, uint256 honorLevel) internal pure returns (uint256) {
        uint256 p = _pct(buildings, honorLevel);
        return p < Ruleset.HONOR_MIN_PERCENT ? Ruleset.HONOR_MIN_PERCENT : p; // D-27
    }

    function _pct(uint256 buildings, uint256 honorLevel) private pure returns (uint256) {
        if (buildings < MIN_BUILDINGS) return 100;
        if (honorLevel > MAX_LEVEL) honorLevel = MAX_LEVEL; // D-17: before every branch
        bytes memory table = Ruleset.honorTable();
        if (buildings > MAX_BUILDINGS) {
            // round(100 × table[100][h] / B), half up
            return (200 * _cell(table, MAX_BUILDINGS, honorLevel) + buildings) / (2 * buildings);
        }
        uint256 base = buildings / ROW * ROW;
        uint256 high = _cell(table, base, honorLevel);
        if (base == buildings) return high;
        // round(high - (high - low) / 5 × (B - base)): the fraction is a multiple of 1/5, never a tie.
        uint256 low = _cell(table, base + ROW, honorLevel);
        return (2 * (ROW * high - (high - low) * (buildings - base)) + ROW) / (2 * ROW);
    }

    function _cell(bytes memory table, uint256 buildings, uint256 honorLevel)
        private
        pure
        returns (uint256)
    {
        return uint8(table[(buildings / ROW - 1) * LEVELS + honorLevel]);
    }
}
