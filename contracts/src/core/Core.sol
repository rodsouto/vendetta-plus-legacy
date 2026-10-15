// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    ROOMS,
    RESEARCH,
    RESOURCES,
    VendettaRuleset as Ruleset
} from "../generated/VendettaRuleset.sol";
import {Costs} from "../rules/Costs.sol";
import {Building, Player, QueueItem, CoreState, GameStorage} from "./GameStorage.sol";
import {Settlement} from "./Settlement.sol";
import {
    AlreadyRegistered,
    InvalidCoordinate,
    SlotTaken,
    NotRegistered,
    NotOwner,
    UnknownEntity,
    RequirementsNotMet,
    QueueFull,
    CannotAfford,
    TimingRoomRequired,
    ResearchElsewhere,
    NothingToCancel,
    IGameEvents
} from "./GameErrors.sol";

/// Player actions of the core module: register, room and research queues. Linked external library
/// (runs by delegatecall in the Game proxy). Mirrors packages/rules/src/sim/actions.ts: same checks,
/// same order, same errors.
library Core {
    /// B-25. Per-player premium arrives in 3c; for now only the admin's global premium.
    function _isPremium(CoreState storage s, Player storage) private view returns (bool) {
        return s.globalPremiumUntil > block.timestamp;
    }

    function _owned(CoreState storage s, address caller, uint64 id)
        private
        view
        returns (uint64 pid, Player storage p, Building storage b)
    {
        pid = s.playerOf[caller];
        if (pid == 0) revert NotRegistered();
        b = s.buildings[id];
        if (b.owner != pid) revert NotOwner();
        p = s.players[pid];
    }

    function _settleForAction(CoreState storage s, Player storage p, uint64 id) private {
        Settlement.settle(s, id, block.timestamp);
        uint64 rb = p.researchBuilding;
        if (rb != 0 && rb != id) Settlement.settle(s, rb, block.timestamp);
    }

    function register(address caller, uint256 city, uint256 neighborhood, uint256 slot)
        external
        returns (uint64 pid)
    {
        CoreState storage s = GameStorage.core();
        if (s.playerOf[caller] != 0) revert AlreadyRegistered();
        if (
            city < 1 || city > Ruleset.CITIES || neighborhood < 1
                || neighborhood > Ruleset.NEIGHBORHOODS || slot < 1 || slot > Ruleset.SLOTS
        ) revert InvalidCoordinate();
        uint256 key = GameStorage.coordKey(city, neighborhood, slot);
        if (s.buildingAt[key] != 0) revert SlotTaken();

        pid = ++s.nextPlayer;
        uint64 bid = ++s.nextBuilding;
        Building storage b = s.buildings[bid];
        b.owner = pid;
        (b.city, b.neighborhood, b.slot) = (uint8(city), uint8(neighborhood), uint8(slot));
        b.lastUpdate = uint40(block.timestamp);
        b.levels[Ruleset.BUILD_SPEED_ROOM] = uint16(Ruleset.START_BUILD_SPEED_LEVEL);
        uint128 cp = uint128(
            Ruleset.START_BUILD_SPEED_LEVEL * Ruleset.roomCentipoints()[Ruleset.BUILD_SPEED_ROOM]
        );
        b.centipoints = cp;
        uint256[RESOURCES] memory start;
        for (uint256 r; r < RESOURCES; ++r) {
            start[r] = Ruleset.START_RESOURCES;
        }
        Settlement.credit(b, start);
        s.buildingAt[key] = bid;

        Player storage p = s.players[pid];
        p.controller = caller;
        p.buildings = 1;
        p.centipoints = cp;
        s.playerOf[caller] = pid;
        emit IGameEvents.PlayerRegistered(pid, caller, bid);
    }

    function queueRoom(address caller, uint64 id, uint256 room) external {
        CoreState storage s = GameStorage.core();
        (, Player storage p, Building storage b) = _owned(s, caller, id);
        if (room >= ROOMS) revert UnknownEntity();
        _settleForAction(s, p, id);
        if (!Costs.met(Ruleset.roomRequirements()[room], b.levels, p.research)) {
            revert RequirementsNotMet();
        }
        uint256 limit = _isPremium(s, p) ? Ruleset.ROOM_QUEUE_PREMIUM : Ruleset.ROOM_QUEUE;
        if (b.roomQueue.length >= limit) revert QueueFull();
        QueueItem memory item = QueueItem(uint8(room), s.seq++, 0);
        if (b.roomQueue.length == 0) {
            (uint256[RESOURCES] memory cost, uint256 secs) = Settlement.roomJob(b, room);
            if (!Settlement.affordable(b, cost)) revert CannotAfford();
            Settlement.pay(b, cost);
            item.finishAt = uint40(block.timestamp + secs);
            emit IGameEvents.RoomStarted(id, item.index, item.finishAt);
        }
        b.roomQueue.push(item);
        emit IGameEvents.RoomQueued(id, item.index, item.seq);
    }

    function queueResearch(address caller, uint64 id, uint256 research) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p, Building storage b) = _owned(s, caller, id);
        if (research >= RESEARCH) revert UnknownEntity();
        _settleForAction(s, p, id);
        if (p.researchBuilding != 0 && p.researchBuilding != id) revert ResearchElsewhere();
        if (b.levels[Ruleset.RESEARCH_SPEED_ROOM] < 1) revert TimingRoomRequired(); // D-14
        if (!Costs.met(Ruleset.researchRequirements()[research], b.levels, p.research)) {
            revert RequirementsNotMet();
        }
        uint256 limit = _isPremium(s, p) ? Ruleset.RESEARCH_QUEUE_PREMIUM : Ruleset.RESEARCH_QUEUE;
        if (p.researchQueue.length >= limit) revert QueueFull();
        QueueItem memory item = QueueItem(uint8(research), s.seq++, 0);
        if (p.researchQueue.length == 0) {
            (uint256[RESOURCES] memory cost, uint256 secs) = Settlement.researchJob(p, b, research);
            if (!Settlement.affordable(b, cost)) revert CannotAfford();
            Settlement.pay(b, cost);
            item.finishAt = uint40(block.timestamp + secs);
            p.researchBuilding = id;
            emit IGameEvents.ResearchStarted(pid, item.index, item.finishAt);
        }
        p.researchQueue.push(item);
        emit IGameEvents.ResearchQueued(pid, id, item.index, item.seq);
    }

    /// Cancel the room item at `position`: the one in progress is refunded and the next one starts.
    function cancelRoom(address caller, uint64 id, uint256 position) external {
        CoreState storage s = GameStorage.core();
        (, Player storage p, Building storage b) = _owned(s, caller, id);
        _settleForAction(s, p, id);
        if (position >= b.roomQueue.length) revert NothingToCancel();
        uint8 room = b.roomQueue[position].index;
        if (position == 0) {
            (uint256[RESOURCES] memory cost,) = Settlement.roomJob(b, room);
            Settlement.credit(b, cost);
            Settlement.shift(b.roomQueue, 0);
            Settlement.startNextRoom(id, b, block.timestamp);
        } else {
            Settlement.shift(b.roomQueue, position);
        }
        emit IGameEvents.RoomCancelled(id, room, position);
    }

    function cancelResearch(address caller, uint64 id, uint256 position) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p, Building storage b) = _owned(s, caller, id);
        _settleForAction(s, p, id);
        if (p.researchBuilding != id || position >= p.researchQueue.length) {
            revert NothingToCancel();
        }
        uint8 research = p.researchQueue[position].index;
        if (position == 0) {
            (uint256[RESOURCES] memory cost,) = Settlement.researchJob(p, b, research);
            Settlement.credit(b, cost);
            Settlement.shift(p.researchQueue, 0);
            Settlement.startNextResearch(pid, p, b, block.timestamp);
        } else {
            Settlement.shift(p.researchQueue, position);
        }
        emit IGameEvents.ResearchCancelled(pid, research, position);
    }

    /// Admin only (checked by Game): premium for every player until `until` (B-25).
    function setGlobalPremium(uint256 until) external {
        GameStorage.core().globalPremiumUntil = uint40(until);
        emit IGameEvents.GlobalPremiumSet(uint40(until));
    }

    /// Anyone can bring a building up to date.
    function poke(uint64 id) external {
        CoreState storage s = GameStorage.core();
        if (s.buildings[id].owner == 0) revert UnknownEntity();
        Settlement.settle(s, id, block.timestamp);
    }
}
