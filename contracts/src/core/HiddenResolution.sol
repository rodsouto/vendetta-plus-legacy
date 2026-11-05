// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// Receipt state for the opt-in hidden v2 protocol, stored per mission in Game.
struct HiddenResolutionState {
    bytes32 statement;
    uint40 arrival;
    uint64 seq;
    uint8 status;
    bool consumed;
    bytes plain;
}

/// Mirrors sim/hidden-resolution.ts. Only a certificate-verifying adapter may record evidence.
/// Receiving evidence does not drain queues; the caller must guard dependencies before consume.
library HiddenResolution {
    uint8 internal constant PENDING = 1;
    uint8 internal constant VALID = 2;
    uint8 internal constant INVALID = 3;
    error ResolutionAlreadyInitialized();
    error ResolutionUnknown();
    error ResolutionStatementMismatch();
    error ResolutionConflict();
    error ResolutionInvalidPlain();
    error ResolutionPending();
    error ResolutionNotDue();
    error ResolutionConsumed();

    function initialize(
        HiddenResolutionState storage s,
        bytes32 statement,
        uint40 arrival,
        uint64 seq
    ) internal {
        if (s.status != 0) revert ResolutionAlreadyInitialized();
        s.statement = statement;
        s.arrival = arrival;
        s.seq = seq;
        s.status = PENDING;
    }

    function recordVerified(
        HiddenResolutionState storage s,
        bytes32 statement,
        bool valid,
        bytes memory plain
    ) internal returns (bool changed) {
        if (s.status == 0) revert ResolutionUnknown();
        if (s.statement != statement) revert ResolutionStatementMismatch();
        if (valid ? (plain.length != 37 || plain[0] != bytes1(uint8(2))) : plain.length != 0) {
            revert ResolutionInvalidPlain();
        }
        uint8 status = valid ? VALID : INVALID;
        if (s.status != PENDING) {
            if (s.status != status || keccak256(s.plain) != keccak256(plain)) {
                revert ResolutionConflict();
            }
            return false;
        }
        s.status = status;
        s.plain = plain;
        return true;
    }

    function consume(HiddenResolutionState storage s)
        internal
        returns (uint8 status, uint40 arrival, uint64 seq, bytes memory plain)
    {
        if (s.status == 0) revert ResolutionUnknown();
        if (s.consumed) revert ResolutionConsumed();
        if (s.status == PENDING) revert ResolutionPending();
        if (block.timestamp < s.arrival) revert ResolutionNotDue();
        s.consumed = true;
        return (s.status, s.arrival, s.seq, s.plain);
    }
}

/// Per-mission verifier binding. Only admission may choose these addresses.
struct HiddenEvidenceState {
    HiddenResolutionState receipt;
    address openingConsumer;
    address invalidPointConsumer;
    bool cancelled;
}
