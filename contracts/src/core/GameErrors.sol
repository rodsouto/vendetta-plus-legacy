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
error BadReveal();
error InvalidCover();
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
error TradeOpen();
error InvalidWithdrawal();
error SharesLeft();
error TooManyTrades();
error NotController();
error InvalidSession();
error SessionTooLong();
error TooManyControllers();
error LastController();
error RemovalPending();
error NoRemoval();
error TransferPending();
error NoTransfer();
error NoInvite();
error TooLate();
error InvalidArrival();
error TooEarly();
error TroopsResting();
error OutOfOrder();

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
    /// A hidden mission (B-22): `MissionSent` carries kind 0 and coordinate 0; the tlock
    /// ciphertext of (kind, target, salt) is only here, never stored.
    event HiddenMissionSent(uint64 indexed mission, bytes32 commit, uint32 cover, bytes ciphertext);
    event MissionRevealed(
        uint64 indexed mission, uint8 kind, uint8 city, uint8 neighborhood, uint8 slot
    );
    /// A due hidden mission nobody revealed yet left the queue for the parked list (B-22).
    event MissionParked(uint64 indexed mission);
    event MissionForfeited(uint64 indexed mission);
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
    event PlayerTransferred(uint64 indexed player, address to);
    event ControllerInvited(
        uint64 indexed player, address indexed controller, bool recovery, uint40 until
    );
    event ControllerAdded(uint64 indexed player, address indexed controller, bool recovery);
    event InviteCancelled(uint64 indexed player, address indexed invited);
    event ControllerRemoved(uint64 indexed player, address indexed controller);
    event SessionInvited(uint64 indexed player, address indexed session, uint40 until);
    event SessionAuthorized(uint64 indexed player, address indexed session, uint40 until);
    event SessionRevoked(uint64 indexed player, address indexed session);
    event ControllerRemovalScheduled(uint64 indexed player, address indexed controller, uint40 at);
    event ControllerRemovalCancelled(uint64 indexed player, address indexed controller);
    event PlayerTransferScheduled(uint64 indexed player, address to, uint40 at);
    event PlayerTransferCancelled(uint64 indexed player);
    event FamilyCreated(uint64 indexed family, uint64 indexed capo, string tag, string name);
    event FamilyChanged(uint64 indexed family, uint64 indexed player, uint8 rank); // rank 0 = left
    event FamilyDissolved(uint64 indexed family);
    event ApplicationChanged(uint64 indexed family, uint64 indexed player, bool open);
    event WarDeclared(uint64 indexed war, uint64 indexed a, uint64 indexed b);
    event PeaceOffered(uint64 indexed war, uint64 family, uint8 offer);
    event WarEnded(uint64 indexed war, uint64 winner);
    /// The terms travel with the event, so the indexer needs no calls to rebuild a trade (B-18).
    /// `from`: the seller's building the goods leave at acceptance; `rate`: the values of the
    /// exchange rate the price matched (B-11).
    event TradeOffered(
        uint64 indexed trade,
        uint64 indexed seller,
        uint64 indexed buyer,
        uint64 from,
        uint8 sold,
        uint64 quantity,
        uint64[RESOURCES] price,
        uint64[RESOURCES] rate
    );
    /// The goods and the deposit are held from now; payments must arrive by `closesAt` (D-19).
    event TradeAccepted(uint64 indexed trade, uint40 closesAt, uint64[RESOURCES] deposit);
    event TradeCancelled(uint64 indexed trade);
    /// A payment naming the trade counted: `paid` so far (B-11).
    event TradePaid(uint64 indexed trade, uint64[RESOURCES] paid);
    /// A party moved `amount` of its shares into one of its buildings (D-19).
    event TradeWithdrawn(uint64 indexed trade, uint64 indexed player, uint64[RESOURCES] amount);
}
