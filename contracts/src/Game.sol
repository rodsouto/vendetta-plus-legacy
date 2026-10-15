// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {
    Ownable2StepUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {ROOMS, RESEARCH, RESOURCES} from "./generated/VendettaRuleset.sol";
import {Core} from "./core/Core.sol";
import {Building, Player, QueueItem, CoreState, GameStorage} from "./core/GameStorage.sol";
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

    function register(uint256 city, uint256 neighborhood, uint256 slot) external returns (uint64) {
        return Core.register(msg.sender, city, neighborhood, slot);
    }

    function queueRoom(uint64 building, uint256 room) external {
        Core.queueRoom(msg.sender, building, room);
    }

    function queueResearch(uint64 building, uint256 research) external {
        Core.queueResearch(msg.sender, building, research);
    }

    function cancelRoom(uint64 building, uint256 position) external {
        Core.cancelRoom(msg.sender, building, position);
    }

    function cancelResearch(uint64 building, uint256 position) external {
        Core.cancelResearch(msg.sender, building, position);
    }

    function setGlobalPremium(uint256 until) external onlyOwner {
        Core.setGlobalPremium(until);
    }

    function poke(uint64 building) external {
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
    }

    struct PlayerView {
        address controller;
        uint64 researchBuilding;
        uint32 buildings;
        uint128 centipoints;
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
            b.roomQueue
        );
    }

    function getPlayer(uint64 id) external view returns (PlayerView memory v) {
        Player storage p = GameStorage.core().players[id];
        v = PlayerView(
            p.controller,
            p.researchBuilding,
            p.buildings,
            p.centipoints,
            p.research,
            p.researchQueue
        );
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
        returns (uint64 seq, uint64 players, uint64 buildings, uint40 globalPremiumUntil)
    {
        CoreState storage s = GameStorage.core();
        return (s.seq, s.nextPlayer, s.nextBuilding, s.globalPremiumUntil);
    }
}
