// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {RESEARCH} from "../../src/generated/VendettaRuleset.sol";
import {TroopStats} from "../../src/combat/TroopStats.sol";
import {Fixtures} from "./Fixtures.sol";

contract TroopStatsTest is Test {
    function test_troopStatsVectors() public view {
        Fixtures.TroopStatsCase[] memory cases = Fixtures.troopStats();
        assertGt(cases.length, 0);
        for (uint256 i; i < cases.length; ++i) {
            Fixtures.TroopStatsCase memory c = cases[i];
            uint256[RESEARCH] memory levels = Fixtures.allResearch(c.level);
            TroopStats.Stats memory s = TroopStats.combat(levels);
            assertEq(s.attack[c.troop], c.attack, "attack");
            assertEq(s.defense[c.troop], c.defense, "defense");
            if (c.withMobility) {
                assertEq(TroopStats.speed(c.troop, levels), c.speed, "speed");
                assertEq(TroopStats.capacity(c.troop, levels), c.capacity, "capacity");
            }
        }
    }
}
