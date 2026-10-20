// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {VendettaRuleset as Ruleset} from "../generated/VendettaRuleset.sol";

/// Distance, travel time and salary (05-formulas.md), exact (B-03). Mirrors
/// packages/rules/src/map.ts.
library Map {
    /// round(√(dx² + dy²)) × distance unit; x from the city, y from the neighborhood (legacy quirk).
    function distance(uint256[3] memory a, uint256[3] memory b) internal pure returns (uint256) {
        (uint256 ax, uint256 ay) = _grid(a);
        (uint256 bx, uint256 by) = _grid(b);
        uint256 dx = ax > bx ? ax - bx : bx - ax;
        uint256 dy = ay > by ? ay - by : by - ay;
        uint256 n = dx * dx + dy * dy;
        uint256 s = Math.sqrt(n);
        if (n >= s * s + s + 1) s += 1; // round half up
        return s * Ruleset.DISTANCE_UNIT;
    }

    function _grid(uint256[3] memory c) private pure returns (uint256 x, uint256 y) {
        uint256 cols = Ruleset.GRID_COLUMNS;
        uint256 col = c[2] % cols == 0 ? cols : c[2] % cols;
        uint256 row = (c[2] + cols - 1) / cols;
        x = (c[0] - 1) * cols + col - 1;
        y = (c[1] - 1) * Ruleset.GRID_ROWS + row - 1;
    }

    /// Distance to the farthest corner of the map: the longest trip from `a` (B-22 cover cap).
    function maxDistanceFrom(uint256[3] memory a) internal pure returns (uint256) {
        (uint256 x, uint256 y) = _grid(a);
        uint256 w = Ruleset.CITIES * Ruleset.GRID_COLUMNS - 1;
        uint256 h = Ruleset.NEIGHBORHOODS * Ruleset.GRID_ROWS - 1;
        uint256 dx = x > w - x ? x : w - x;
        uint256 dy = y > h - y ? y : h - y;
        uint256 n = dx * dx + dy * dy;
        uint256 s = Math.sqrt(n);
        if (n >= s * s + s + 1) s += 1; // round half up
        return s * Ruleset.DISTANCE_UNIT;
    }

    /// One-way travel time: round(3600 × (d × F / v)^E) = ⌊(⌊2x⌋ + 1) / 2⌋.
    function travelSeconds(uint256 dist, uint256 speed) internal pure returns (uint256) {
        uint256 twice = floorPow(
            dist * Ruleset.DURATION_FACTOR_NUM,
            Ruleset.DURATION_FACTOR_DEN * speed,
            Ruleset.DURATION_EXP_NUM,
            Ruleset.DURATION_EXP_DEN,
            7200
        );
        return (twice + 1) / 2;
    }

    /// ⌊d^E × totalSalary / divisor⌋. Reverts on overflow (totalSalary beyond ~10¹⁰).
    function salary(uint256 dist, uint256 totalSalary) internal pure returns (uint256) {
        return floorPow(dist, 1, Ruleset.SALARY_EXP_NUM, Ruleset.SALARY_EXP_DEN, totalSalary)
            / Ruleset.SALARY_DIVISOR;
    }

    /// ⌊scale × (a / b)^(p / q)⌋ for p ≤ q: the largest k with k^q · b^p ≤ scale^q · a^p.
    function floorPow(uint256 a, uint256 b, uint256 p, uint256 q, uint256 scale)
        internal
        pure
        returns (uint256 lo)
    {
        uint256 rhs = scale ** q * a ** p;
        uint256 bp = b ** p;
        // (a/b)^(p/q) ≤ max(1, a/b) when p ≤ q, so the answer is below scale × (a/b + 1) + 1.
        uint256 hi = scale * (a / b + 1) + 1;
        while (lo + 1 < hi) {
            uint256 mid = (lo + hi) / 2;
            if (mid ** q * bp <= rhs) lo = mid;
            else hi = mid;
        }
    }
}
