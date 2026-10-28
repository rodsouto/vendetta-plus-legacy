// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import {Game} from "../../src/Game.sol";
import {NotAllowed, IGameEvents} from "../../src/core/GameErrors.sol";
import {ROLE_ADMIN, ROLE_OPERATOR, ROLE_ARBITER} from "../../src/core/GameStorage.sol";
import {GameTestBase} from "./GameTestBase.sol";

/// B-17: the admin upgrades until it drops its own role (the freeze); the operator (premium) and the
/// arbiter (suspension) are separate roles that keep rotating after it.
contract UpgradesTest is GameTestBase {
    Game internal game;
    address internal alice = makeAddr("alice");

    function setUp() public {
        vm.warp(T0);
        game = deployGame();
        vm.prank(alice);
        game.register(1, 1, 1);
    }

    function implementation() internal view returns (address) {
        return address(uint160(uint256(vm.load(address(game), ERC1967Utils.IMPLEMENTATION_SLOT))));
    }

    function holder(uint8 role) internal view returns (address h) {
        (h,) = game.roleHolder(role);
    }

    /// Nobody takes the proxy or the bare implementation by initializing it again.
    function test_initializeOnlyOnce() public {
        vm.startPrank(alice);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        game.initialize(alice, alice, alice);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        Game(implementation()).initialize(alice, alice, alice);
        vm.stopPrank();
        assertEq(holder(ROLE_ADMIN), admin);
        assertEq(holder(ROLE_OPERATOR), operator);
        assertEq(holder(ROLE_ARBITER), arbiter);
    }

    function test_upgradeKeepsState() public {
        Game.BuildingView memory before = game.getBuilding(1);
        address next = address(new Game());
        vm.prank(admin);
        game.upgradeToAndCall(next, "");
        assertEq(implementation(), next);
        assertEq(game.playerOf(alice), 1);
        assertEq(abi.encode(game.getBuilding(1)), abi.encode(before));
        assertEq(holder(ROLE_OPERATOR), operator);
    }

    function test_onlyAdminUpgrades() public {
        address next = address(new Game());
        address[3] memory others = [alice, operator, arbiter];
        for (uint256 i; i < 3; ++i) {
            vm.prank(others[i]);
            vm.expectRevert(NotAllowed.selector);
            game.upgradeToAndCall(next, "");
        }
    }

    /// Each power belongs to its role only: the admin holds none of the others.
    function test_rolesAreSeparate() public {
        address[3] memory others = [admin, arbiter, alice];
        for (uint256 i; i < 3; ++i) {
            vm.startPrank(others[i]);
            vm.expectRevert(NotAllowed.selector);
            game.grantPremium(1, T0 + 30 days);
            vm.expectRevert(NotAllowed.selector);
            game.setGlobalPremium(T0 + 30 days);
            vm.stopPrank();
        }
        others = [admin, operator, alice];
        for (uint256 i; i < 3; ++i) {
            vm.prank(others[i]);
            vm.expectRevert(NotAllowed.selector);
            game.suspend(1, T0 + 1 days);
        }
        vm.startPrank(operator);
        game.grantPremium(1, T0 + 30 days);
        game.setGlobalPremium(T0 + 30 days);
        vm.stopPrank();
        vm.prank(arbiter);
        game.suspend(1, T0 + 1 days);
    }

    function test_adminAssignsRolesAtOnce() public {
        address next = makeAddr("next");
        vm.prank(operator);
        game.proposeRole(ROLE_OPERATOR, makeAddr("pending"));
        vm.prank(alice);
        vm.expectRevert(NotAllowed.selector);
        game.setRole(ROLE_OPERATOR, alice);

        vm.expectEmit(address(game));
        emit IGameEvents.RoleTransferred(ROLE_OPERATOR, next);
        vm.prank(admin);
        game.setRole(ROLE_OPERATOR, next);
        // The admin's assignment also drops the old holder's proposal: a compromised holder
        // cannot keep the role through a successor it chose.
        (address h, address pending) = game.roleHolder(ROLE_OPERATOR);
        assertEq(h, next);
        assertEq(pending, address(0));
        vm.prank(operator);
        vm.expectRevert(NotAllowed.selector);
        game.grantPremium(1, T0 + 30 days);
        vm.prank(next);
        game.grantPremium(1, T0 + 30 days);
    }

    function test_holderHandsRoleOverInTwoSteps() public {
        address next = makeAddr("next");
        vm.prank(operator);
        vm.expectRevert(NotAllowed.selector);
        game.proposeRole(ROLE_ARBITER, next); // only the arbiter proposes the arbiter
        vm.prank(alice);
        vm.expectRevert(NotAllowed.selector);
        game.acceptRole(ROLE_ARBITER); // nothing proposed to alice

        vm.expectEmit(address(game));
        emit IGameEvents.RoleProposed(ROLE_ARBITER, next);
        vm.prank(arbiter);
        game.proposeRole(ROLE_ARBITER, next);
        assertEq(holder(ROLE_ARBITER), arbiter); // still the holder until next accepts
        vm.prank(alice);
        vm.expectRevert(NotAllowed.selector);
        game.acceptRole(ROLE_ARBITER);
        vm.prank(next);
        game.acceptRole(ROLE_ARBITER);
        (address h, address pending) = game.roleHolder(ROLE_ARBITER);
        assertEq(h, next);
        assertEq(pending, address(0));
        vm.prank(arbiter);
        vm.expectRevert(NotAllowed.selector);
        game.suspend(1, T0 + 1 days);
        vm.prank(next);
        game.suspend(1, T0 + 1 days);
    }

    function test_proposalCanBeWithdrawn() public {
        address next = makeAddr("next");
        vm.startPrank(operator);
        game.proposeRole(ROLE_OPERATOR, next);
        game.proposeRole(ROLE_OPERATOR, address(0));
        vm.stopPrank();
        vm.prank(next);
        vm.expectRevert(NotAllowed.selector);
        game.acceptRole(ROLE_OPERATOR);
    }

    /// Dropping the admin role is the freeze: no more upgrades or assignments, the roles go on.
    function test_adminDropsItsRoleToFreeze() public {
        address next = address(new Game());
        address current = implementation();
        vm.prank(admin);
        game.setRole(ROLE_ADMIN, address(0));
        assertEq(holder(ROLE_ADMIN), address(0));

        vm.startPrank(admin);
        vm.expectRevert(NotAllowed.selector);
        game.upgradeToAndCall(next, "");
        vm.expectRevert(NotAllowed.selector);
        game.setRole(ROLE_OPERATOR, admin);
        vm.expectRevert(NotAllowed.selector);
        game.proposeRole(ROLE_ADMIN, admin);
        vm.stopPrank();
        assertEq(implementation(), current);

        address successor = makeAddr("successor");
        vm.prank(operator);
        game.proposeRole(ROLE_OPERATOR, successor);
        vm.prank(successor);
        game.acceptRole(ROLE_OPERATOR);
        vm.prank(successor);
        game.grantPremium(1, T0 + 30 days);
        vm.prank(arbiter);
        game.suspend(1, T0 + 1 days);
    }

    /// The freeze also drops a pending admin proposal: nobody can bring the admin back.
    function test_freezeDropsPendingAdmin() public {
        address safe = makeAddr("safe");
        vm.startPrank(admin);
        game.proposeRole(ROLE_ADMIN, safe);
        game.setRole(ROLE_ADMIN, address(0));
        vm.stopPrank();
        vm.prank(safe);
        vm.expectRevert(NotAllowed.selector);
        game.acceptRole(ROLE_ADMIN);
        (address h, address pending) = game.roleHolder(ROLE_ADMIN);
        assertEq(h, address(0));
        assertEq(pending, address(0));
    }

    /// A replaced proposal is dead: only the latest proposed account accepts.
    function test_replacedProposalCannotBeAccepted() public {
        address first = makeAddr("first");
        address second = makeAddr("second");
        vm.startPrank(operator);
        game.proposeRole(ROLE_OPERATOR, first);
        game.proposeRole(ROLE_OPERATOR, second);
        vm.stopPrank();
        vm.prank(first);
        vm.expectRevert(NotAllowed.selector);
        game.acceptRole(ROLE_OPERATOR);
        vm.prank(second);
        game.acceptRole(ROLE_OPERATOR);
        assertEq(holder(ROLE_OPERATOR), second);
    }

    /// The admin hands its role to a new Safe in two steps; the old one loses every admin power.
    function test_adminHandsOverInTwoSteps() public {
        address safe = makeAddr("safe");
        vm.prank(admin);
        game.proposeRole(ROLE_ADMIN, safe);
        vm.prank(safe);
        game.acceptRole(ROLE_ADMIN);
        address next = address(new Game());
        vm.startPrank(admin);
        vm.expectRevert(NotAllowed.selector);
        game.upgradeToAndCall(next, "");
        vm.expectRevert(NotAllowed.selector);
        game.setRole(ROLE_OPERATOR, admin);
        vm.stopPrank();
        vm.prank(safe);
        game.upgradeToAndCall(next, "");
        assertEq(implementation(), next);
    }

    /// The namespace sits where ERC-7201 puts "vendetta.storage.core", with the fields the layout
    /// snapshot (storage-layout.json) records in its first slot.
    function test_coreNamespaceSlot() public {
        bytes32 base = keccak256(abi.encode(uint256(keccak256("vendetta.storage.core")) - 1))
            & ~bytes32(uint256(0xff));
        vm.prank(operator);
        game.setGlobalPremium(T0 + 7 days);
        uint256 word = uint256(vm.load(address(game), base));
        assertEq(uint40(word >> 64), T0 + 7 days); // globalPremiumUntil, offset 8
    }
}
