// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {H3Prefix} from "./H3Prefix.sol";

interface IPaginatedKEMVerifier {
    function verifyProof(bytes calldata proof, uint256[17] calldata inputs) external view;
}

/// Research composition only: authenticates a KEM result, NOT beacon identity,
/// message semantics or a mission. No Game caller should treat this as a mission certificate.
contract PaginatedKEM {
    H3Prefix public immutable prefix;
    IPaginatedKEMVerifier public immutable verifier;
    // Bound malformed-point precompile failures, which otherwise consume nearly all forwarded gas.
    uint256 public constant VERIFICATION_GAS = 2_000_000;
    bytes32 public constant VERSION = keccak256("VENDETTA_H3_KEM_CACHE_V1");
    error UnfinishedPrefix();
    error MismatchedScalar();
    error NonCanonicalWord();
    error InvalidProof();

    constructor(IPaginatedKEMVerifier verifier_) {
        if (address(verifier_).code.length == 0) revert InvalidProof();
        verifier = verifier_;
        prefix = new H3Prefix(address(this));
    }

    // A generic cache: no caller chooses a mission's preimage or locks a mission.
    // Publishing pre before release discloses the message; keepers derive it only after the beacon.
    function begin(bytes32 pre) external returns (bytes32 receipt) {
        if (prefix.contextInitialized(pre)) return prefix.receiptForContext(pre);
        return prefix.begin(pre, VERSION, pre);
    }

    function check(bytes calldata proof, uint256[17] calldata inputs) external view returns (bool capsuleValid) {
        // Exact schema of PaginatedCapsuleCircuit, preserving 256-bit values as 128-bit limbs.
        for (uint256 i; i < inputs.length; ++i) {
            if (i == 12) {
                if (inputs[i] > 1) revert NonCanonicalWord();
            } else if (inputs[i] >> 128 != 0) {
                revert NonCanonicalWord();
            }
        }
        bytes32 pre = bytes32((inputs[13] << 128) | inputs[14]);
        bytes32 receipt = prefix.receiptForContext(pre);
        (bytes32 storedPre, uint256 scalar,,, uint8 status) = prefix.states(receipt);
        if (status != prefix.ACCEPTED() || storedPre != pre) revert UnfinishedPrefix();
        if (scalar != ((inputs[15] << 128) | inputs[16])) revert MismatchedScalar();
        try verifier.verifyProof{gas: VERIFICATION_GAS}(proof, inputs) {}
        catch {
            revert InvalidProof();
        }
        return inputs[12] == 1;
    }
}
