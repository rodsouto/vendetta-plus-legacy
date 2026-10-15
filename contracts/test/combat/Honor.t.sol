// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Honor} from "../../src/combat/Honor.sol";
import {Fixtures} from "./Fixtures.sol";

contract HonorTest is Test {
    function test_honorVectors() public view {
        Fixtures.HonorCase[] memory cases = Fixtures.honor();
        assertGt(cases.length, 0);
        for (uint256 i; i < cases.length; ++i) {
            assertEq(Honor.pct(cases[i].buildings, cases[i].honor), cases[i].pct);
        }
    }

    /// D-17: honor is capped at 8 before every branch, including more than 100 buildings.
    function test_honorCappedAboveMaxLevel() public pure {
        assertEq(Honor.pct(150, 12), Honor.pct(150, 8));
        assertEq(Honor.pct(42, 9), Honor.pct(42, 8));
    }
}
