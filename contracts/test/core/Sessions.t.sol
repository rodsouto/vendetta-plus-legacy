// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Game} from "../../src/Game.sol";
import {VendettaRuleset as Ruleset} from "../../src/generated/VendettaRuleset.sol";
import {
    AlreadyRegistered,
    ControllerTaken,
    InvalidSession,
    NotAllowed,
    NotController,
    NotRegistered,
    NotOwner,
    OnVacation,
    SessionTooLong,
    Suspended
} from "../../src/core/GameErrors.sol";
import {GameTestBase} from "./GameTestBase.sol";

/// Session keys (blockchain.md B-15): a per-device address plays for a player until it expires,
/// is revoked or the account changes hands; it never manages the account.
contract SessionsTest is GameTestBase {
    uint256 internal constant DAY = 86_400;

    Game internal game;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal key = makeAddr("key");

    function setUp() public {
        vm.warp(T0);
        game = deployGame();
        vm.prank(alice);
        game.register(1, 1, 1);
        vm.prank(bob);
        game.register(1, 1, 2);
    }

    function _authorize(address controller, address session, uint256 until) internal {
        vm.prank(controller);
        game.authorizeSession(session, until);
    }

    function test_sessionPlaysForThePlayer() public {
        _authorize(alice, key, T0 + DAY);
        assertEq(game.playerFor(key), 1);
        assertEq(game.playerOf(key), 0);
        vm.prank(key);
        game.queueRoom(1, 0);
        assertEq(game.getBuilding(1).roomQueue.length, 1);
        // only the player's own buildings
        vm.prank(key);
        vm.expectRevert(NotOwner.selector);
        game.queueRoom(2, 0);
    }

    function test_sessionExpires() public {
        _authorize(alice, key, T0 + DAY);
        vm.warp(T0 + DAY);
        assertEq(game.playerFor(key), 0);
        vm.prank(key);
        vm.expectRevert(NotRegistered.selector);
        game.queueRoom(1, 0);
    }

    function test_authorizeChecks() public {
        vm.startPrank(alice);
        vm.expectRevert(InvalidSession.selector);
        game.authorizeSession(key, T0);
        vm.expectRevert(SessionTooLong.selector);
        game.authorizeSession(key, T0 + Ruleset.MAX_SESSION_SECONDS + 1);
        vm.expectRevert(ControllerTaken.selector);
        game.authorizeSession(bob, T0 + DAY);
        vm.expectRevert(ControllerTaken.selector);
        game.authorizeSession(address(0), T0 + DAY);
        game.authorizeSession(key, T0 + Ruleset.MAX_SESSION_SECONDS);
        // renewing is just authorizing again
        game.authorizeSession(key, T0 + DAY);
        vm.stopPrank();
        assertEq(game.getSession(key).until, T0 + DAY);
        // a live session of another player is taken
        vm.prank(bob);
        vm.expectRevert(ControllerTaken.selector);
        game.authorizeSession(key, T0 + DAY);
        // strangers have no player
        vm.prank(makeAddr("eve"));
        vm.expectRevert(NotRegistered.selector);
        game.authorizeSession(makeAddr("other"), T0 + DAY);
    }

    function test_sessionCannotManageTheAccount() public {
        _authorize(alice, key, T0 + DAY);
        vm.startPrank(key);
        vm.expectRevert(NotController.selector);
        game.authorizeSession(makeAddr("other"), T0 + DAY);
        vm.expectRevert(NotController.selector);
        game.revokeSession(key);
        vm.expectRevert(NotController.selector);
        game.transferPlayer(makeAddr("other"));
        vm.expectRevert(AlreadyRegistered.selector);
        game.register(1, 1, 3);
        vm.stopPrank();
        // and a live session cannot become a controller
        vm.prank(bob);
        vm.expectRevert(ControllerTaken.selector);
        game.transferPlayer(key);
    }

    function test_revoke() public {
        _authorize(alice, key, T0 + DAY);
        vm.prank(bob);
        vm.expectRevert(NotAllowed.selector);
        game.revokeSession(key);
        vm.prank(alice);
        game.revokeSession(key);
        assertEq(game.playerFor(key), 0);
        vm.prank(key);
        vm.expectRevert(NotRegistered.selector);
        game.queueRoom(1, 0);
    }

    function test_transferKillsOldSessions() public {
        _authorize(alice, key, T0 + DAY);
        address carol = makeAddr("carol");
        vm.prank(alice);
        game.transferPlayer(carol);
        assertEq(game.getPlayer(1).sessionEpoch, 1);
        assertEq(game.playerFor(key), 0);
        vm.prank(key);
        vm.expectRevert(NotRegistered.selector);
        game.queueRoom(1, 0);
        // the new owner can authorize the same device again
        _authorize(carol, key, T0 + DAY);
        assertEq(game.playerFor(key), 1);
    }

    function test_lockAppliesToSessions() public {
        _authorize(alice, key, T0 + DAY);
        vm.prank(key);
        game.startVacation();
        vm.prank(key);
        vm.expectRevert(OnVacation.selector);
        game.queueRoom(1, 0);
        // managing sessions still works while on vacation
        _authorize(alice, makeAddr("phone"), T0 + DAY);
        vm.prank(key);
        game.endVacation();

        vm.prank(admin);
        game.suspend(1, T0 + DAY);
        vm.prank(key);
        vm.expectRevert(Suspended.selector);
        game.queueRoom(1, 0);
    }
}
