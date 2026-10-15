// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {TROOPS, RESEARCH, RESOURCES} from "../generated/VendettaRuleset.sol";

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
error Backlog();
error InvalidMission();
error OwnTarget();
error InvalidTroops();
error NoUnits();
error TooManyMissions();
error CargoExceeded();
error NotRecallable();
error LastBuilding();

struct BattleReport {
    uint64[TROOPS] attacker;
    uint64[TROOPS] defender;
    uint16[RESEARCH] attackerResearch;
    uint16[RESEARCH] defenderResearch;
    uint256 attackerPct;
    uint256 defenderPct;
    uint256[TROOPS] attackerSurvivors;
    uint256[TROOPS] defenderSurvivors;
    uint256[RESOURCES] loot;
}

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
    event TroopsQueued(uint64 indexed building, uint8 troop, uint64 quantity, uint64 seq);
    event TroopsTrained(uint64 indexed building, uint8 troop, uint64 quantity);
    event TrainingCancelled(uint64 indexed building, uint256 queue, uint256 position);
    event MissionSent(
        uint64 indexed mission,
        uint64 indexed player,
        uint64 origin,
        uint8 kind,
        uint8 city,
        uint8 neighborhood,
        uint8 slot,
        uint40 arrival
    );
    event MissionRecalled(uint64 indexed mission, uint40 arrival);
    event MissionReturning(uint64 indexed mission, uint40 arrival);
    event MissionEnded(uint64 indexed mission);
    /// Battle report (B-18): inputs and totals. Rounds are recomputed off-chain (deterministic).
    event Battle(uint64 indexed mission, uint64 indexed building, BattleReport report);
    event BuildingOccupied(uint64 indexed building, uint64 indexed player, uint64 mission);
    event BuildingAbandoned(uint64 indexed building, uint64 indexed player);
}
