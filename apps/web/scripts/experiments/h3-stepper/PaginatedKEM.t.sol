// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PaginatedKEM, IPaginatedKEMVerifier} from "./PaginatedKEM.sol";
import {H3Prefix} from "./H3Prefix.sol";

// Adapter tests use a fake verifier; they do not claim an EVM Groth16 verification.
contract KEMVerifierStub is IPaginatedKEMVerifier {
    bool public accept = true;

    function setAccept(bool value) external {
        accept = value;
    }

    function verifyProof(bytes calldata, uint256[17] calldata) external view {
        require(accept, "invalid proof");
    }
}

contract PaginatedKEMTest {
    bytes32 constant PRE = 0x11766807f9a9fc7d634328fff3cbd98d6fab560182e870342242753bb53ce06a;
    uint256 constant SCALAR = 45007087982830307960066972967956446568514081403645713084635648904263614511513;
    KEMVerifierStub verifier;
    PaginatedKEM adapter;

    function setUp() public {
        verifier = new KEMVerifierStub();
        adapter = new PaginatedKEM(verifier);
    }

    function inputs() internal pure returns (uint256[17] memory x) {
        x[12] = 1;
        x[13] = uint256(PRE) >> 128;
        x[14] = uint128(uint256(PRE));
        x[15] = SCALAR >> 128;
        x[16] = uint128(SCALAR);
    }

    function rejected(uint256[17] memory x, bytes4 selector) internal view {
        bytes memory proof = hex"00";
        (bool ok, bytes memory reason) = address(adapter).staticcall(abi.encodeCall(adapter.check, (proof, x)));
        require(!ok && reason.length >= 4 && bytes4(reason) == selector, "wrong rejection");
    }

    function complete() internal {
        bytes32 receipt = adapter.begin(PRE);
        adapter.prefix().advance(receipt, 5);
    }

    function testRequiresCompletedExactPrefix() public {
        uint256[17] memory x = inputs();
        rejected(x, PaginatedKEM.UnfinishedPrefix.selector);
        bytes32 receipt = adapter.begin(PRE);
        adapter.prefix().advance(receipt, 4);
        rejected(x, PaginatedKEM.UnfinishedPrefix.selector);
        adapter.prefix().advance(receipt, 1);
        bytes memory proof = hex"00";
        require(adapter.check(proof, x), "valid");
    }

    function testCacheCannotBeReboundOrReset() public {
        bytes32 receipt = adapter.begin(PRE);
        adapter.prefix().advance(receipt, 4);
        require(adapter.begin(PRE) == receipt, "idempotent");
        (,, uint32 next,,) = adapter.prefix().states(receipt);
        require(next == 5, "reset");
        adapter.begin(bytes32(uint256(123)));
        (,, next,,) = adapter.prefix().states(receipt);
        require(next == 5, "cross cache");
    }

    function testRejectsScalarSubstitutionIncludingZeroFalseClaim() public {
        complete();
        uint256[17] memory x = inputs();
        x[16]++;
        rejected(x, PaginatedKEM.MismatchedScalar.selector);
        x[12] = 0;
        x[15] = 0;
        x[16] = 0;
        rejected(x, PaginatedKEM.MismatchedScalar.selector);
    }

    function testRejectsPreSubstitution() public {
        complete();
        uint256[17] memory x = inputs();
        x[14]++;
        rejected(x, PaginatedKEM.UnfinishedPrefix.selector);
    }

    function testRejectsPackedOverflowAndNonBoolean() public {
        complete();
        uint256[17] memory x = inputs();
        x[14] = 1 << 128;
        rejected(x, PaginatedKEM.NonCanonicalWord.selector);
        x = inputs();
        x[12] = 2;
        rejected(x, PaginatedKEM.NonCanonicalWord.selector);
    }

    function testRequiresVerifierAndPreservesFalseResult() public {
        complete();
        uint256[17] memory x = inputs();
        verifier.setAccept(false);
        rejected(x, PaginatedKEM.InvalidProof.selector);
        verifier.setAccept(true);
        x[12] = 0;
        bytes memory proof = hex"00";
        require(!adapter.check(proof, x), "false result became true");
    }
}
