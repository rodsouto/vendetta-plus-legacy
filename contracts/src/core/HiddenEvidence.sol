// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {HiddenResolution, HiddenEvidenceState} from "./HiddenResolution.sol";
import {GameStorage, CoreState, Mission} from "./GameStorage.sol";
import {HiddenContext} from "./HiddenContext.sol";
import {IGameEvents} from "./GameErrors.sol";

interface IHiddenOpeningConsumer {
    function check(bytes32 statement, bytes calldata proof, uint256[55] calldata inputs)
        external
        view
        returns (bool valid, bytes memory plain);
}

interface IHiddenInvalidPointConsumer {
    function check(bytes32 statement, bytes calldata proof, uint256[2] calldata inputs)
        external
        view
        returns (bool invalid);
}

/// Receipt adapter, with no drain or expiry. Bound by the opt-in v2 admission.
library HiddenEvidence {
    error ResolutionInvalidBinding();
    error ResolutionInvalidProof();
    error ResolutionCertificateRequired();
    error ResolutionIdentityMismatch();

    /// Sender calls this with the exact packet emitted by its admission transaction.
    function bindPacket(uint64 id, bytes memory packet, address opening, address invalidPoint)
        internal
    {
        bind(id, HiddenContext.statement(id, packet), opening, invalidPoint);
    }

    function bind(uint64 id, bytes32 statement, address opening, address invalidPoint) internal {
        CoreState storage s = GameStorage.core();
        Mission storage m = s.missions[id];
        if (
            m.owner == 0 || !m.hidden || m.returning || s.heapPos[id] == 0
                || m.start != block.timestamp || m.arrival <= block.timestamp
                || opening.code.length == 0 || invalidPoint.code.length == 0
        ) revert ResolutionInvalidBinding();
        HiddenEvidenceState storage e = s.hiddenEvidence[id];
        HiddenResolution.initialize(e.receipt, statement, m.arrival, m.seq);
        e.openingConsumer = opening;
        e.invalidPointConsumer = invalidPoint;
    }

    function _active(CoreState storage s, uint64 id) private view returns (bool) {
        if (s.hiddenEvidence[id].receipt.status == 0) revert HiddenResolution.ResolutionUnknown();
        Mission storage m = s.missions[id];
        return !s.hiddenEvidence[id].cancelled && m.owner != 0 && m.hidden && !m.returning;
    }

    function getData(uint64 id) external view returns (bytes memory) {
        return abi.encode(GameStorage.core().hiddenEvidence[id]);
    }

    /// The thin Game ABI forwards bytes; proof-specific decoding stays in this linked library.
    function submit(uint64 id, bytes calldata certificate) external returns (bool changed) {
        CoreState storage s = GameStorage.core();
        if (!_active(s, id)) return false;
        (uint8 kind, bytes memory proof, bytes memory encodedInputs) =
            abi.decode(certificate, (uint8, bytes, bytes));
        HiddenEvidenceState storage e = s.hiddenEvidence[id];
        bool valid;
        bytes memory plain;
        if (kind == 1) {
            if (encodedInputs.length != 55 * 32) revert ResolutionInvalidProof();
            uint256[55] memory inputs = abi.decode(encodedInputs, (uint256[55]));
            (valid, plain) =
                IHiddenOpeningConsumer(e.openingConsumer).check(e.receipt.statement, proof, inputs);
        } else if (kind == 2) {
            if (encodedInputs.length != 2 * 32) revert ResolutionInvalidProof();
            uint256[2] memory inputs = abi.decode(encodedInputs, (uint256[2]));
            if (!IHiddenInvalidPointConsumer(e.invalidPointConsumer)
                    .check(e.receipt.statement, proof, inputs)) revert ResolutionInvalidProof();
        } else {
            revert ResolutionInvalidProof();
        }
        changed = HiddenResolution.recordVerified(e.receipt, e.receipt.statement, valid, plain);
        if (changed) emit IGameEvents.HiddenEvidenceRecorded(id, valid);
    }
}
