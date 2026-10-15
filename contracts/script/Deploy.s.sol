// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Game} from "../src/Game.sol";
import {PasskeyDirectory} from "../src/accounts/PasskeyDirectory.sol";

/// Deploys the linked libraries (forge does it automatically), the Game implementation and its UUPS
/// proxy, and the ownerless passkey directory (B-15). ADMIN (optional) is the owner, normally the
/// admin Safe (B-17); defaults to the deployer. The deployer is DEPLOYER_PRIVATE_KEY when set (so the
/// key stays off the command line, scripts/deploy-arbitrum.sh), else forge's --private-key/--sender.
contract Deploy is Script {
    function run() external returns (Game game) {
        uint256 key = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        address deployer = key == 0 ? msg.sender : vm.addr(key);
        address admin = vm.envOr("ADMIN", deployer);
        if (key == 0) vm.startBroadcast();
        else vm.startBroadcast(key);
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
