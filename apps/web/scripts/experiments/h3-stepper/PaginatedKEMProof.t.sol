// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PaginatedKEM, IPaginatedKEMVerifier} from "./PaginatedKEM.sol";
import {Verifier} from "./PaginatedVerifier.sol";

interface ProofVm {
    function readFile(string calldata) external view returns (string memory);
    function parseJsonBytes(string calldata, string calldata) external pure returns (bytes memory);
    function parseJsonStringArray(string calldata, string calldata) external pure returns (string[] memory);
    function parseUint(string calldata) external pure returns (uint256);
}

contract PaginatedKEMProofTest {
    ProofVm constant vm = ProofVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    PaginatedKEM adapter;

    function setUp() public {
        Verifier verifier = new Verifier();
        require(address(verifier).code.length <= 24576, "EIP170 exceeded");
        adapter = new PaginatedKEM(IPaginatedKEMVerifier(address(verifier)));
    }

    function artifact(string memory path) internal view returns (bytes memory proof, uint256[17] memory inputs) {
        string memory raw = vm.readFile(path);
        proof = vm.parseJsonBytes(raw, ".proof");
        string[] memory values = vm.parseJsonStringArray(raw, ".publicInputs");
        require(values.length == 17, "schema");
        for (uint256 i; i < 17; ++i) {
            inputs[i] = vm.parseUint(values[i]);
        }
    }

    function begin(uint256[17] memory inputs) internal returns (bytes32) {
        return adapter.begin(bytes32((inputs[13] << 128) | inputs[14]));
    }

    function testRealProofFiveCandidates() public {
        (bytes memory proof, uint256[17] memory inputs) = artifact("./proof.json");
        bytes32 receipt = begin(inputs);
        adapter.prefix().advance(receipt, 4);
        (bool ok,) = address(adapter).staticcall(abi.encodeCall(adapter.check, (proof, inputs)));
        require(!ok, "unfinished accepted");
        adapter.prefix().advance(receipt, 1);
        require(adapter.check(proof, inputs), "real valid proof");
    }

    function testRealProofInvalidCapsule() public {
        (bytes memory proof, uint256[17] memory inputs) = artifact("./invalid-proof.json");
        bytes32 receipt = begin(inputs);
        adapter.prefix().advance(receipt, 128);
        require(!adapter.check(proof, inputs), "invalid became valid");
    }

    function testRealProofRejectsAlteredProof() public {
        (bytes memory proof, uint256[17] memory inputs) = artifact("./proof.json");
        adapter.prefix().advance(begin(inputs), 5);
        proof[0] = bytes1(uint8(proof[0]) ^ 1);
        uint256 start = gasleft();
        (bool ok,) = address(adapter).staticcall(abi.encodeCall(adapter.check, (proof, inputs)));
        require(!ok, "altered proof accepted");
        require(start - gasleft() < 2_100_000, "malformed proof burned unbounded gas");
    }

    function testRealProofRejectsAlteredClaim() public {
        (bytes memory proof, uint256[17] memory inputs) = artifact("./proof.json");
        adapter.prefix().advance(begin(inputs), 5);
        inputs[12] = 0;
        (bool ok,) = address(adapter).staticcall(abi.encodeCall(adapter.check, (proof, inputs)));
        require(!ok, "altered result accepted");
    }
}
