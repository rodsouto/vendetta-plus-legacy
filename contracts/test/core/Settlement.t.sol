// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {
    ROOMS,
    RESOURCES,
    VendettaRuleset as Ruleset
} from "../../src/generated/VendettaRuleset.sol";
import {SettlementHarness} from "./SettlementHarness.sol";

/// Exact stock integration (B-27), alcohol regime change at a whole second (B-28, D-07), capacity (D-10).
contract SettlementTest is Test {
    uint256 internal constant S = Ruleset.STOCK_SCALE;
    // Room and resource indices in vendetta.yaml order.
    uint256 internal constant BREWERY = 4;
    uint256 internal constant BAR = 5;
    uint256 internal constant SMUGGLE = 6;
    uint256 internal constant WEAPONS = 0;
    uint256 internal constant ALCOHOL = 2;
    uint256 internal constant DOLLAR = 3;

    SettlementHarness internal h = new SettlementHarness();

    function test_tenWeaponsPerHourExactly() public {
        uint16[ROOMS] memory levels;
        uint128[RESOURCES] memory stock;
        h.setup(levels, stock, 0);
        assertEq(h.integrate(3600)[WEAPONS], 10 * S);
        assertEq(h.integrate(3601)[WEAPONS], 10 * S + 280); // 10/h ×28 units per second
    }

    function test_capacityClamp() public {
        uint16[ROOMS] memory levels;
        uint128[RESOURCES] memory stock;
        h.setup(levels, stock, 0);
        assertEq(h.integrate(365 days)[WEAPONS], 10_000 * S); // level-0 storage
    }

    /// bar L1 (Rb 2, Cb 17), smuggle L1 (Rs 21, Cs 85), brewery L0 (P 10): net −92/h with stock.
    /// Full rate until ⌈stock / drain⌉, then the starved rate: bar gets all 10, (10 − 3) / 7 = 1/h.
    function test_alcoholDepletionAtWholeSecond() public {
        uint16[ROOMS] memory levels;
        levels[BAR] = 1;
        levels[SMUGGLE] = 1;
        uint128[RESOURCES] memory stock;
        stock[ALCOHOL] = uint128(46 * S); // half an hour of net consumption
        h.setup(levels, stock, 0);
        uint256 drain = 92 * 28; // units per second
        uint256 depletion = (46 * S + drain - 1) / drain;
        assertEq(depletion, 1800);
        uint128[RESOURCES] memory got = h.integrate(3600);
        assertEq(got[ALCOHOL], 0);
        uint256 dollars = (2 + 21) * 28 * depletion + 1 * 28 * (3600 - depletion);
        assertEq(got[DOLLAR], dollars);
    }

    function test_enoughBreweryNoDepletion() public {
        uint16[ROOMS] memory levels;
        levels[BREWERY] = 1; // 60/h
        levels[BAR] = 1; // 17/h
        uint128[RESOURCES] memory stock;
        h.setup(levels, stock, 0);
        uint128[RESOURCES] memory got = h.integrate(3600);
        assertEq(got[ALCOHOL], (60 - 17) * S);
        assertEq(got[DOLLAR], 2 * S);
    }
}
