// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {MissionV2Consumer, IMissionV2Verifier} from "./MissionV2Consumer.sol";
import {Verifier} from "./MissionV2Verifier.sol";

interface MissionProofVm {
    function readFile(string calldata) external view returns (string memory);
    function parseJsonBytes(string calldata, string calldata) external pure returns (bytes memory);
    function parseJsonBytes32(string calldata, string calldata) external pure returns (bytes32);
    function parseJsonStringArray(string calldata, string calldata) external pure returns (string[] memory);
    function parseUint(string calldata) external pure returns (uint256);
}

contract MissionV2ProofTest {
    MissionProofVm constant vm = MissionProofVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MissionV2Consumer consumer;

    function setUp() public {
        Verifier verifier = new Verifier();
        require(address(verifier).code.length <= 24576, "EIP170 exceeded");
        consumer = new MissionV2Consumer(IMissionV2Verifier(address(verifier)));
    }

    function artifact(bool valid)
        internal
        view
        returns (bytes memory proof, uint256[55] memory x, bytes32 root, bytes memory expectedPlain)
    {
        string memory raw = vm.readFile(valid ? "./proof.json" : "./invalid-proof.json");
        proof = vm.parseJsonBytes(raw, ".proof");
        string[] memory words = vm.parseJsonStringArray(raw, ".publicInputs");
        require(words.length == 55, "schema");
        for (uint256 i; i < 55; ++i) {
            x[i] = vm.parseUint(words[i]);
        }
        string memory source = vm.readFile("./vectors.json");
        root = vm.parseJsonBytes32(source, valid ? ".vectors[1].statement" : ".vectors[5].statement");
        expectedPlain = vm.parseJsonBytes(source, valid ? ".vectors[1].rawPlain" : ".vectors[5].rawPlain");
    }

    function begin(uint256[55] memory x) internal returns (bytes32) {
        return consumer.begin(bytes32((x[51] << 128) | x[52]));
    }

    function testRealFullMissionFiveCandidates() public {
        (bytes memory proof, uint256[55] memory x, bytes32 root, bytes memory expectedPlain) = artifact(true);
        bytes32 receipt = begin(x);
        consumer.prefix().advance(receipt, 4);
        (bool ok,) = address(consumer).staticcall(abi.encodeCall(consumer.check, (root, proof, x)));
        require(!ok, "unfinished accepted");
        consumer.prefix().advance(receipt, 1);
        (bool valid, bytes memory plain) = consumer.check(root, proof, x);
        require(valid && keccak256(plain) == keccak256(expectedPlain), "wrong opening");
    }

    function testRealFullMissionWrongCommitmentIsInvalid() public {
        (bytes memory proof, uint256[55] memory x, bytes32 root,) = artifact(false);
        consumer.prefix().advance(begin(x), 128);
        (bool valid, bytes memory plain) = consumer.check(root, proof, x);
        require(!valid && plain.length == 0, "invalid mission returned a message");
    }

    function testRealFullMissionAlteredResultRejected() public {
        (bytes memory proof, uint256[55] memory x, bytes32 root,) = artifact(true);
        consumer.prefix().advance(begin(x), 5);
        x[50] = 0;
        (bool ok,) = address(consumer).staticcall(abi.encodeCall(consumer.check, (root, proof, x)));
        require(!ok, "altered result accepted");
    }

    function testRealFullMissionWrongStatementRejected() public {
        (bytes memory proof, uint256[55] memory x,,) = artifact(true);
        consumer.prefix().advance(begin(x), 5);
        (bool ok,) = address(consumer).staticcall(abi.encodeCall(consumer.check, (bytes32(uint256(7)), proof, x)));
        require(!ok, "wrong mission accepted");
    }

    function testRealFullMissionMalformedProofGasBounded() public {
        (bytes memory proof, uint256[55] memory x, bytes32 root,) = artifact(true);
        consumer.prefix().advance(begin(x), 5);
        proof[0] = bytes1(uint8(proof[0]) ^ 1);
        uint256 start = gasleft();
        (bool ok,) = address(consumer).staticcall(abi.encodeCall(consumer.check, (root, proof, x)));
        require(!ok && start - gasleft() < 2_100_000, "malformed proof accepted or unbounded");
    }
}
