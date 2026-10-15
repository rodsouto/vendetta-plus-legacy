// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Game} from "../../src/Game.sol";

/// Deploys the Game behind its UUPS proxy, as the deploy script does.
abstract contract GameTestBase is Test {
    uint256 internal constant T0 = 1_700_000_000;
    address internal admin = makeAddr("admin");

    function deployGame() internal returns (Game) {
        Game impl = new Game();
        return
            Game(address(new ERC1967Proxy(address(impl), abi.encodeCall(Game.initialize, (admin)))));
    }
}
