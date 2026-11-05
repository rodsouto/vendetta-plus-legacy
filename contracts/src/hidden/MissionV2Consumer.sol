// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {H3Prefix} from "./H3Prefix.sol";

interface IMissionV2Verifier {
    function verifyProof(bytes calldata proof, uint256[55] calldata inputs) external view;
}

/// Certificate consumer. Game supplies its stored immutable statement,
/// pin the verifier/version, and apply historical ordering before executing effects.
contract MissionV2Consumer {
    H3Prefix public immutable prefix;
    IMissionV2Verifier public immutable verifier;
    bytes32 public constant VERSION = keccak256("VENDETTA_H3_MISSION_V2");
    uint256 public constant VERIFICATION_GAS = 2_000_000;
    error InvalidProof();
    error NonCanonicalWord();
    error WrongStatement();
    error UnfinishedPrefix();
    error MismatchedScalar();
    error InvalidExhaustionClaim();

    constructor(IMissionV2Verifier verifier_) {
        if (address(verifier_).code.length == 0) revert InvalidProof();
        verifier = verifier_;
        prefix = new H3Prefix(address(this));
    }

    function begin(bytes32 pre) external returns (bytes32) {
        if (prefix.contextInitialized(pre)) return prefix.receiptForContext(pre);
        return prefix.begin(pre, VERSION, pre);
    }

    function check(bytes32 expectedStatement, bytes calldata proof, uint256[55] calldata x)
        external
        view
        returns (bool valid, bytes memory plain)
    {
        // Exact public schema of MissionV2Circuit, checked against the Go witness.
        for (uint256 i; i < 55; ++i) {
            if (i == 14 || i == 45 || i == 46 || i == 50) {
                if (x[i] > 1) revert NonCanonicalWord();
            } else if (x[i] >> 128 != 0) {
                revert NonCanonicalWord();
            }
        }
        if (bytes32((x[48] << 128) | x[49]) != expectedStatement) revert WrongStatement();
        bytes32 pre = bytes32((x[51] << 128) | x[52]);
        bytes32 receipt = prefix.receiptForContext(pre);
        (bytes32 storedPre, uint256 scalar,,, uint8 status) = prefix.states(receipt);
        if (storedPre != pre) revert UnfinishedPrefix();
        uint256 supplied = (x[53] << 128) | x[54];
        if (status == prefix.ACCEPTED()) {
            if (scalar != supplied) revert MismatchedScalar();
        } else if (status == prefix.EXHAUSTED()) {
            // Exhaustion has no accepted scalar. Zero is a proof placeholder, not
            // an H3 result; rP is identity, while this relation requires nonidentity U.
            if (supplied != 0 || x[14] != 0 || x[50] != 0) revert InvalidExhaustionClaim();
        } else {
            revert UnfinishedPrefix();
        }
        try verifier.verifyProof{gas: VERIFICATION_GAS}(proof, x) {}
        catch {
            revert InvalidProof();
        }
        valid = x[50] == 1;
        if (!valid) return (false, new bytes(0));
        plain = abi.encodePacked(
            bytes16(uint128(x[42])), bytes16(uint128(x[43])), bytes5(bytes16(uint128(x[44])))
        );
    }
}
