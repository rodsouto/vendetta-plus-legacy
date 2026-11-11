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
    function openingData(string memory name)
        internal
        returns (
            MissionV2Consumer consumer,
            bytes32 statement,
            bytes memory proof,
            uint256[55] memory x
        )
    {
        string memory json = vm.readFile(
            string.concat("../docs/benchmarks/timelock-opening/mission-v2-proof/", name)
        );
        string[] memory values = vm.parseJsonStringArray(json, ".publicInputs");
        for (uint256 i; i < 55; ++i) {
            x[i] = vm.parseUint(values[i]);
        }
        consumer = new MissionV2Consumer(IMissionV2Verifier(address(new OpeningVerifier())));
        bytes32 pre = bytes32((x[51] << 128) | x[52]);
        consumer.begin(pre);
        consumer.prefix().advance(consumer.prefix().receiptForContext(pre), 128);
        return (consumer, bytes32((x[48] << 128) | x[49]), vm.parseJsonBytes(json, ".proof"), x);
    }

    function opening(string memory name) internal returns (bool valid, bytes memory plain) {
        (MissionV2Consumer consumer, bytes32 statement, bytes memory proof, uint256[55] memory x) =
            openingData(name);
        return consumer.check(statement, proof, x);
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

    function testEveryOpeningWordMustBeCanonical() public {
        (MissionV2Consumer consumer, bytes32 statement, bytes memory proof, uint256[55] memory x) =
            openingData("proof.json");
        for (uint256 i; i < 55; ++i) {
            uint256 original = x[i];
            x[i] = i == 14 || i == 45 || i == 46 || i == 50 ? 2 : uint256(1) << 128;
            vm.expectRevert(MissionV2Consumer.NonCanonicalWord.selector);
            consumer.check(statement, proof, x);
            x[i] = original;
        }
    }

    function testRealOpeningCannotChangeAnyPublicWord() public {
        (MissionV2Consumer consumer, bytes32 statement, bytes memory proof, uint256[55] memory x) =
            openingData("proof.json");
        for (uint256 i; i < 55; ++i) {
            x[i] ^= 1;
            vm.expectRevert();
            consumer.check(statement, proof, x);
            x[i] ^= 1;
        }
        vm.expectRevert(MissionV2Consumer.InvalidProof.selector);
        consumer.check(statement, hex"", x);
        proof[0] ^= bytes1(uint8(1));
        vm.expectRevert(MissionV2Consumer.InvalidProof.selector);
        consumer.check(statement, proof, x);
    }

    function testIncompleteUnknownAndFakeZeroH3CannotForfeit() public {
        (MissionV2Consumer consumer, bytes32 statement, bytes memory proof, uint256[55] memory x) =
            openingData("proof.json");
        uint256 originalPre = x[51];
        x[51] ^= 1;
        vm.expectRevert(MissionV2Consumer.UnfinishedPrefix.selector);
        consumer.check(statement, proof, x);
        consumer.begin(bytes32((x[51] << 128) | x[52]));
        vm.expectRevert(MissionV2Consumer.UnfinishedPrefix.selector);
        consumer.check(statement, proof, x);
        x[51] = originalPre;
        x[53] = 0;
        x[54] = 0;
        x[14] = 0;
        x[50] = 0;
        vm.expectRevert(MissionV2Consumer.MismatchedScalar.selector);
        consumer.check(statement, proof, x);
    }

    function testExhaustionPolicyWithModeledReceipt() public {
        (MissionV2Consumer consumer, bytes32 statement, bytes memory proof, uint256[55] memory x) =
            openingData("invalid-proof.json");
        bytes32 pre = bytes32((x[51] << 128) | x[52]);
        bytes32 receipt = consumer.prefix().receiptForContext(pre);
        // No SHA preimage is claimed. Mock only the terminal receipt, not the verifier.
        vm.mockCall(
            address(consumer.prefix()),
            abi.encodeWithSignature("states(bytes32)", receipt),
            abi.encode(pre, uint256(0), uint32(65535), uint32(0), uint8(3))
        );
        vm.expectRevert(MissionV2Consumer.InvalidExhaustionClaim.selector);
        consumer.check(statement, proof, x);
        x[53] = 0;
        x[54] = 0;
        x[14] = 0;
        // The archived proof is NOT an exhaustion proof; it must still fail cryptography.
        vm.expectRevert(MissionV2Consumer.InvalidProof.selector);
        consumer.check(statement, proof, x);
        x[50] = 1;
        vm.expectRevert(MissionV2Consumer.InvalidExhaustionClaim.selector);
        consumer.check(statement, proof, x);
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
        bytes memory proof = vm.parseJsonBytes(json, ".proof");
        bytes32 statement = vm.parseJsonBytes32(json, ".statement");
        for (uint256 i; i < 2; ++i) {
            uint256 original = x[i];
            x[i] = uint256(1) << 128;
            vm.expectRevert(InvalidPointV2Consumer.NonCanonicalWord.selector);
            consumer.check(statement, proof, x);
            x[i] = original ^ 1;
            vm.expectRevert(InvalidPointV2Consumer.WrongStatement.selector);
            consumer.check(statement, proof, x);
            // Coherently repin the statement: the proof still cannot cross contexts.
            vm.expectRevert(InvalidPointV2Consumer.InvalidProof.selector);
            consumer.check(bytes32((x[0] << 128) | x[1]), proof, x);
            x[i] = original;
        }
        vm.expectRevert(InvalidPointV2Consumer.InvalidProof.selector);
        consumer.check(statement, hex"", x);
        proof[0] ^= bytes1(uint8(1));
        vm.expectRevert(InvalidPointV2Consumer.InvalidProof.selector);
        consumer.check(statement, proof, x);
    }
}
