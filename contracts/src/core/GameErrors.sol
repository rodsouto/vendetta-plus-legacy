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
error OnVacation();
error Suspended();
error TargetOnVacation();
error VacationCooldown();
error MissionsInFlight();
error NotOnVacation();
error ControllerTaken();
error InvalidName();
error NameTaken();
error InFamily();
error NotAllowed();
error UnknownFamily();
error TooManyApplications();
error AlreadyApplied();
error NoApplication();
error AlreadyAtWar();
error NoOffer();
error InvalidOffer();
error TooManyOffers();
error InvalidTrade();

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
    event Battle(
        uint64 indexed mission,
        uint64 indexed attacker,
        uint64 indexed defender,
        uint64 building,
        BattleReport report
    );
    event BuildingOccupied(uint64 indexed building, uint64 indexed player, uint64 mission);
    event BuildingAbandoned(uint64 indexed building, uint64 indexed player);
    event VacationStarted(uint64 indexed player, uint40 until);
    event VacationEnded(uint64 indexed player);
    event PlayerSuspended(uint64 indexed player, uint40 until);
    event PremiumGranted(uint64 indexed player, uint40 until);
    event PlayerTransferred(uint64 indexed player, address from, address to);
    event FamilyCreated(uint64 indexed family, uint64 indexed capo, string tag, string name);
    event FamilyChanged(uint64 indexed family, uint64 indexed player, uint8 rank); // rank 0 = left
    event FamilyDissolved(uint64 indexed family);
    event ApplicationChanged(uint64 indexed family, uint64 indexed player, bool open);
    event WarDeclared(uint64 indexed war, uint64 indexed a, uint64 indexed b);
    event PeaceOffered(uint64 indexed war, uint64 family, uint8 offer);
    event WarEnded(uint64 indexed war, uint64 winner);
    event TradeOffered(uint64 indexed trade, uint64 indexed seller, uint64 indexed buyer);
    event TradeAccepted(uint64 indexed trade);
    event TradeCancelled(uint64 indexed trade);
    event TradeSettled(uint64 indexed trade, uint64 delivered, uint64[RESOURCES] paid);
}
