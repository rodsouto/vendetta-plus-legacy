// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Game} from "../../src/Game.sol";
import {VendettaRuleset as Ruleset} from "../../src/generated/VendettaRuleset.sol";
import {
    ControllerTaken,
    LastController,
    NoRemoval,
    NoTransfer,
    NotAllowed,
    NotController,
    NotRegistered,
    RemovalPending,
    Suspended,
    TooManyControllers,
    TransferPending
} from "../../src/core/GameErrors.sol";
import {IGameEvents} from "../../src/core/GameErrors.sol";
import {GameTestBase} from "./GameTestBase.sol";

/// Several controllers per player (blockchain.md B-26): devices and recovery codes, all equal.
/// Removing another one and transferring the account take two steps, a delay apart.
contract ControllersTest is GameTestBase {
    uint256 internal constant DAY = 86_400;
    uint256 internal constant DELAY = Ruleset.CONTROLLER_REMOVAL_DELAY;

    Game internal game;
    address internal alice = makeAddr("alice");
    address internal laptop = makeAddr("laptop");
    address internal recovery = makeAddr("recovery");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");
    address internal key = makeAddr("key");

    function setUp() public {
        vm.warp(T0);
        game = deployGame();
        vm.prank(alice);
        game.register(1, 1, 1);
        vm.prank(bob);
        game.register(1, 1, 2);
    }

    function _controllers(uint64 player) internal view returns (address[] memory) {
        return game.getPlayer(player).controllers;
    }

    function test_addedControllerManagesAndPlays() public {
        vm.expectEmit(address(game));
        emit IGameEvents.ControllerAdded(1, laptop, false);
        vm.prank(alice);
        game.addController(laptop, false);
        assertEq(game.playerOf(laptop), 1);
        assertEq(_controllers(1).length, 2);
        assertEq(_controllers(1)[1], laptop);
        vm.startPrank(laptop);
        game.queueRoom(1, 0);
        game.authorizeSession(key, T0 + DAY);
        game.addController(recovery, true);
        vm.stopPrank();
        assertEq(game.playerFor(key), 1);
        // the kind is stored, so every device labels a recovery code as one (B-15)
        Game.PlayerView memory p = game.getPlayer(1);
        assertEq(p.controllers.length, 3);
        assertFalse(p.recovery[0]);
        assertFalse(p.recovery[1]);
        assertTrue(p.recovery[2]);
        assertEq(p.removalAt[0], 0);
        assertEq(p.removalAt[2], 0);
        assertEq(p.transferTo, address(0));
    }

    function test_addChecks() public {
        _authorize(alice, key);
        vm.startPrank(alice);
        vm.expectRevert(ControllerTaken.selector);
        game.addController(bob, false); // another player's
        vm.expectRevert(ControllerTaken.selector);
        game.addController(alice, false); // already this player's
        vm.expectRevert(ControllerTaken.selector);
        game.addController(key, false); // a live session
        vm.expectRevert(ControllerTaken.selector);
        game.addController(address(0), false);
        for (uint256 i = 1; i < Ruleset.MAX_CONTROLLERS; ++i) {
            game.addController(address(uint160(0xd000 + i)), false);
        }
        vm.expectRevert(TooManyControllers.selector);
        game.addController(laptop, false);
        vm.stopPrank();
        // a session never manages the account
        vm.prank(key);
        vm.expectRevert(NotController.selector);
        game.addController(laptop, false);
    }

    function test_removeIsScheduledThenExecuted() public {
        vm.startPrank(alice);
        game.addController(laptop, false);
        game.authorizeSession(key, T0 + 7 * DAY);
        vm.stopPrank();
        // the first call schedules: every session dies now, the phone keeps its rights
        vm.expectEmit(address(game));
        emit IGameEvents.ControllerRemovalScheduled(1, alice, uint40(T0 + DELAY));
        vm.prank(laptop);
        game.removeController(alice); // the lost phone
        assertEq(game.playerOf(alice), 1);
        assertEq(game.playerFor(key), 0);
        Game.PlayerView memory p = game.getPlayer(1);
        assertEq(p.sessionEpoch, 1);
        assertEq(p.removalAt[0], T0 + DELAY);
        assertEq(p.removalAt[1], 0);
        vm.startPrank(alice);
        game.queueRoom(1, 0);
        game.addController(recovery, true);
        vm.stopPrank();
        // not due yet
        vm.prank(laptop);
        vm.expectRevert(RemovalPending.selector);
        game.removeController(alice);
        vm.warp(T0 + DELAY - 1);
        vm.prank(laptop);
        vm.expectRevert(RemovalPending.selector);
        game.removeController(alice);
        // due: the same call executes it and kills the sessions again
        vm.warp(T0 + DELAY);
        vm.expectEmit(address(game));
        emit IGameEvents.ControllerRemoved(1, alice);
        vm.prank(laptop);
        game.removeController(alice);
        assertEq(game.playerOf(alice), 0);
        p = game.getPlayer(1);
        assertEq(p.sessionEpoch, 2);
        assertEq(p.controllers.length, 2);
        assertEq(p.controllers[0], recovery); // swap with the last and pop
        assertEq(p.controllers[1], laptop);
        assertEq(p.removalAt[0], 0);
        assertEq(p.removalAt[1], 0);
        assertTrue(p.recovery[0]);
        assertFalse(p.recovery[1]);
        vm.prank(alice);
        vm.expectRevert(NotRegistered.selector);
        game.queueRoom(1, 0);
        // the freed address can register a player of its own, with a clean slate
        vm.prank(alice);
        game.register(1, 1, 3);
        p = game.getPlayer(3);
        assertEq(p.removalAt[0], 0);
        assertFalse(p.recovery[0]);
    }

    function test_selfRemovalIsImmediate() public {
        vm.prank(alice);
        game.addController(laptop, false);
        vm.prank(laptop);
        game.removeController(alice); // scheduled by the laptop
        // alice leaves at once anyway, schedule included
        vm.expectEmit(address(game));
        emit IGameEvents.ControllerRemoved(1, alice);
        vm.prank(alice);
        game.removeController(alice);
        assertEq(_controllers(1).length, 1);
        assertEq(_controllers(1)[0], laptop);
        assertEq(game.playerOf(alice), 0);
        vm.prank(laptop);
        vm.expectRevert(NoRemoval.selector);
        game.cancelRemoval(alice);
    }

    function test_cancelRemoval() public {
        vm.prank(alice);
        game.addController(laptop, false);
        vm.prank(laptop);
        game.removeController(alice);
        // sessions never manage the account; strangers are not registered
        _authorize(alice, key);
        vm.prank(key);
        vm.expectRevert(NotController.selector);
        game.cancelRemoval(alice);
        vm.prank(carol);
        vm.expectRevert(NotRegistered.selector);
        game.cancelRemoval(alice);
        // the targeted controller itself may cancel
        vm.expectEmit(address(game));
        emit IGameEvents.ControllerRemovalCancelled(1, alice);
        vm.prank(alice);
        game.cancelRemoval(alice);
        assertEq(game.getPlayer(1).removalAt[0], 0);
        assertEq(game.playerFor(key), 1); // cancelling leaves the sessions alone
        vm.startPrank(alice);
        vm.expectRevert(NoRemoval.selector);
        game.cancelRemoval(alice); // nothing pending
        vm.expectRevert(NoRemoval.selector);
        game.cancelRemoval(bob); // another player's controller
        vm.stopPrank();
    }

    function test_removeChecks() public {
        vm.startPrank(alice);
        vm.expectRevert(LastController.selector);
        game.removeController(alice);
        vm.expectRevert(NotAllowed.selector);
        game.removeController(bob);
        game.addController(laptop, false);
        game.addController(recovery, true);
        game.removeController(alice); // itself: at once, swap with the last and pop
        vm.stopPrank();
        assertEq(_controllers(1)[0], recovery);
        assertEq(_controllers(1)[1], laptop);
        vm.prank(alice);
        vm.expectRevert(NotRegistered.selector);
        game.removeController(laptop);
        // a session never removes
        vm.prank(laptop);
        game.authorizeSession(key, T0 + DAY);
        vm.prank(key);
        vm.expectRevert(NotController.selector);
        game.removeController(laptop);
    }

    function test_transferIsScheduledThenExecuted() public {
        vm.startPrank(alice);
        game.addController(laptop, false);
        game.addController(recovery, true);
        game.removeController(laptop); // a pending removal goes with the transfer
        game.authorizeSession(key, T0 + 7 * DAY);
        vm.expectEmit(address(game));
        emit IGameEvents.PlayerTransferScheduled(1, carol, uint40(T0 + DELAY));
        game.transferPlayer(carol);
        Game.PlayerView memory p = game.getPlayer(1);
        assertEq(p.transferTo, carol);
        assertEq(p.transferAt, T0 + DELAY);
        assertEq(p.sessionEpoch, 1); // scheduling a transfer keeps the sessions
        assertEq(game.playerFor(key), 1);
        vm.expectRevert(TransferPending.selector);
        game.transferPlayer(carol);
        game.transferPlayer(dave); // another target re-schedules
        assertEq(game.getPlayer(1).transferTo, dave);
        vm.warp(T0 + DELAY);
        vm.expectEmit(address(game));
        emit IGameEvents.PlayerTransferred(1, alice, dave);
        game.transferPlayer(dave);
        vm.stopPrank();
        p = game.getPlayer(1);
        assertEq(p.controllers.length, 1);
        assertEq(p.controllers[0], dave);
        assertEq(p.transferTo, address(0));
        assertEq(p.transferAt, 0);
        assertEq(p.removalAt[0], 0);
        assertFalse(p.recovery[0]);
        assertEq(p.sessionEpoch, 2);
        assertEq(game.playerFor(key), 0);
        assertEq(game.playerOf(alice), 0);
        assertEq(game.playerOf(laptop), 0);
        assertEq(game.playerOf(recovery), 0);
        assertEq(game.playerOf(dave), 1);
        // the dropped controllers leave no trace: the laptop registers with a clean slate
        vm.prank(laptop);
        game.register(1, 1, 3);
        p = game.getPlayer(3);
        assertEq(p.removalAt[0], 0);
        assertFalse(p.recovery[0]);
    }

    function test_transferChecks() public {
        vm.prank(alice);
        vm.expectRevert(ControllerTaken.selector);
        game.transferPlayer(bob); // another player's controller
        vm.prank(alice);
        game.transferPlayer(carol);
        // the target is checked again when executing: carol registered meanwhile
        vm.prank(carol);
        game.register(1, 1, 3);
        vm.warp(T0 + DELAY);
        vm.prank(alice);
        vm.expectRevert(ControllerTaken.selector);
        game.transferPlayer(carol);
        vm.expectEmit(address(game));
        emit IGameEvents.PlayerTransferCancelled(1);
        vm.prank(alice);
        game.cancelTransfer();
        assertEq(game.getPlayer(1).transferTo, address(0));
        vm.prank(alice);
        vm.expectRevert(NoTransfer.selector);
        game.cancelTransfer();
        // a session never manages the account
        _authorize(alice, key);
        vm.prank(key);
        vm.expectRevert(NotController.selector);
        game.cancelTransfer();
        // suspended: no transfer, but cancelling works
        vm.prank(alice);
        game.transferPlayer(dave);
        vm.prank(admin);
        game.suspend(1, block.timestamp + DAY);
        vm.prank(alice);
        vm.expectRevert(Suspended.selector);
        game.transferPlayer(dave);
        vm.prank(alice);
        game.cancelTransfer();
    }

    function test_managingWorksWhileSuspended() public {
        vm.prank(admin);
        game.suspend(1, T0 + DAY);
        vm.startPrank(alice);
        game.addController(laptop, false);
        game.removeController(laptop); // scheduled
        game.cancelRemoval(laptop);
        game.removeController(alice); // itself, at once
        vm.stopPrank();
        assertEq(game.playerOf(laptop), 1);
        assertEq(game.playerOf(alice), 0);
    }

    function _authorize(address controller, address session) internal {
        vm.prank(controller);
        game.authorizeSession(session, block.timestamp + DAY);
    }
}
