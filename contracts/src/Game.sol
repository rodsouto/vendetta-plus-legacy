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
import {Account} from "./core/Account.sol";
import {Families} from "./core/Families.sol";
import {Market} from "./core/Market.sol";
import {
    Building,
    Player,
    Mission,
    QueueItem,
    TrainingItem,
    Family,
    War,
    Trade,
    CoreState,
    Session,
    GameStorage
} from "./core/GameStorage.sol";
import {Access} from "./core/Access.sol";
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
        uint256[RESOURCES] calldata resources,
        uint64 trade
    ) external drained returns (uint64) {
        return Missions.send(msg.sender, building, kind, target, troops, resources, trade);
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

    // ------------------------------------------------------------------ account (D-18, B-14, B-25, B-26)

    function startVacation() external drained {
        Account.startVacation(msg.sender);
    }

    function endVacation() external drained {
        Account.endVacation(msg.sender);
    }

    /// Arbiter (admin Safe in v1, B-14): suspend a player until `until`; 0 lifts it.
    function suspend(uint64 player, uint256 until) external onlyOwner {
        Account.suspend(player, until);
    }

    /// Admin: premium for one player until `until`, paid off-chain (B-25).
    function grantPremium(uint64 player, uint256 until) external onlyOwner {
        Account.grantPremium(player, until);
    }

    function transferPlayer(address to) external drained {
        Account.transfer(msg.sender, to);
    }

    /// B-15: let `session` (a per-device key) play for the caller's player until `until`.
    function authorizeSession(address session, uint256 until) external drained {
        Account.authorizeSession(msg.sender, session, until);
    }

    function revokeSession(address session) external drained {
        Account.revokeSession(msg.sender, session);
    }

    // ------------------------------------------------------------------ families and wars (D-20, B-31)

    function createFamily(string calldata tag, string calldata name)
        external
        drained
        returns (uint64)
    {
        return Families.create(msg.sender, tag, name);
    }

    function applyToFamily(uint64 family) external drained {
        Families.applyTo(msg.sender, family);
    }

    function withdrawApplication(uint64 family) external drained {
        Families.withdraw(msg.sender, family);
    }

    function answerApplication(uint64 applicant, bool accept) external drained {
        Families.answer(msg.sender, applicant, accept);
    }

    function leaveFamily() external drained {
        Families.leave(msg.sender);
    }

    function kickMember(uint64 member) external drained {
        Families.kick(msg.sender, member);
    }

    function setRank(uint64 member, uint8 rank) external drained {
        Families.setRank(msg.sender, member, rank);
    }

    function handOver(uint64 member) external drained {
        Families.handOver(msg.sender, member);
    }

    function dissolveFamily() external drained {
        Families.dissolve(msg.sender);
    }

    function declareWar(uint64 family) external drained returns (uint64) {
        return Families.declareWar(msg.sender, family);
    }

    function offerPeace(uint64 war, uint8 kind) external drained {
        Families.offerPeace(msg.sender, war, kind);
    }

    function answerPeace(uint64 war, bool accept) external drained {
        Families.answerPeace(msg.sender, war, accept);
    }

    // ------------------------------------------------------------------ market (D-19, B-11)

    function offerTrade(
        uint64 buyer,
        uint256 sold,
        uint256 quantity,
        uint256[RESOURCES] calldata price
    ) external drained returns (uint64) {
        return Market.offer(msg.sender, buyer, sold, quantity, price);
    }

    function cancelTrade(uint64 trade) external drained {
        Market.cancel(msg.sender, trade);
    }

    function acceptTrade(uint64 trade) external drained {
        Market.accept(msg.sender, trade);
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
        uint40 vacationUntil;
        uint40 suspendedUntil;
        uint40 premiumUntil;
        uint64 family;
        uint8 rank;
        uint64[] applications;
        uint64[] offers;
        uint32 sessionEpoch;
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
            p.researchQueue,
            p.vacationUntil,
            p.suspendedUntil,
            p.premiumUntil,
            p.family,
            p.rank,
            p.applications,
            p.offers,
            p.sessionEpoch
        );
    }

    function getFamily(uint64 id) external view returns (Family memory) {
        return GameStorage.core().families[id];
    }

    function getWar(uint64 id) external view returns (War memory) {
        return GameStorage.core().wars[id];
    }

    function getTrade(uint64 id) external view returns (Trade memory) {
        return GameStorage.core().trades[id];
    }

    /// Ids handed out so far (families, wars, trades), for clients and tests.
    function socialCounters() external view returns (uint64 families, uint64 wars, uint64 trades) {
        CoreState storage s = GameStorage.core();
        return (s.nextFamily, s.nextWar, s.nextTrade);
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

    function getSession(address session) external view returns (Session memory) {
        return GameStorage.core().sessions[session];
    }

    /// The player `caller` plays for: as controller or through a live session, 0 if none.
    function playerFor(address caller) external view returns (uint64) {
        CoreState storage s = GameStorage.core();
        uint64 pid = s.playerOf[caller];
        return pid != 0 ? pid : Access.sessionPlayer(s, caller);
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
