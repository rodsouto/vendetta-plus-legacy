// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {GameStorage, Mission} from "./GameStorage.sol";

/// Pinned research v2 profile used by the archived full-mission circuit.
/// Internal admission building block; consumer authorization belongs to HiddenAdmission.
library HiddenContext {
    error ResolutionInvalidPacket();
    error ResolutionInvalidContext();

    bytes32 internal constant NETWORK =
        0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971;
    bytes32 internal constant PUBLIC_KEY_HASH =
        0xb667bf8a4eb1ee843c15c266cea12de2f2b23a108086fcc414c31b0c4b8949fc;
    // keccak256(abi.encode(keccak256("vendetta-opening-research-v1"), RULES_DIGEST)).
    // The cross-language tests recompute this from the rules/config source data.
    bytes32 internal constant PROFILE =
        0x92753eff1c77eda7c8a75a867f4ec66bbe983b31f5cc379974fea3e3b1e35bdd;

    function packetRound(bytes memory packet, uint40 arrival) internal pure returns (uint64 round) {
        if (packet.length != 273) revert ResolutionInvalidPacket();
        bytes4 magic;
        bytes32 network;
        assembly ("memory-safe") {
            magic := mload(add(packet, 32))
            network := mload(add(packet, 36))
            round := shr(192, mload(add(packet, 68)))
        }
        if (
            magic != 0x56444832 || network != NETWORK || round == 0 || round > (uint64(1) << 53) - 1
        ) revert ResolutionInvalidPacket();
        if (1692803367 + (uint256(round) - 1) * 3 != uint256(arrival) + 15) {
            revert ResolutionInvalidContext();
        }
        // Do not reject U, MAC, ciphertext or plaintext here: certified invalidity handles them.
    }

    /// Every mission field comes from storage; chain and Game address come from execution context.
    function encode(uint64 id, bytes memory packet) internal view returns (bytes memory) {
        Mission storage m = GameStorage.core().missions[id];
        if (m.owner == 0 || !m.hidden || m.returning) revert ResolutionInvalidContext();
        uint64 round = packetRound(packet, m.arrival);
        uint256[20] memory words;
        words[0] = uint256(keccak256("VENDETTA_OPENING_V2"));
        words[1] = block.chainid;
        words[2] = uint160(address(this));
        words[3] = id;
        words[4] = uint256(PROFILE);
        words[5] = m.owner;
        words[6] = m.fromCity;
        words[7] = m.fromNeighborhood;
        words[8] = m.fromSlot;
        words[9] = m.cover;
        for (uint256 i; i < 4; ++i) {
            words[10 + i] = m.cargo[i];
        }
        words[14] = m.arrival;
        words[15] = round;
        words[16] = uint256(NETWORK);
        words[17] = uint256(PUBLIC_KEY_HASH);
        words[18] = uint256(m.commit);
        words[19] = uint256(keccak256(packet));
        return abi.encode(words);
    }

    function statement(uint64 id, bytes memory packet) internal view returns (bytes32) {
        return keccak256(encode(id, packet));
    }
}
