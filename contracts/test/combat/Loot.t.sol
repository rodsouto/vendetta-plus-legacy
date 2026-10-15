// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Loot} from "../../src/combat/Loot.sol";
import {RESOURCES} from "../../src/generated/VendettaRuleset.sol";
import {Fixtures} from "./Fixtures.sol";

contract LootTest is Test {
    function test_lootVectors() public view {
        Fixtures.LootCase[] memory cases = Fixtures.loot();
        assertGt(cases.length, 0);
        for (uint256 i; i < cases.length; ++i) {
            Fixtures.LootCase memory c = cases[i];
            uint256[RESOURCES] memory u =
                [c.unprotected[0], c.unprotected[1], c.unprotected[2], c.unprotected[3]];
            uint256[RESOURCES] memory got = Loot.apportion(c.capacity, u);
            for (uint256 r; r < RESOURCES; ++r) {
                assertEq(got[r], c.loot[r], c.label);
            }
        }
    }

    /// D-06 invariants: never more than capacity nor than stock; all stock if capacity allows.
    function testFuzz_lootBounds(uint64 capacity, uint64[4] memory stock) public pure {
        uint256[RESOURCES] memory u = [uint256(stock[0]), stock[1], stock[2], stock[3]];
        uint256[RESOURCES] memory got = Loot.apportion(capacity, u);
        uint256 total;
        uint256 stockTotal;
        for (uint256 r; r < RESOURCES; ++r) {
            assertLe(got[r], u[r]);
            total += got[r];
            stockTotal += u[r];
        }
        assertEq(total, capacity < stockTotal ? capacity : stockTotal);
    }
}
