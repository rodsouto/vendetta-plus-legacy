// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {MissionV2Consumer, IMissionV2Verifier} from "./MissionV2Consumer.sol";
import {H3Prefix} from "./H3Prefix.sol";

interface CacheVm {
    function mockCall(address, bytes calldata, bytes calldata) external;
}

contract MissionV2VerifierStub is IMissionV2Verifier {
    function verifyProof(bytes calldata proof, uint256[55] calldata) external pure {
        require(proof.length == 1, "stub reject");
    }
}

contract MissionV2ConsumerTest {
    CacheVm constant vm = CacheVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 constant PRE = 0x11766807f9a9fc7d634328fff3cbd98d6fab560182e870342242753bb53ce06a;
    uint256 constant SCALAR = 45007087982830307960066972967956446568514081403645713084635648904263614511513;
    bytes32 constant ROOT = keccak256("stored mission statement");
    MissionV2Consumer consumer;

    function setUp() public {
        consumer = new MissionV2Consumer(new MissionV2VerifierStub());
    }

    function inputs() internal pure returns (uint256[55] memory x) {
        x[14] = 1;
        x[45] = 1;
        x[46] = 1;
        x[50] = 1;
        x[48] = uint256(ROOT) >> 128;
        x[49] = uint128(uint256(ROOT));
        x[51] = uint256(PRE) >> 128;
        x[52] = uint128(uint256(PRE));
        x[53] = SCALAR >> 128;
        x[54] = uint128(SCALAR);
    }

    function reject(bytes32 root, bytes memory proof, uint256[55] memory x, bytes4 selector) internal view {
        (bool ok, bytes memory reason) = address(consumer).staticcall(abi.encodeCall(consumer.check, (root, proof, x)));
        require(!ok && reason.length >= 4 && bytes4(reason) == selector, "wrong rejection");
    }

    function testAcceptedPrefixAndOriginalStatement() public {
        uint256[55] memory x = inputs();
        bytes32 receipt = consumer.begin(PRE);
        consumer.prefix().advance(receipt, 4);
        reject(ROOT, hex"01", x, MissionV2Consumer.UnfinishedPrefix.selector);
        consumer.prefix().advance(receipt, 1);
        (bool valid, bytes memory plain) = consumer.check(ROOT, hex"01", x);
        require(valid && plain.length == 37, "wrong result");
        reject(bytes32(uint256(7)), hex"01", x, MissionV2Consumer.WrongStatement.selector);
    }

    function testAcceptedPrefixRejectsFakeZeroScalarInvalidity() public {
        uint256[55] memory x = inputs();
        consumer.prefix().advance(consumer.begin(PRE), 5);
        x[53] = 0;
        x[54] = 0;
        x[14] = 0;
        x[50] = 0;
        reject(ROOT, hex"01", x, MissionV2Consumer.MismatchedScalar.selector);
    }

    function testExhaustionPolicyWithMockedReceipt() public {
        // No real preimage rejecting all 65534 candidates is claimed. This tests
        // consumer policy only; H3Prefix's exact exhaustion has separate mock tests.
        bytes32 receipt = consumer.begin(PRE);
        H3Prefix cache = consumer.prefix();
        vm.mockCall(
            address(cache),
            abi.encodeCall(cache.states, (receipt)),
            abi.encode(PRE, uint256(0), uint32(65535), uint32(0), uint8(3))
        );
        uint256[55] memory x = inputs();
        reject(ROOT, hex"01", x, MissionV2Consumer.InvalidExhaustionClaim.selector);
        x[53] = 0;
        x[54] = 0;
        x[14] = 0;
        x[50] = 0;
        (bool valid, bytes memory plain) = consumer.check(ROOT, hex"01", x);
        require(!valid && plain.length == 0, "exhaustion returned a message");
        x[50] = 1;
        reject(ROOT, hex"01", x, MissionV2Consumer.InvalidExhaustionClaim.selector);
    }

    function testCanonicalWordsAndProofRequired() public {
        uint256[55] memory x = inputs();
        consumer.prefix().advance(consumer.begin(PRE), 5);
        x[51] = 1 << 128;
        reject(ROOT, hex"01", x, MissionV2Consumer.NonCanonicalWord.selector);
        x = inputs();
        reject(ROOT, hex"", x, MissionV2Consumer.InvalidProof.selector);
    }

    function testPlaintextPackingPreservesSaltSuffix() public {
        uint256[55] memory x = inputs();
        consumer.prefix().advance(consumer.begin(PRE), 5);
        x[42] = uint128(bytes16(hex"02010101020000000000000000000000"));
        x[44] = uint128(bytes16(hex"00000000050000000000000000000000"));
        (, bytes memory plain) = consumer.check(ROOT, hex"01", x);
        require(
            keccak256(plain)
                == keccak256(hex"02010101020000000000000000000000000000000000000000000000000000000000000005"),
            "packed bytes differ"
        );
    }
}
