// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Test} from "forge-std/Test.sol";
import {MissionV2Consumer, IMissionV2Verifier} from "../../src/hidden/MissionV2Consumer.sol";
import {
    InvalidPointV2Consumer,
    IInvalidPointV2Verifier
} from "../../src/hidden/InvalidPointV2Consumer.sol";
import {Verifier as OpeningVerifier} from "../fixtures/hidden/OpeningVerifier.sol";
import {Verifier as PointVerifier} from "../fixtures/hidden/PointVerifier.sol";

/// Reuses archived real proofs to validate the canonical consumer code, not a new Game context.
contract HiddenConsumersTest is Test {
    function opening(string memory name) internal returns (bool valid, bytes memory plain) {
        string memory json = vm.readFile(
            string.concat("../docs/benchmarks/timelock-opening/mission-v2-proof/", name)
        );
        string[] memory values = vm.parseJsonStringArray(json, ".publicInputs");
        uint256[55] memory x;
        for (uint256 i; i < 55; ++i) {
            x[i] = vm.parseUint(values[i]);
        }
        MissionV2Consumer consumer =
            new MissionV2Consumer(IMissionV2Verifier(address(new OpeningVerifier())));
        bytes32 pre = bytes32((x[51] << 128) | x[52]);
        consumer.begin(pre);
        consumer.prefix().advance(consumer.prefix().receiptForContext(pre), 128);
        return consumer.check(bytes32((x[48] << 128) | x[49]), vm.parseJsonBytes(json, ".proof"), x);
    }

    function testArchivedRealOpeningInCanonicalConsumer() public {
        (bool valid, bytes memory plain) = opening("proof.json");
        assertTrue(valid);
        assertEq(plain, abi.encodePacked(bytes5(hex"0201010102"), bytes32(uint256(5))));
    }

    function testArchivedRealInvalidOpeningInCanonicalConsumer() public {
        (bool valid, bytes memory plain) = opening("invalid-proof.json");
        assertFalse(valid);
        assertEq(plain.length, 0);
    }

    function testArchivedRealInvalidPointInCanonicalConsumer() public {
        string memory json =
            vm.readFile("../docs/benchmarks/timelock-opening/invalid-point-proof/proof.json");
        string[] memory values = vm.parseJsonStringArray(json, ".publicInputs");
        uint256[2] memory x = [vm.parseUint(values[0]), vm.parseUint(values[1])];
        InvalidPointV2Consumer consumer =
            new InvalidPointV2Consumer(IInvalidPointV2Verifier(address(new PointVerifier())));
        assertTrue(
            consumer.check(
                vm.parseJsonBytes32(json, ".statement"), vm.parseJsonBytes(json, ".proof"), x
            )
        );
        vm.expectRevert(InvalidPointV2Consumer.WrongStatement.selector);
        consumer.check(bytes32(0), vm.parseJsonBytes(json, ".proof"), x);
    }
}
