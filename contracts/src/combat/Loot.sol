// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {RESOURCES} from "../generated/VendettaRuleset.sol";

/// Loot apportionment (D-06): split `capacity` across the defender's unprotected resources in
/// proportion to what remains, largest remainder first, never exceeding capacity or stock. Capacity
/// freed by resources that run out is redistributed until capacity or stock is exhausted.
/// Arrays are in loot order (also the tie-break order): weapons, ammunition, dollar, alcohol.
library Loot {
    function apportion(uint256 capacity, uint256[RESOURCES] memory unprotected)
        internal
        pure
        returns (uint256[RESOURCES] memory loot)
    {
        // Copy: do not mutate the caller's array.
        uint256[RESOURCES] memory rem =
            [unprotected[0], unprotected[1], unprotected[2], unprotected[3]];
        uint256 cap = capacity;
        while (cap > 0) {
            uint256 total;
            for (uint256 i; i < RESOURCES; ++i) {
                total += rem[i];
            }
            if (total == 0) break;
            if (cap >= total) {
                for (uint256 i; i < RESOURCES; ++i) {
                    loot[i] += rem[i];
                }
                break;
            }

            uint256[RESOURCES] memory share;
            uint256[RESOURCES] memory frac;
            uint256 left = cap;
            for (uint256 i; i < RESOURCES; ++i) {
                share[i] = cap * rem[i] / total;
                frac[i] = cap * rem[i] % total;
                left -= share[i];
            }
            // Hand out the units left by flooring: largest remainder first, ties by resource order.
            // `left` < number of active resources, so each one gets at most one extra unit.
            for (; left > 0; --left) {
                uint256 best = type(uint256).max;
                for (uint256 i; i < RESOURCES; ++i) {
                    if (rem[i] == 0 || frac[i] == type(uint256).max) continue;
                    if (best == type(uint256).max || frac[i] > frac[best]) best = i;
                }
                share[best] += 1;
                frac[best] = type(uint256).max; // taken
            }

            uint256 freed;
            for (uint256 i; i < RESOURCES; ++i) {
                uint256 take = share[i] < rem[i] ? share[i] : rem[i];
                freed += share[i] - take;
                loot[i] += take;
                rem[i] -= take;
            }
            if (freed == cap) break;
            cap = freed;
        }
    }
}
