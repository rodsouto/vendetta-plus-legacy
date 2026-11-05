// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {InvalidPointV2Consumer, IInvalidPointV2Verifier} from "./InvalidPointV2Consumer.sol";
import {Verifier} from "./InvalidPointV2Verifier.sol";

interface InvalidPointVm {
    function readFile(string calldata) external view returns (string memory);
    function parseJsonBytes(string calldata, string calldata) external pure returns (bytes memory);
    function parseJsonBytes32(string calldata, string calldata) external pure returns (bytes32);
    function parseJsonStringArray(string calldata, string calldata) external pure returns (string[] memory);
    function parseUint(string calldata) external pure returns (uint256);
}

contract InvalidPointV2ProofTest {
    InvalidPointVm constant vm = InvalidPointVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    InvalidPointV2Consumer consumer;

    function setUp() public {
        Verifier verifier = new Verifier();
        require(address(verifier).code.length <= 24576, "EIP170 exceeded");
        consumer = new InvalidPointV2Consumer(IInvalidPointV2Verifier(address(verifier)));
    }

    function artifact(string memory path)
        internal
        view
        returns (bytes memory proof, uint256[2] memory x, bytes32 root, bytes32 original)
    {
        string memory raw = vm.readFile(path);
        proof = vm.parseJsonBytes(raw, ".proof");
        root = vm.parseJsonBytes32(raw, ".statement");
        original = vm.parseJsonBytes32(raw, ".originalValidStatement");
        string[] memory words = vm.parseJsonStringArray(raw, ".publicInputs");
        require(words.length == 2, "schema");
        x[0] = vm.parseUint(words[0]);
        x[1] = vm.parseUint(words[1]);
    }

    function reject(bytes32 root, bytes memory proof, uint256[2] memory x, bytes4 selector) internal view {
        (bool ok, bytes memory reason) = address(consumer).staticcall(abi.encodeCall(consumer.check, (root, proof, x)));
        require(!ok && reason.length >= 4 && bytes4(reason) == selector, "wrong rejection");
    }

    function testRealInvalidCompressionCertificate() public view {
        (bytes memory proof, uint256[2] memory x, bytes32 root,) = artifact("./proof.json");
        require(consumer.check(root, proof, x), "flag proof rejected");
    }

    function testRealOrder13Certificate() public view {
        (bytes memory proof, uint256[2] memory x, bytes32 root,) = artifact("./torsion-proof.json");
        require(consumer.check(root, proof, x), "torsion proof rejected");
    }

    function testCannotInvalidateOriginalValidMission() public view {
        (bytes memory proof, uint256[2] memory x,, bytes32 original) = artifact("./proof.json");
        reject(original, proof, x, InvalidPointV2Consumer.WrongStatement.selector);
        x[0] = uint256(original) >> 128;
        x[1] = uint128(uint256(original));
        reject(original, proof, x, InvalidPointV2Consumer.InvalidProof.selector);
    }

    function testRejectsCrossMissionProof() public view {
        (bytes memory proof,,,) = artifact("./proof.json");
        (, uint256[2] memory x, bytes32 root,) = artifact("./torsion-proof.json");
        reject(root, proof, x, InvalidPointV2Consumer.InvalidProof.selector);
    }

    function testRejectsPackedOverflow() public view {
        (bytes memory proof, uint256[2] memory x, bytes32 root,) = artifact("./proof.json");
        x[0] = 1 << 128;
        reject(root, proof, x, InvalidPointV2Consumer.NonCanonicalWord.selector);
    }

    function testMalformedProofGasBounded() public view {
        (bytes memory proof, uint256[2] memory x, bytes32 root,) = artifact("./proof.json");
        proof[0] = bytes1(uint8(proof[0]) ^ 1);
        uint256 start = gasleft();
        reject(root, proof, x, InvalidPointV2Consumer.InvalidProof.selector);
        require(start - gasleft() < 2_100_000, "malformed proof burned unbounded gas");
    }
}
