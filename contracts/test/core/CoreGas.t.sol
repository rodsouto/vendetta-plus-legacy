// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {console} from "forge-std/Test.sol";
import {Game} from "../../src/Game.sol";
import {GameTestBase} from "./GameTestBase.sol";

/// Gas of typical core actions through the proxy (blockchain.md "Assumptions to validate").
contract CoreGasTest is GameTestBase {
    Game internal game;
    address internal alice = makeAddr("alice");

    function setUp() public {
        vm.warp(T0);
        game = deployGame();
        vm.prank(admin);
        game.setGlobalPremium(T0 + 365 days);
    }

    function test_gasCoreActions() public {
        vm.prank(alice);
        uint256 g = gasleft();
        game.register(1, 1, 1);
        console.log("register:", g - gasleft());

        vm.prank(alice);
        g = gasleft();
        game.queueRoom(1, 2); // first item: paid and started
        console.log("queueRoom (starts now):", g - gasleft());

        vm.prank(alice);
        g = gasleft();
        game.queueRoom(1, 3); // second item: queued only
        console.log("queueRoom (waits):", g - gasleft());

        for (uint256 i; i < 4; ++i) {
            vm.prank(alice);
            game.queueRoom(1, 0);
        }
        vm.warp(T0 + 30 days);
        g = gasleft();
        game.poke(1); // six items finish and start in one settlement
        console.log("poke settling 6 queue items:", g - gasleft());

        vm.warp(T0 + 31 days);
        g = gasleft();
        game.poke(1);
        console.log("poke, production only:", g - gasleft());
    }
}
