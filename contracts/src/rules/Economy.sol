// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ROOMS, RESOURCES, VendettaRuleset as Ruleset} from "../generated/VendettaRuleset.sol";

/// Production rates (01-resources.md) with the target alcohol → dollar flow (D-07) and storage.
/// Rates are per hour ×RATE_DEN, which is also stock units per second (B-27). Mirrors
/// packages/rules/src/economy.ts.
library Economy {
    /// round(f × ((L+1)/2)²), half up.
    function _quarterSquare(uint256 factor, uint256 level) private pure returns (uint256) {
        return (2 * factor * (level + 1) ** 2 + 4) / 8;
    }

    /// Converter rooms of one building: full output and full consumption (0, 0 at level 0).
    struct Converters {
        uint256[ROOMS] full;
        uint256[ROOMS] consumption;
        uint256 demand;
    }

    /// Net rate per resource of one building. D-07: with stock of the converted resource, or enough
    /// brewery output, converters run at full rate; otherwise they share the brewery output in room
    /// order (full, or partial output max(0, (taken − fixed) / per_unit)) and the stock stays at 0.
    function rates(uint16[ROOMS] memory levels, uint256 convertedStock)
        internal
        pure
        returns (int256[RESOURCES] memory r)
    {
        uint256 den = Ruleset.RATE_DEN;
        uint256[ROOMS] memory resource = Ruleset.productionResource();
        Converters memory c = _producersAndConverters(levels, resource, r);
        uint256[ROOMS] memory kind = Ruleset.productionKind();
        uint256 alc = Ruleset.CONVERTED_RESOURCE;
        uint256 supply = uint256(r[alc]);
        if (convertedStock > 0 || supply >= c.demand * den) {
            r[alc] -= int256(c.demand * den);
            for (uint256 i; i < ROOMS; ++i) {
                if (kind[i] == 2) r[resource[i]] += int256(c.full[i] * den);
            }
            return r;
        }
        uint256[ROOMS] memory perUnit = Ruleset.consumptionPerUnit();
        uint256[ROOMS] memory fixedUse = Ruleset.consumptionFixed();
        uint256 available = supply / den;
        for (uint256 i; i < ROOMS; ++i) {
            if (kind[i] != 2) continue;
            uint256 taken = available < c.consumption[i] ? available : c.consumption[i];
            available -= taken;
            if (taken == c.consumption[i]) {
                r[resource[i]] += int256(c.full[i] * den);
            } else if (taken > fixedUse[i]) {
                r[resource[i]] += int256((taken - fixedUse[i]) * den / perUnit[i]);
            }
        }
        r[alc] = 0;
    }

    /// Adds producer output to `r` and returns the converters' full output and consumption.
    function _producersAndConverters(
        uint16[ROOMS] memory levels,
        uint256[ROOMS] memory resource,
        int256[RESOURCES] memory r
    ) private pure returns (Converters memory c) {
        uint256[ROOMS] memory kind = Ruleset.productionKind();
        uint256[ROOMS] memory factor = Ruleset.productionFactor();
        uint256[ROOMS] memory base = Ruleset.productionBase();
        uint256[ROOMS] memory perUnit = Ruleset.consumptionPerUnit();
        uint256[ROOMS] memory fixedUse = Ruleset.consumptionFixed();
        for (uint256 i; i < ROOMS; ++i) {
            uint256 level = levels[i];
            if (kind[i] == 1) {
                uint256 rate = level == 0 ? base[i] : base[i] + _quarterSquare(factor[i], level);
                r[resource[i]] += int256(rate * Ruleset.RATE_DEN);
            } else if (kind[i] == 2 && level > 0) {
                c.full[i] = _quarterSquare(factor[i], level);
                c.consumption[i] = c.full[i] * perUnit[i] + fixedUse[i];
                c.demand += c.consumption[i];
            }
        }
    }

    /// Storage capacity per resource, in stock units (D-10); unlimited without a storage room.
    function capacities(uint16[ROOMS] memory levels)
        internal
        pure
        returns (uint256[RESOURCES] memory cap)
    {
        for (uint256 r; r < RESOURCES; ++r) {
            cap[r] = type(uint128).max;
        }
        uint256[ROOMS] memory res = Ruleset.storageResource();
        uint256[ROOMS] memory base = Ruleset.storageBase();
        uint256[ROOMS] memory perLevel = Ruleset.storagePerLevel();
        for (uint256 i; i < ROOMS; ++i) {
            if (res[i] == Ruleset.NO_RESOURCE) continue;
            cap[res[i]] = (base[i] + perLevel[i] * levels[i]) * Ruleset.STOCK_SCALE;
        }
    }
}
