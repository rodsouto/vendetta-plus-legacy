// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    ROOMS,
    RESEARCH,
    RESOURCES,
    VendettaRuleset as Ruleset
} from "../generated/VendettaRuleset.sol";

/// Upgrade costs and durations (05-formulas.md), exact. Mirrors packages/rules/src/costs.ts.
library Costs {
    function _roundHalfUp(uint256 num, uint256 den) private pure returns (uint256) {
        return (2 * num + den) / (2 * den);
    }

    /// Room level n → n+1: cost base × (n+1)², time round((n+1)² × duration / max(1, speed) / mult).
    function room(uint256 index, uint256 fromLevel, uint256 buildSpeedLevel)
        internal
        pure
        returns (uint256[RESOURCES] memory cost, uint256 seconds_)
    {
        uint256 sq = (fromLevel + 1) ** 2;
        uint256[RESOURCES] memory base = Ruleset.roomCost()[index];
        for (uint256 r; r < RESOURCES; ++r) {
            cost[r] = base[r] * sq;
        }
        uint256 speed = buildSpeedLevel > 1 ? buildSpeedLevel : 1;
        seconds_ = _roundHalfUp(
            sq * Ruleset.roomSeconds()[index], speed * Ruleset.UPGRADE_SPEED_MULTIPLIER
        );
    }

    /// Research level n → n+1: time round(round((n+1)² × duration / school) / mult); school ≥ 1 (D-14).
    function research(uint256 index, uint256 fromLevel, uint256 schoolLevel)
        internal
        pure
        returns (uint256[RESOURCES] memory cost, uint256 seconds_)
    {
        uint256 sq = (fromLevel + 1) ** 2;
        uint256[RESOURCES] memory base = Ruleset.researchCost()[index];
        for (uint256 r; r < RESOURCES; ++r) {
            cost[r] = base[r] * sq;
        }
        seconds_ = _roundHalfUp(
            _roundHalfUp(sq * Ruleset.researchSeconds()[index], schoolLevel),
            Ruleset.UPGRADE_SPEED_MULTIPLIER
        );
    }

    /// Checks (kind, index, level) requirement triples: kind 0 = room of `rooms`, 1 = research.
    function met(
        bytes memory reqs,
        uint16[ROOMS] memory rooms,
        uint16[RESEARCH] memory researchLevels
    ) internal pure returns (bool) {
        for (uint256 i; i < reqs.length; i += 3) {
            uint256 have = uint8(reqs[i]) == 0
                ? rooms[uint8(reqs[i + 1])]
                : researchLevels[uint8(reqs[i + 1])];
            if (have < uint8(reqs[i + 2])) return false;
        }
        return true;
    }
}
