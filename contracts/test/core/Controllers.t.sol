// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Game} from "../../src/Game.sol";
import {VendettaRuleset as Ruleset} from "../../src/generated/VendettaRuleset.sol";
import {
    ControllerTaken,
    LastController,
    NotAllowed,
    NotController,
    NotRegistered,
    TooManyControllers
} from "../../src/core/GameErrors.sol";
import {IGameEvents} from "../../src/core/GameErrors.sol";
import {GameTestBase} from "./GameTestBase.sol";

/// Several controllers per player (blockchain.md B-26): devices and recovery codes, all equal.
contract ControllersTest is GameTestBase {
    uint256 internal constant DAY = 86_400;

    Game internal game;
    address internal alice = makeAddr("alice");
    address internal laptop = makeAddr("laptop");
    address internal recovery = makeAddr("recovery");
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

    function _controllers(uint64 player) internal view returns (address[] memory) {
        return game.getPlayer(player).controllers;
    }

    function test_addedControllerManagesAndPlays() public {
        vm.expectEmit(address(game));
        emit IGameEvents.ControllerAdded(1, laptop);
        vm.prank(alice);
        game.addController(laptop);
        assertEq(game.playerOf(laptop), 1);
        assertEq(_controllers(1).length, 2);
        assertEq(_controllers(1)[1], laptop);
        vm.startPrank(laptop);
        game.queueRoom(1, 0);
        game.authorizeSession(key, T0 + DAY);
        game.addController(recovery);
        vm.stopPrank();
        assertEq(game.playerFor(key), 1);
        assertEq(_controllers(1).length, 3);
    }

    function test_addChecks() public {
        _authorize(alice, key);
        vm.startPrank(alice);
        vm.expectRevert(ControllerTaken.selector);
        game.addController(bob); // another player's
        vm.expectRevert(ControllerTaken.selector);
        game.addController(alice); // already this player's
        vm.expectRevert(ControllerTaken.selector);
        game.addController(key); // a live session
        vm.expectRevert(ControllerTaken.selector);
        game.addController(address(0));
        for (uint256 i = 1; i < Ruleset.MAX_CONTROLLERS; ++i) {
            game.addController(address(uint160(0xd000 + i)));
        }
        vm.expectRevert(TooManyControllers.selector);
        game.addController(laptop);
        vm.stopPrank();
        // a session never manages the account
        vm.prank(key);
        vm.expectRevert(NotController.selector);
        game.addController(laptop);
    }

    function test_removeKillsSessions() public {
        vm.prank(alice);
        game.addController(laptop);
        _authorize(alice, key);
        vm.expectEmit(address(game));
        emit IGameEvents.ControllerRemoved(1, alice);
        vm.prank(laptop);
        game.removeController(alice); // the lost phone
        assertEq(game.playerOf(alice), 0);
        assertEq(game.playerFor(key), 0);
        assertEq(_controllers(1).length, 1);
        assertEq(_controllers(1)[0], laptop);
        vm.prank(alice);
        vm.expectRevert(NotRegistered.selector);
        game.queueRoom(1, 0);
        // the freed address can register a player of its own
        vm.prank(alice);
        game.register(1, 1, 3);
    }

    function test_removeChecks() public {
        vm.startPrank(alice);
        vm.expectRevert(LastController.selector);
        game.removeController(alice);
        vm.expectRevert(NotAllowed.selector);
        game.removeController(bob);
        game.addController(laptop);
        game.addController(recovery);
        game.removeController(alice); // itself: swap with the last and pop
        vm.stopPrank();
        assertEq(_controllers(1)[0], recovery);
        assertEq(_controllers(1)[1], laptop);
        vm.prank(alice);
        vm.expectRevert(NotRegistered.selector);
        game.removeController(laptop);
    }

    function test_transferReplacesEveryController() public {
        address carol = makeAddr("carol");
        vm.startPrank(alice);
        game.addController(laptop);
        game.addController(recovery);
        game.transferPlayer(carol);
        vm.stopPrank();
        assertEq(_controllers(1).length, 1);
        assertEq(_controllers(1)[0], carol);
        assertEq(game.playerOf(alice), 0);
        assertEq(game.playerOf(laptop), 0);
        assertEq(game.playerOf(recovery), 0);
        assertEq(game.playerOf(carol), 1);
    }

    function test_managingWorksWhileSuspended() public {
        vm.prank(admin);
        game.suspend(1, T0 + DAY);
        vm.startPrank(alice);
        game.addController(laptop);
        game.removeController(alice);
        vm.stopPrank();
        assertEq(game.playerOf(laptop), 1);
    }

    function _authorize(address controller, address session) internal {
        vm.prank(controller);
        game.authorizeSession(session, T0 + DAY);
    }
}
