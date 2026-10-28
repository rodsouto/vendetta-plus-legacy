// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CoreState} from "../../src/core/GameStorage.sol";

/// Never deployed: it declares CoreState at slot 0 so that `forge inspect` prints the full layout of
/// the ERC-7201 namespace (offsets relative to its base slot). scripts/storage-layout.mjs checks it.
contract CoreStateLayout {
    CoreState internal core;
}
