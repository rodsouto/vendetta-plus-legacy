// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {GameStorage, CoreState} from "./GameStorage.sol";
import {HiddenEvidence} from "./HiddenEvidence.sol";

/// Mandatory v2 verifier configuration, fixed during Game initialization.
library HiddenAdmission {
    error ResolutionInvalidConsumers();

    /// Initialization-only configuration: every world starts with the same v2 admission path.
    function initialize(address opening, address invalidPoint) internal {
        if (opening.code.length == 0 || invalidPoint.code.length == 0) {
            revert ResolutionInvalidConsumers();
        }
        CoreState storage s = GameStorage.core();
        s.hiddenOpeningConsumer = opening;
        s.hiddenInvalidPointConsumer = invalidPoint;
    }

    function consumers() external view returns (address opening, address invalidPoint) {
        CoreState storage s = GameStorage.core();
        return (s.hiddenOpeningConsumer, s.hiddenInvalidPointConsumer);
    }

    /// Called by the sender in the same transaction that emits this exact packet.
    function bind(uint64 id, bytes memory packet) external {
        CoreState storage s = GameStorage.core();
        HiddenEvidence.bindPacket(id, packet, s.hiddenOpeningConsumer, s.hiddenInvalidPointConsumer);
    }
}
