// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../../script/Deploy.s.sol";
import {Game} from "../../src/Game.sol";

contract DeployPolicyTest is Test {
    function testRejectsProductionBeforeReadingEnvironment() public {
        Deploy deploy = new Deploy();
        uint256[4] memory chains = [uint256(100), uint256(1), uint256(10200), uint256(0)];
        for (uint256 i; i < chains.length; i++) {
            vm.chainId(chains[i]);
            vm.expectRevert(bytes("Hidden v2 production setup approval is not implemented"));
            deploy.run();
        }
    }

    function testLocalDeploymentRemainsAvailable() public {
        address consumer = address(0x1234);
        vm.etch(consumer, hex"00");
        vm.setEnv("DEPLOYER_PRIVATE_KEY", "0");
        vm.setEnv("HIDDEN_OPENING_CONSUMER", vm.toString(consumer));
        vm.setEnv("HIDDEN_INVALID_POINT_CONSUMER", vm.toString(consumer));
        vm.setEnv("ADMIN", vm.toString(address(this)));
        vm.setEnv("OPERATOR", vm.toString(address(this)));
        vm.setEnv("ARBITER", vm.toString(address(this)));
        uint256[2] memory chains = [uint256(31337), uint256(1337)];
        for (uint256 i; i < chains.length; i++) {
            vm.chainId(chains[i]);
            Game game = new Deploy().run();
            assertGt(address(game).code.length, 0);
        }
    }
}
