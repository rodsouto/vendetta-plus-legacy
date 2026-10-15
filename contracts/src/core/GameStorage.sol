// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ROOMS, RESEARCH, RESOURCES} from "../generated/VendettaRuleset.sol";

/// A queue item. `finishAt` = 0 while it has not started (B-29: duration is computed at start).
struct QueueItem {
    uint8 index; // room or research index
    uint64 seq; // global creation order: breaks ties between events at the same second (D-08)
    uint40 finishAt;
}

struct Building {
    uint64 owner;
    uint8 city;
    uint8 neighborhood;
    uint8 slot;
    uint40 lastUpdate;
    uint128 centipoints;
    uint16[ROOMS] levels;
    uint128[RESOURCES] stock; // units of 1/STOCK_SCALE (B-27)
    QueueItem[] roomQueue;
}

struct Player {
    address controller;
    uint64 researchBuilding; // building of the research queue, 0 when the queue is empty
    uint32 buildings;
    uint128 centipoints; // rooms of every building + research (B-19)
    uint16[RESEARCH] research;
    QueueItem[] researchQueue;
}

/// Core state (ERC-7201 namespace "vendetta.storage.core").
struct CoreState {
    uint64 seq;
    uint40 globalPremiumUntil; // B-25: the admin can give premium to every player for a while
    uint64 nextPlayer;
    uint64 nextBuilding;
    mapping(uint64 => Player) players;
    mapping(uint64 => Building) buildings;
    mapping(address => uint64) playerOf;
    mapping(uint256 => uint64) buildingAt; // coordinate key → building
}

library GameStorage {
    // keccak256(abi.encode(uint256(keccak256("vendetta.storage.core")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant CORE_SLOT =
        0x2e855d24af35474e7fcffb8e2883e0dc8ae23c6929e76907fda8751c5fa2b800;

    function core() internal pure returns (CoreState storage s) {
        bytes32 slot = CORE_SLOT;
        assembly {
            s.slot := slot
        }
    }

    function coordKey(uint256 city, uint256 neighborhood, uint256 slot)
        internal
        pure
        returns (uint256)
    {
        return (city << 16) | (neighborhood << 8) | slot;
    }
}
