// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Game} from "../../src/Game.sol";
import {
    TROOPS,
    RESOURCES,
    VendettaRuleset as Ruleset
} from "../../src/generated/VendettaRuleset.sol";
import {Mission, ATTACK, STATION, TRANSPORT} from "../../src/core/GameStorage.sol";
import {
    Backlog,
    LastBuilding,
    InvalidMission,
    NoUnits,
    InvalidTroops
} from "../../src/core/GameErrors.sol";
import {GameTestBase} from "./GameTestBase.sol";
import {Missions} from "../../src/core/Missions.sol";
import {console} from "forge-std/Test.sol";

contract MissionsTest is GameTestBase {
    uint256 internal constant S = Ruleset.STOCK_SCALE;
    uint256 internal constant BOOT_CAMP = 11;
    uint256 internal constant ROWDY = 0;
    uint256 internal constant DOLLAR = 3;

    Game internal game;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        vm.warp(T0);
        game = deployGame();
        vm.prank(admin);
        game.setGlobalPremium(T0 + 3650 days);
        vm.prank(alice);
        game.register(1, 1, 1);
        vm.prank(bob);
        game.register(1, 1, 2);
        // alice: boot camp, then 7 rowdies (200 weapons + 1,000 ammunition each).
        vm.prank(alice);
        game.queueRoom(1, BOOT_CAMP);
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        game.train(1, ROWDY, 7);
        vm.warp(block.timestamp + 1 days);
        game.poke(1);
        assertEq(game.getBuilding(1).troops[ROWDY], 7);
    }

    function _rowdies(uint256 n) internal pure returns (uint256[TROOPS] memory t) {
        t[ROWDY] = n;
    }

    function _send(uint8 kind, uint256 slot, uint256 n, uint256[RESOURCES] memory res)
        internal
        returns (uint64)
    {
        vm.prank(alice);
        return game.sendMission(1, kind, [uint256(1), 1, slot], _rowdies(n), res, 0);
    }

    function _none() internal pure returns (uint256[RESOURCES] memory r) {}

    function test_sendChecks() public {
        vm.startPrank(alice);
        vm.expectRevert(InvalidMission.selector);
        game.sendMission(1, ATTACK, [uint256(1), 1, 1], _rowdies(1), _none(), 0); // target = origin
        vm.expectRevert(NoUnits.selector);
        game.sendMission(1, ATTACK, [uint256(1), 1, 2], _rowdies(0), _none(), 0);
        vm.expectRevert(InvalidTroops.selector);
        game.sendMission(1, ATTACK, [uint256(1), 1, 2], _rowdies(8), _none(), 0);
        vm.stopPrank();
    }

    function test_attackEmptySlotComesBack() public {
        uint64 id = _send(ATTACK, 50, 3, _none());
        Mission memory m = game.getMission(id);
        vm.warp(m.arrival);
        game.advance(1);
        m = game.getMission(id);
        assertTrue(m.returning);
        assertEq(m.troops[ROWDY], 3);
        vm.warp(m.arrival);
        game.poke(1);
        assertEq(game.getBuilding(1).troops[ROWDY], 7);
    }

    /// bob has no troops: all 5 rowdies survive and loot capacity 5 × 200 = 1,000 is split evenly
    /// over bob's unprotected stock (10,000 − 1,000 safe of each resource), 250 each (D-06).
    function test_attackLootsUndefended() public {
        uint64 id = _send(ATTACK, 2, 5, _none());
        vm.warp(game.getMission(id).arrival);
        game.advance(1);
        Mission memory m = game.getMission(id);
        assertTrue(m.returning);
        assertEq(m.troops[ROWDY], 5);
        for (uint256 r; r < RESOURCES; ++r) {
            assertEq(m.cargo[r], 250);
            assertEq(game.getBuilding(2).stock[r], (10_000 - 250) * S);
        }
    }

    function test_transportDelivers() public {
        vm.prank(bob);
        game.queueRoom(2, 0); // bob spends 100 weapons, so the delivery is not clamped
        uint256[RESOURCES] memory res;
        res[0] = 60;
        uint64 id = _send(TRANSPORT, 2, 1, res);
        uint256 arrival = game.getMission(id).arrival;
        vm.warp(arrival - 1);
        game.poke(2);
        uint256 before = game.getBuilding(2).stock[0];
        vm.warp(arrival);
        game.advance(1);
        // 60 weapons delivered + 1 second of production (10/h = 280 units per second).
        assertEq(game.getBuilding(2).stock[0] - before, 60 * S + 280);
        Mission memory m = game.getMission(id);
        assertTrue(m.returning);
        assertEq(m.cargo[0], 0);
    }

    function test_stationOnForeignBuildingComesBack() public {
        uint64 id = _send(STATION, 2, 2, _none());
        vm.warp(game.getMission(id).arrival);
        game.advance(1);
        assertTrue(game.getMission(id).returning);
        assertEq(game.getBuilding(2).troops[ROWDY], 0);
    }

    function test_recallReturnsAfterTimeTravelled() public {
        uint64 id = _send(ATTACK, 50, 1, _none());
        vm.warp(block.timestamp + 100);
        vm.prank(alice);
        game.recall(id);
        Mission memory m = game.getMission(id);
        assertTrue(m.returning);
        assertEq(m.arrival, block.timestamp + 100);
    }

    function test_salaryIsPaidInDollars() public {
        uint256 before = game.getBuilding(1).stock[DOLLAR];
        _send(ATTACK, 255, 7, _none());
        assertLt(game.getBuilding(1).stock[DOLLAR], before);
    }

    /// More due missions than one transaction processes: actions revert until advance() catches up.
    function test_backlogThenAdvance() public {
        vm.startPrank(alice);
        for (uint256 i; i < 7; ++i) {
            game.sendMission(1, ATTACK, [uint256(1), 1, 100 + i], _rowdies(1), _none(), 0);
        }
        vm.stopPrank();
        vm.warp(block.timestamp + 30 days); // 7 arrivals + 7 returns due
        vm.prank(bob);
        vm.expectRevert(Backlog.selector);
        game.poke(2);
        assertEq(game.advance(4), 4);
        vm.prank(bob);
        vm.expectRevert(Backlog.selector); // 3 arrivals and 4 returns still due
        game.poke(2);
        assertEq(game.advance(100), 10);
        game.poke(2);
        assertEq(game.pendingMissions().length, 0);
        assertEq(game.getBuilding(1).troops[ROWDY], 7);
    }

    /// Short of gas for the next due mission, actions and advance() revert with Backlog, never run
    /// out of gas midway; with enough gas everything is processed.
    function test_drainStopsShortOfGas() public {
        vm.startPrank(alice);
        for (uint256 i; i < 3; ++i) {
            game.sendMission(1, ATTACK, [uint256(1), 1, 100 + i], _rowdies(1), _none(), 0);
        }
        vm.stopPrank();
        vm.warp(block.timestamp + 30 days); // 3 arrivals due (their returns too, later)
        uint256 tight = Missions.MISSION_GAS_RESERVE + 150_000; // about one mission after the 63/64 rule

        vm.prank(bob);
        (bool ok, bytes memory ret) = address(game).call{gas: tight}(abi.encodeCall(game.poke, (2)));
        assertFalse(ok);
        assertEq(bytes4(ret), Backlog.selector);

        (ok, ret) = address(game).call{gas: tight}(abi.encodeCall(game.advance, (10)));
        assertFalse(ok);
        assertEq(bytes4(ret), Backlog.selector);
        game.advance(10); // with enough gas everything is processed
        game.poke(2);
        assertEq(game.pendingMissions().length, 0);
    }

    function test_cannotAbandonLastBuilding() public {
        vm.prank(alice);
        vm.expectRevert(LastBuilding.selector);
        game.abandon(1);
    }

    function test_troopPointsLostInBattle() public {
        // bob trains rowdies too: attack troops at home also defend.
        vm.prank(bob);
        game.queueRoom(2, BOOT_CAMP);
        vm.warp(block.timestamp + 1 days);
        vm.prank(bob);
        game.train(2, ROWDY, 7);
        vm.warp(block.timestamp + 1 days);
        uint256 before = game.getPlayer(1).centipoints;
        uint64 id = _send(ATTACK, 2, 7, _none());
        vm.warp(game.getMission(id).arrival);
        game.advance(1);
        Mission memory m = game.getMission(id);
        uint256 survivors = m.owner == 0 ? 0 : m.troops[ROWDY];
        assertLt(survivors, 7);
        assertEq(before - game.getPlayer(1).centipoints, (7 - survivors) * 600);
    }
}

contract MissionsGasTest is MissionsTest {
    function test_gasMissions() public {
        uint256 g = gasleft();
        uint64 id = _send(ATTACK, 2, 5, _none());
        console.log("sendMission (attack, 5 rowdies):", g - gasleft());
        vm.warp(game.getMission(id).arrival);
        g = gasleft();
        game.advance(1);
        console.log("advance: one attack (battle + loot + return queued):", g - gasleft());
        vm.warp(game.getMission(id).arrival);
        g = gasleft();
        game.advance(1);
        console.log("advance: one return home:", g - gasleft());
    }
}
