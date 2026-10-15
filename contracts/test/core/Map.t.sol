// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Map} from "../../src/rules/Map.sol";

/// distance_mission (+ random) vectors against the exact integer distance, travel time and salary.
contract MapTest is Test {
    struct DistanceCase {
        uint256 distance;
        uint256 duration;
        uint256[] from;
        uint256 salary;
        uint256 speed;
        uint256[] to;
        uint256 totalSalary;
    }

    function test_distanceVectors() public view {
        string memory json =
            vm.readFile("../packages/spec-data/generated/fixtures/vendetta/distance.json");
        DistanceCase[] memory cases = abi.decode(vm.parseJson(json, ".cases"), (DistanceCase[]));
        assertEq(cases.length, 30 + 200);
        for (uint256 i; i < cases.length; ++i) {
            DistanceCase memory c = cases[i];
            uint256 d = Map.distance([c.from[0], c.from[1], c.from[2]], [c.to[0], c.to[1], c.to[2]]);
            assertEq(d, c.distance, "distance");
            assertEq(Map.travelSeconds(d, c.speed), c.duration, "duration");
            assertEq(Map.salary(d, c.totalSalary), c.salary, "salary");
        }
    }
}
