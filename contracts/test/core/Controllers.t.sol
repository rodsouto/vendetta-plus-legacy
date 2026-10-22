// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Game} from "../../src/Game.sol";
import {VendettaRuleset as Ruleset} from "../../src/generated/VendettaRuleset.sol";
import {Invite, INVITE_CONTROLLER} from "../../src/core/GameStorage.sol";
import {
    ControllerTaken,
    LastController,
    NoInvite,
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

/// Several controllers per player (blockchain.md B-26): devices and recovery codes, all equal. An
/// address joins only by accepting an invitation itself. Removing another one and transferring the
/// account take two steps, a delay apart; the transfer's target accepts the second one.
contract ControllersTest is GameTestBase {
    uint256 internal constant DAY = 86_400;
    uint256 internal constant DELAY = Ruleset.CONTROLLER_REMOVAL_DELAY;
    uint256 internal constant TTL = Ruleset.INVITE_TTL;

    Game internal game;
    address internal alice = makeAddr("alice");
    address internal laptop = makeAddr("laptop");
    address internal recovery = makeAddr("recovery");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");
    address internal eve = makeAddr("eve");
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

    function _invite(address by, address who, bool rec) internal {
        vm.prank(by);
        game.inviteController(who, rec);
    }

    function _join(address who, uint64 player) internal {
        vm.prank(who);
        game.acceptController(player);
    }

    /// `by` (a controller of player 1) invites `who`, who accepts.
    function _add(address by, address who, bool rec) internal {
        _invite(by, who, rec);
        _join(who, 1);
    }

    function _authorize(address controller, address session) internal {
        uint64 pid = game.playerOf(controller);
        vm.prank(controller);
        game.authorizeSession(session, block.timestamp + DAY);
        vm.prank(session);
        game.acceptSession(pid);
    }

    function test_invitedControllerJoinsManagesAndPlays() public {
        vm.expectEmit(address(game));
        emit IGameEvents.ControllerInvited(1, laptop, false, uint40(T0 + TTL));
        _invite(alice, laptop, false);
        // an invitation binds nothing: the laptop is still free, the invitation is readable
        assertEq(game.playerOf(laptop), 0);
        Invite memory inv = game.getInvite(laptop, 1);
        assertEq(inv.kind, INVITE_CONTROLLER);
        assertEq(inv.until, T0 + TTL);
        assertFalse(inv.recovery);
        vm.expectEmit(address(game));
        emit IGameEvents.ControllerAdded(1, laptop, false);
        _join(laptop, 1);
        assertEq(game.playerOf(laptop), 1);
        assertEq(_controllers(1).length, 2);
        assertEq(_controllers(1)[1], laptop);
        assertEq(game.getInvite(laptop, 1).kind, 0); // consumed
        vm.startPrank(laptop);
        game.queueRoom(1, 0);
        game.authorizeSession(key, T0 + DAY);
        game.inviteController(recovery, true);
        vm.stopPrank();
        vm.prank(key);
        game.acceptSession(1);
        _join(recovery, 1);
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

    function test_inviteChecks() public {
        _authorize(alice, key);
        vm.startPrank(alice);
        vm.expectRevert(ControllerTaken.selector);
        game.inviteController(bob, false); // another player's
        vm.expectRevert(ControllerTaken.selector);
        game.inviteController(alice, false); // already this player's
        vm.expectRevert(ControllerTaken.selector);
        game.inviteController(key, false); // a live session
        vm.expectRevert(ControllerTaken.selector);
        game.inviteController(address(0), false);
        vm.stopPrank();
        // a session never manages the account
        vm.prank(key);
        vm.expectRevert(NotController.selector);
        game.inviteController(laptop, false);
        // the cap is checked when accepting
        for (uint256 i = 1; i < Ruleset.MAX_CONTROLLERS; ++i) {
            _add(alice, address(uint160(0xd000 + i)), false);
        }
        _invite(alice, laptop, false);
        vm.prank(laptop);
        vm.expectRevert(TooManyControllers.selector);
        game.acceptController(1);
    }

    function test_acceptChecks() public {
        vm.prank(laptop);
        vm.expectRevert(NoInvite.selector);
        game.acceptController(1); // never invited
        // invitations are per player: both players invite the laptop, it picks one
        _invite(alice, laptop, false);
        _invite(bob, laptop, false);
        _join(laptop, 2);
        assertEq(game.playerOf(laptop), 2);
        vm.prank(laptop);
        vm.expectRevert(ControllerTaken.selector);
        game.acceptController(1); // now bob's controller
        // an invitation expires
        _invite(alice, carol, false);
        vm.warp(T0 + TTL);
        vm.prank(carol);
        vm.expectRevert(NoInvite.selector);
        game.acceptController(1);
        // and dies with the player's epoch (a scheduled removal bumps it)
        _add(alice, recovery, true);
        _invite(alice, dave, false);
        vm.prank(alice);
        game.removeController(recovery); // scheduled: epoch bumped
        vm.prank(dave);
        vm.expectRevert(NoInvite.selector);
        game.acceptController(1);
        // cancelling
        _invite(alice, eve, false);
        vm.expectEmit(address(game));
        emit IGameEvents.InviteCancelled(1, eve);
        vm.prank(alice);
        game.cancelInvite(eve);
        vm.prank(eve);
        vm.expectRevert(NoInvite.selector);
        game.acceptController(1);
        vm.prank(alice);
        vm.expectRevert(NoInvite.selector);
        game.cancelInvite(eve); // nothing left to cancel
        _authorize(alice, key);
        vm.prank(key);
        vm.expectRevert(NotController.selector);
        game.cancelInvite(eve);
    }

    function test_removeIsScheduledThenExecuted() public {
        _add(alice, laptop, false);
        _authorize(alice, key);
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
        vm.prank(alice);
        game.queueRoom(1, 0);
        _add(alice, recovery, true);
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
        _add(alice, laptop, false);
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
        _add(alice, laptop, false);
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
        vm.stopPrank();
        _add(alice, laptop, false);
        _add(alice, recovery, true);
        vm.prank(alice);
        game.removeController(alice); // itself: at once, swap with the last and pop
        assertEq(_controllers(1)[0], recovery);
        assertEq(_controllers(1)[1], laptop);
        vm.prank(alice);
        vm.expectRevert(NotRegistered.selector);
        game.removeController(laptop);
        // a session never removes
        _authorize(laptop, key);
        vm.prank(key);
        vm.expectRevert(NotController.selector);
        game.removeController(laptop);
    }

    function test_transferIsScheduledThenAccepted() public {
        _add(alice, laptop, false);
        _add(alice, recovery, true);
        vm.prank(alice);
        game.removeController(laptop); // a pending removal goes with the transfer
        _authorize(alice, key);
        vm.expectEmit(address(game));
        emit IGameEvents.PlayerTransferScheduled(1, carol, uint40(T0 + DELAY));
        vm.prank(alice);
        game.transferPlayer(carol);
        Game.PlayerView memory p = game.getPlayer(1);
        assertEq(p.transferTo, carol);
        assertEq(p.transferAt, T0 + DELAY);
        assertEq(p.sessionEpoch, 1); // scheduling a transfer keeps the sessions
        assertEq(game.playerFor(key), 1);
        vm.prank(alice);
        vm.expectRevert(TransferPending.selector);
        game.transferPlayer(carol);
        vm.prank(alice);
        game.transferPlayer(dave); // another target re-schedules
        assertEq(game.getPlayer(1).transferTo, dave);
        vm.prank(carol);
        vm.expectRevert(NoTransfer.selector);
        game.acceptTransfer(1); // not the target any more
        vm.prank(dave);
        vm.expectRevert(TransferPending.selector);
        game.acceptTransfer(1); // not due yet
        vm.warp(T0 + DELAY);
        vm.expectEmit(address(game));
        emit IGameEvents.PlayerTransferred(1, dave);
        vm.prank(dave);
        game.acceptTransfer(1);
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
        // the target is checked again when accepting: carol registered meanwhile
        vm.prank(carol);
        game.register(1, 1, 3);
        vm.warp(T0 + DELAY);
        vm.prank(carol);
        vm.expectRevert(ControllerTaken.selector);
        game.acceptTransfer(1);
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
        // suspended: no scheduling nor accepting, but cancelling works
        vm.prank(alice);
        game.transferPlayer(dave);
        vm.prank(admin);
        game.suspend(1, block.timestamp + 10 * DAY);
        vm.prank(alice);
        vm.expectRevert(Suspended.selector);
        game.transferPlayer(eve);
        vm.warp(block.timestamp + DELAY);
        vm.prank(dave);
        vm.expectRevert(Suspended.selector);
        game.acceptTransfer(1);
        vm.prank(alice);
        game.cancelTransfer();
        vm.prank(dave);
        vm.expectRevert(NoTransfer.selector);
        game.acceptTransfer(1);
    }

    function test_managingWorksWhileSuspended() public {
        vm.prank(admin);
        game.suspend(1, T0 + DAY);
        _add(alice, laptop, false);
        vm.startPrank(alice);
        game.removeController(laptop); // scheduled
        game.cancelRemoval(laptop);
        game.removeController(alice); // itself, at once
        vm.stopPrank();
        assertEq(game.playerOf(laptop), 1);
        assertEq(game.playerOf(alice), 0);
    }
}
