// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Script, console} from "forge-std/Script.sol";
import {Game} from "../src/Game.sol";
import {HiddenConsumerMock} from "../test/helpers/HiddenConsumer.sol";
import {PasskeyDirectory} from "../src/accounts/PasskeyDirectory.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// Explicit test fixture only. The production deployment always requires real consumer addresses.
contract DeployTest is Script {
    function run() external {
        require(block.chainid == 31337 || block.chainid == 1337, "Test chain only");
        vm.startBroadcast();
        HiddenConsumerMock consumer = new HiddenConsumerMock();
        Game impl = new Game();
        Game game = Game(
            address(
                new ERC1967Proxy(
                    address(impl),
                    abi.encodeCall(
                        Game.initialize,
                        (msg.sender, msg.sender, msg.sender, address(consumer), address(consumer))
                    )
                )
            )
        );
        new PasskeyDirectory();
        vm.stopBroadcast();
        console.log("Game proxy:", address(game));
    }
}
