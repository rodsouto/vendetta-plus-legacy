// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ROOMS, RESOURCES} from "../../src/generated/VendettaRuleset.sol";
import {Building} from "../../src/core/GameStorage.sol";
import {Settlement} from "../../src/core/Settlement.sol";

/// Exposes stock integration on a building with arbitrary levels and stock.
contract SettlementHarness {
    Building internal b;

    function setup(uint16[ROOMS] memory levels, uint128[RESOURCES] memory stock, uint40 t)
        external
    {
        b.levels = levels;
        b.stock = stock;
        b.lastUpdate = t;
    }

    function integrate(uint256 t) external returns (uint128[RESOURCES] memory) {
        Settlement.integrate(b, t);
        return b.stock;
    }
}
