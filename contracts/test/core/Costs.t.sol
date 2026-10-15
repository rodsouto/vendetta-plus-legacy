// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {RESOURCES} from "../../src/generated/VendettaRuleset.sol";
import {Costs} from "../../src/rules/Costs.sol";

/// building_upgrade and research_upgrade vectors against the Solidity cost and time formulas.
contract CostsTest is Test {
    struct UpgradeCase {
        uint256[] cost;
        uint256 from;
        uint256 index;
        uint256 kind;
        uint256 seconds_;
        uint256 timing;
    }

    function test_upgradeVectors() public view {
        string memory json =
            vm.readFile("../packages/spec-data/generated/fixtures/vendetta/upgrades.json");
        UpgradeCase[] memory cases = abi.decode(vm.parseJson(json, ".cases"), (UpgradeCase[]));
        assertEq(cases.length, 180 + 192);
        for (uint256 i; i < cases.length; ++i) {
            UpgradeCase memory c = cases[i];
            (uint256[RESOURCES] memory cost, uint256 secs) = c.kind == 0
                ? Costs.room(c.index, c.from, c.timing)
                : Costs.research(c.index, c.from, c.timing);
            for (uint256 r; r < RESOURCES; ++r) {
                assertEq(cost[r], c.cost[r], "cost");
            }
            assertEq(secs, c.seconds_, "seconds");
        }
    }
}
