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
import {Settlement, SettleLib} from "./Settlement.sol";
import {Access} from "./Access.sol";
import {
    AlreadyRegistered,
    InvalidCoordinate,
    SlotTaken,
    UnknownEntity,
    RequirementsNotMet,
    QueueFull,
    CannotAfford,
    TimingRoomRequired,
    ResearchElsewhere,
    NothingToCancel,
    InvalidBond,
    IGameEvents
} from "./GameErrors.sol";

/// Player actions of the core module: register, room and research queues. Linked external library
/// (runs by delegatecall in the Game proxy). Mirrors packages/rules/src/sim/actions.ts: same checks,
/// same order, same errors.
library Core {
    function register(address caller, uint256 city, uint256 neighborhood, uint256 slot)
        external
        returns (uint64 pid)
    {
        CoreState storage s = GameStorage.core();
        if (s.playerOf[caller] != 0 || Access.sessionPlayer(s, caller) != 0) {
            revert AlreadyRegistered();
        }
        if (
            city < 1 || city > Ruleset.CITIES || neighborhood < 1
                || neighborhood > Ruleset.NEIGHBORHOODS || slot < 1 || slot > Ruleset.SLOTS
        ) revert InvalidCoordinate();
        uint256 key = GameStorage.coordKey(city, neighborhood, slot);
        if (s.buildingAt[key] != 0) revert SlotTaken();

        pid = ++s.nextPlayer;
        uint64 bid = Settlement.newBuilding(
            s,
            pid,
            city,
            neighborhood,
            slot,
            Ruleset.START_BUILD_SPEED_LEVEL,
            Ruleset.START_RESOURCES,
            block.timestamp
        );
        uint128 cp = s.buildings[bid].centipoints;

        Player storage p = s.players[pid];
        p.controllers.push(caller);
        p.buildings = 1;
        p.centipoints = cp;
        s.playerOf[caller] = pid;
        emit IGameEvents.PlayerRegistered(pid, caller, bid);
        emit IGameEvents.PointsChanged(pid, cp);
    }

    function queueRoom(address caller, uint64 id, uint256 room) external {
        CoreState storage s = GameStorage.core();
        (, Player storage p, Building storage b) = Access.owned(s, caller, id);
        if (room >= ROOMS) revert UnknownEntity();
        Access.settleForAction(s, p, id);
        if (!Costs.met(Ruleset.roomRequirements()[room], b.levels, p.research)) {
            revert RequirementsNotMet();
        }
        uint256 limit = Access.isPremium(s, p) ? Ruleset.ROOM_QUEUE_PREMIUM : Ruleset.ROOM_QUEUE;
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
        (uint64 pid, Player storage p, Building storage b) = Access.owned(s, caller, id);
        if (research >= RESEARCH) revert UnknownEntity();
        Access.settleForAction(s, p, id);
        if (p.researchBuilding != 0 && p.researchBuilding != id) revert ResearchElsewhere();
        if (b.levels[Ruleset.RESEARCH_SPEED_ROOM] < 1) revert TimingRoomRequired(); // D-14
        if (!Costs.met(Ruleset.researchRequirements()[research], b.levels, p.research)) {
            revert RequirementsNotMet();
        }
        uint256 limit =
            Access.isPremium(s, p) ? Ruleset.RESEARCH_QUEUE_PREMIUM : Ruleset.RESEARCH_QUEUE;
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
        (, Player storage p, Building storage b) = Access.owned(s, caller, id);
        Access.settleForAction(s, p, id);
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
        (uint64 pid, Player storage p, Building storage b) = Access.owned(s, caller, id);
        Access.settleForAction(s, p, id);
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

    /// Admin only (checked by Game): the hidden mission bond in force, within the bounds (B-22).
    function setHiddenBond(uint256 bond) external {
        if (bond < Ruleset.HIDDEN_MISSION_BOND_MIN || bond > Ruleset.HIDDEN_MISSION_BOND_MAX) {
            revert InvalidBond();
        }
        GameStorage.core().hiddenBond = uint64(bond);
        emit IGameEvents.HiddenBondSet(uint64(bond));
    }

    /// Admin only (checked by Game): an address that may report garbage ciphertexts (B-22).
    function setKeeper(address keeper, bool allowed) external {
        GameStorage.core().keepers[keeper] = allowed;
        emit IGameEvents.KeeperSet(keeper, allowed);
    }

    /// Anyone can bring a building up to date.
    function poke(uint64 id) external {
        CoreState storage s = GameStorage.core();
        if (s.buildings[id].owner == 0) revert UnknownEntity();
        SettleLib.settle(id, block.timestamp);
    }
}
