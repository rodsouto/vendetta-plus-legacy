// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {
    Ownable2StepUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {ROOMS, RESEARCH, RESOURCES, TROOPS} from "./generated/VendettaRuleset.sol";
import {Core} from "./core/Core.sol";
import {Training} from "./core/Training.sol";
import {Missions} from "./core/Missions.sol";
import {
    Building,
    Player,
    Mission,
    QueueItem,
    TrainingItem,
    CoreState,
    GameStorage
} from "./core/GameStorage.sol";
import {IGameEvents} from "./core/GameErrors.sol";

/// The game: one UUPS proxy (B-17) whose logic lives in linked libraries (blockchain.md,
/// "Implementation stack"). The owner is the admin Safe.
contract Game is Initializable, UUPSUpgradeable, Ownable2StepUpgradeable, IGameEvents {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) external initializer {
        __Ownable_init(admin);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ------------------------------------------------------------------ actions
    // Every player action first catches up the global mission queue (B-07); with a backlog larger
    // than one transaction can process it reverts with Backlog and the client calls advance().

    modifier drained() {
        Missions.drain();
        _;
    }

    function register(uint256 city, uint256 neighborhood, uint256 slot)
        external
        drained
        returns (uint64)
    {
        return Core.register(msg.sender, city, neighborhood, slot);
    }

    function queueRoom(uint64 building, uint256 room) external drained {
        Core.queueRoom(msg.sender, building, room);
    }

    function queueResearch(uint64 building, uint256 research) external drained {
        Core.queueResearch(msg.sender, building, research);
    }

    function cancelRoom(uint64 building, uint256 position) external drained {
        Core.cancelRoom(msg.sender, building, position);
    }

    function cancelResearch(uint64 building, uint256 position) external drained {
        Core.cancelResearch(msg.sender, building, position);
    }

    function train(uint64 building, uint256 troop, uint256 quantity) external drained {
        Training.train(msg.sender, building, troop, quantity);
    }

    function cancelTraining(uint64 building, uint256 queue, uint256 position) external drained {
        Training.cancel(msg.sender, building, queue, position);
    }

    function sendMission(
        uint64 building,
        uint8 kind,
        uint256[3] calldata target,
        uint256[TROOPS] calldata troops,
        uint256[RESOURCES] calldata resources
    ) external drained returns (uint64) {
        return Missions.send(msg.sender, building, kind, target, troops, resources);
    }

    function recall(uint64 mission) external drained {
        Missions.recall(msg.sender, mission);
    }

    function abandon(uint64 building) external drained {
        Missions.abandon(msg.sender, building);
    }

    /// Anyone: process up to `max` missions that already arrived (B-08).
    function advance(uint256 max) external returns (uint256) {
        return Missions.advance(max);
    }

    function setGlobalPremium(uint256 until) external onlyOwner {
        Core.setGlobalPremium(until);
    }

    function poke(uint64 building) external drained {
        Core.poke(building);
    }

    // ------------------------------------------------------------------ views (raw stored state)

    struct BuildingView {
        uint64 owner;
        uint8 city;
        uint8 neighborhood;
        uint8 slot;
        uint40 lastUpdate;
        uint128 centipoints;
        uint16[ROOMS] levels;
        uint128[RESOURCES] stock;
        QueueItem[] roomQueue;
        uint64[TROOPS] troops;
        TrainingItem[] attackTraining;
        TrainingItem[] defenseTraining;
    }

    struct PlayerView {
        address controller;
        uint64 researchBuilding;
        uint32 buildings;
        uint128 centipoints;
        uint32 missions;
        uint16[RESEARCH] research;
        QueueItem[] researchQueue;
    }

    function getBuilding(uint64 id) external view returns (BuildingView memory v) {
        Building storage b = GameStorage.core().buildings[id];
        v = BuildingView(
            b.owner,
            b.city,
            b.neighborhood,
            b.slot,
            b.lastUpdate,
            b.centipoints,
            b.levels,
            b.stock,
            b.roomQueue,
            b.troops,
            b.training[0],
            b.training[1]
        );
    }

    function getPlayer(uint64 id) external view returns (PlayerView memory v) {
        Player storage p = GameStorage.core().players[id];
        v = PlayerView(
            p.controller,
            p.researchBuilding,
            p.buildings,
            p.centipoints,
            p.missions,
            p.research,
            p.researchQueue
        );
    }

    function getMission(uint64 id) external view returns (Mission memory) {
        return GameStorage.core().missions[id];
    }

    /// Mission ids in heap order (not sorted); the head is the next to resolve.
    function pendingMissions() external view returns (uint64[] memory) {
        return GameStorage.core().heap;
    }

    function playerOf(address controller) external view returns (uint64) {
        return GameStorage.core().playerOf[controller];
    }

    function buildingAt(uint256 city, uint256 neighborhood, uint256 slot)
        external
        view
        returns (uint64)
    {
        return GameStorage.core().buildingAt[GameStorage.coordKey(city, neighborhood, slot)];
    }

    function counters()
        external
        view
        returns (
            uint64 seq,
            uint64 players,
            uint64 buildings,
            uint64 missions,
            uint64 activeMissions,
            uint40 globalPremiumUntil
        )
    {
        CoreState storage s = GameStorage.core();
        return (
            s.seq,
            s.nextPlayer,
            s.nextBuilding,
            s.nextMission,
            s.activeMissions,
            s.globalPremiumUntil
        );
    }
}
