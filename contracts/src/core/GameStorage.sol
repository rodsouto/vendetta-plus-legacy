// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ROOMS, RESEARCH, RESOURCES, TROOPS} from "../generated/VendettaRuleset.sol";

/// A queue item. `finishAt` = 0 while it has not started (B-29: duration is computed at start).
struct QueueItem {
    uint8 index; // room or research index
    uint64 seq; // global creation order: breaks ties between events at the same second (D-08)
    uint40 finishAt;
}

/// A troop batch: paid when queued, delivered whole when it finishes.
struct TrainingItem {
    uint8 troop;
    uint64 seq;
    uint40 finishAt;
    uint64 quantity;
}

uint8 constant ATTACK = 1;
uint8 constant STATION = 2;
uint8 constant TRANSPORT = 3;
uint8 constant OCCUPY = 4;

struct Mission {
    uint64 owner;
    uint64 origin; // building the troops left from and return to
    uint8 kind; // ATTACK, STATION, TRANSPORT, OCCUPY
    bool returning;
    uint8 city; // target
    uint8 neighborhood;
    uint8 slot;
    uint40 start;
    uint40 arrival;
    uint40 duration; // one-way travel time; the return takes the same
    uint64 seq; // order among missions arriving at the same second (D-08)
    uint64[TROOPS] troops;
    uint64[RESOURCES] cargo; // whole resources
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
    uint64[TROOPS] troops; // units at home
    TrainingItem[][2] training; // attack and defense training rooms
}

struct Player {
    address controller;
    uint64 researchBuilding; // building of the research queue, 0 when the queue is empty
    uint32 buildings;
    uint128 centipoints; // rooms of every building + research + troops at home and in missions (B-19)
    uint32 missions; // missions in flight, outbound or returning (B-09)
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
    uint64 nextMission;
    uint64 activeMissions;
    mapping(uint64 => Mission) missions;
    uint64[] heap; // the global mission queue (B-07), see Heap.sol
    mapping(uint64 => uint256) heapPos; // 1-based position in `heap`, 0 = not queued
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
