// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Game} from "../../src/Game.sol";
import {VendettaRuleset as Ruleset} from "../../src/generated/VendettaRuleset.sol";
import {
    AlreadyRegistered,
    SlotTaken,
    InvalidCoordinate,
    NotRegistered,
    NotOwner,
    RequirementsNotMet,
    TimingRoomRequired,
    QueueFull,
    NothingToCancel,
    IGameEvents
} from "../../src/core/GameErrors.sol";
import {GameTestBase} from "./GameTestBase.sol";

contract CoreTest is GameTestBase, IGameEvents {
    uint256 internal constant S = Ruleset.STOCK_SCALE;
    uint256 internal constant BOSS = 0;
    uint256 internal constant SCHOOL = 1;
    uint256 internal constant ARMOURY = 2;
    uint256 internal constant BAR = 5;

    Game internal game;
    address internal alice = makeAddr("alice");

    function setUp() public {
        vm.warp(T0);
        game = deployGame();
        vm.prank(alice);
        game.register(1, 1, 1);
    }

    function test_registerStartingState() public view {
        Game.BuildingView memory b = game.getBuilding(1);
        assertEq(b.owner, 1);
        assertEq(b.levels[BOSS], 1);
        for (uint256 r; r < 4; ++r) {
            assertEq(b.stock[r], 10_000 * S);
        }
        assertEq(game.playerOf(alice), 1);
        assertEq(game.buildingAt(1, 1, 1), 1);
    }

    function test_registerChecks() public {
        vm.prank(alice);
        vm.expectRevert(AlreadyRegistered.selector);
        game.register(1, 1, 2);
        vm.startPrank(makeAddr("bob"));
        vm.expectRevert(SlotTaken.selector);
        game.register(1, 1, 1);
        vm.expectRevert(InvalidCoordinate.selector);
        game.register(51, 1, 1);
        vm.expectRevert(InvalidCoordinate.selector);
        game.register(1, 1, 0);
        vm.stopPrank();
    }

    function test_onlyOwnerActs() public {
        vm.prank(makeAddr("bob"));
        vm.expectRevert(NotRegistered.selector);
        game.queueRoom(1, BOSS);
        address bob = makeAddr("bob");
        vm.prank(bob);
        game.register(1, 1, 2);
        vm.prank(bob);
        vm.expectRevert(NotOwner.selector);
        game.queueRoom(1, BOSS);
    }

    function test_requirementsAndTimingRoom() public {
        vm.startPrank(alice);
        vm.expectRevert(RequirementsNotMet.selector);
        game.queueRoom(1, BAR); // needs brewery 1 (D-13)
        vm.expectRevert(TimingRoomRequired.selector);
        game.queueResearch(1, 0); // needs mob_school ≥ 1 (D-14)
        vm.stopPrank();
    }

    function test_queueLimitWithoutPremium() public {
        vm.startPrank(alice);
        game.queueRoom(1, ARMOURY);
        vm.expectRevert(QueueFull.selector);
        game.queueRoom(1, ARMOURY);
        vm.stopPrank();
    }

    /// D-11: later items are paid when they start and dropped if unaffordable then.
    /// mob_school costs 1000, 4000, 9000 weapons for levels 1, 2, 3 (base × (n+1)²).
    function test_deferredPaymentDropsUnaffordable() public {
        vm.prank(admin);
        game.setGlobalPremium(T0 + 365 days);
        vm.startPrank(alice);
        game.queueRoom(1, SCHOOL);
        game.queueRoom(1, SCHOOL);
        game.queueRoom(1, SCHOOL);
        vm.stopPrank();
        vm.expectEmit(true, false, false, true, address(game));
        emit RoomDropped(1, uint8(SCHOOL));
        vm.warp(T0 + 30 days);
        game.poke(1);
        Game.BuildingView memory b = game.getBuilding(1);
        assertEq(b.levels[SCHOOL], 2);
        assertEq(b.roomQueue.length, 0);
    }

    /// B-29: an item's duration is computed when it starts, with the build-speed level of that moment.
    function test_durationComputedAtStart() public {
        vm.prank(admin);
        game.setGlobalPremium(T0 + 365 days);
        vm.startPrank(alice);
        game.queueRoom(1, BOSS); // boss 1 → 2: round(4 × 900 / 1 / 3) = 1200 s
        game.queueRoom(1, ARMOURY); // starts at boss 2: round(1 × 500 / 2 / 3) = 83 s
        vm.stopPrank();
        assertEq(game.getBuilding(1).roomQueue[0].finishAt, T0 + 1200);
        vm.warp(T0 + 1200);
        game.poke(1);
        assertEq(game.getBuilding(1).roomQueue[0].finishAt, T0 + 1200 + 83);
    }

    function test_cancelInProgressRefunds() public {
        vm.startPrank(alice);
        game.queueRoom(1, BOSS);
        game.cancelRoom(1, 0);
        vm.expectRevert(NothingToCancel.selector);
        game.cancelRoom(1, 0);
        vm.stopPrank();
        assertEq(game.getBuilding(1).stock[0], 10_000 * S);
    }

    function test_pointsOnCompletion() public {
        vm.prank(alice);
        game.queueRoom(1, ARMOURY);
        vm.warp(T0 + 1 days);
        game.poke(1);
        // boss_office 6 + weapons_armoury 2.32, in centipoints
        assertEq(game.getPlayer(1).centipoints, 600 + 232);
        assertEq(game.getBuilding(1).centipoints, 600 + 232);
    }

    function test_onlyAdminSetsGlobalPremium() public {
        vm.prank(alice);
        vm.expectRevert();
        game.setGlobalPremium(T0 + 1);
    }
}
