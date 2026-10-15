// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Game} from "../src/Game.sol";
import {PasskeyDirectory} from "../src/accounts/PasskeyDirectory.sol";

/// Deploys the linked libraries (forge does it automatically), the Game implementation and its UUPS
/// proxy, and the ownerless passkey directory (B-15). ADMIN (optional) is the owner, normally the
/// admin Safe (B-17); defaults to the deployer.
contract Deploy is Script {
    function run() external returns (Game game) {
        address admin = vm.envOr("ADMIN", msg.sender);
        vm.startBroadcast();
        Game impl = new Game();
        game = Game(
            address(new ERC1967Proxy(address(impl), abi.encodeCall(Game.initialize, (admin))))
        );
        PasskeyDirectory directory = new PasskeyDirectory();
        vm.stopBroadcast();
        console.log("Game proxy:", address(game));
        console.log("PasskeyDirectory:", address(directory));
        console.log("implementation:", address(impl));
        console.log("admin:", admin);
    }
}
