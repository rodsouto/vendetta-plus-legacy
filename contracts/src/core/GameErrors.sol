// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// Same names as packages/rules/src/sim/errors.ts, so differential tests compare failures.
error AlreadyRegistered();
error InvalidCoordinate();
error SlotTaken();
error NotRegistered();
error NotOwner();
error UnknownEntity();
error RequirementsNotMet();
error QueueFull();
error CannotAfford();
error TimingRoomRequired();
error ResearchElsewhere();
error NothingToCancel();

/// Events for the indexer (B-18).
interface IGameEvents {
    event PlayerRegistered(uint64 indexed player, address indexed controller, uint64 building);
    event RoomQueued(uint64 indexed building, uint8 room, uint64 seq);
    event RoomStarted(uint64 indexed building, uint8 room, uint40 finishAt);
    event RoomDropped(uint64 indexed building, uint8 room);
    event RoomCompleted(uint64 indexed building, uint8 room, uint16 level);
    event RoomCancelled(uint64 indexed building, uint8 room, uint256 position);
    event ResearchQueued(uint64 indexed player, uint64 building, uint8 research, uint64 seq);
    event ResearchStarted(uint64 indexed player, uint8 research, uint40 finishAt);
    event ResearchDropped(uint64 indexed player, uint8 research);
    event ResearchCompleted(uint64 indexed player, uint8 research, uint16 level);
    event ResearchCancelled(uint64 indexed player, uint8 research, uint256 position);
    event GlobalPremiumSet(uint40 until);
}
