// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
/// Temporary local acceptance only; no accelerated EVM clock or modified final verifier.
library LocalAcceptanceClock {
    function seconds_(uint256 value) internal view returns (uint256) {
        require(block.chainid == 31337, "Local acceptance clock only");
        if (value == 0) return 0;
        uint256 scaled = value / 100;
        return scaled == 0 ? 1 : scaled;
    }
}
