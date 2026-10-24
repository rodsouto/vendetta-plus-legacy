// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CoreState} from "../src/core/GameStorage.sol";

/// Compiler-provided offsets for local benchmark fixtures. Never deployed.
/// `forge inspect GasBenchmarkLayout storageLayout --json` keeps the benchmark independent
/// of hard-coded struct offsets when the game's state changes.
contract GasBenchmarkLayout {
    CoreState internal core;
}
