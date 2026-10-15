// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    ROOMS,
    RESOURCES,
    TROOPS,
    VendettaRuleset as Ruleset
} from "../generated/VendettaRuleset.sol";
import {Costs} from "../rules/Costs.sol";
import {Economy} from "../rules/Economy.sol";
import {Building, Player, QueueItem, TrainingItem, CoreState, GameStorage} from "./GameStorage.sol";
import {IGameEvents} from "./GameErrors.sol";

/// Local settlement of one building (B-06): its own events in (time, seq) order, with exact stock
/// integration between them (B-27, B-28, D-07, D-10). Mirrors packages/rules/src/sim/settle.ts.
library Settlement {
    /// Integrate production from lastUpdate to `t`, switching regime when alcohol runs out (B-28).
    function integrate(Building storage b, uint256 t) internal {
        uint16[ROOMS] memory levels = b.levels;
        uint256[RESOURCES] memory cap = Economy.capacities(levels);
        uint256 alc = Ruleset.CONVERTED_RESOURCE;
        uint256 last = b.lastUpdate;
        uint128[RESOURCES] memory stock = b.stock;
        while (last < t) {
            int256[RESOURCES] memory rate = Economy.rates(levels, stock[alc]);
            uint256 end = t;
            if (stock[alc] > 0 && rate[alc] < 0) {
                uint256 drain = uint256(-rate[alc]);
                uint256 depletion = last + (stock[alc] + drain - 1) / drain;
                if (depletion < end) end = depletion;
            }
            int256 dt = int256(end - last);
            for (uint256 r; r < RESOURCES; ++r) {
                int256 v = int256(uint256(stock[r])) + rate[r] * dt;
                if (v < 0) v = 0;
                if (uint256(v) > cap[r]) v = int256(cap[r]);
                stock[r] = uint128(uint256(v));
            }
            last = end;
        }
        b.stock = stock;
        b.lastUpdate = uint40(last);
    }

    function affordable(Building storage b, uint256[RESOURCES] memory cost)
        internal
        view
        returns (bool)
    {
        for (uint256 r; r < RESOURCES; ++r) {
            if (b.stock[r] / Ruleset.STOCK_SCALE < cost[r]) return false;
        }
        return true;
    }

    function pay(Building storage b, uint256[RESOURCES] memory cost) internal {
        for (uint256 r; r < RESOURCES; ++r) {
            b.stock[r] -= uint128(cost[r] * Ruleset.STOCK_SCALE);
        }
    }

    /// Add whole resources, clamped by storage (D-10).
    function credit(Building storage b, uint256[RESOURCES] memory amounts) internal {
        uint256[RESOURCES] memory cap = Economy.capacities(b.levels);
        for (uint256 r; r < RESOURCES; ++r) {
            uint256 v = b.stock[r] + amounts[r] * Ruleset.STOCK_SCALE;
            b.stock[r] = uint128(v > cap[r] ? cap[r] : v);
        }
    }

    function roomJob(Building storage b, uint256 room)
        internal
        view
        returns (uint256[RESOURCES] memory cost, uint256 seconds_)
    {
        return Costs.room(room, b.levels[room], b.levels[Ruleset.BUILD_SPEED_ROOM]);
    }

    function researchJob(Player storage p, Building storage b, uint256 research)
        internal
        view
        returns (uint256[RESOURCES] memory cost, uint256 seconds_)
    {
        return Costs.research(research, p.research[research], b.levels[Ruleset.RESEARCH_SPEED_ROOM]);
    }

    /// Start the head of the room queue at `t`, paying it; unaffordable items are dropped (D-11).
    function startNextRoom(uint64 id, Building storage b, uint256 t) internal {
        while (b.roomQueue.length > 0) {
            QueueItem storage item = b.roomQueue[0];
            (uint256[RESOURCES] memory cost, uint256 secs) = roomJob(b, item.index);
            if (affordable(b, cost)) {
                pay(b, cost);
                item.finishAt = uint40(t + secs);
                emit IGameEvents.RoomStarted(id, item.index, item.finishAt);
                return;
            }
            emit IGameEvents.RoomDropped(id, item.index);
            shift(b.roomQueue, 0);
        }
    }

    function startNextResearch(uint64 pid, Player storage p, Building storage b, uint256 t)
        internal
    {
        while (p.researchQueue.length > 0) {
            QueueItem storage item = p.researchQueue[0];
            (uint256[RESOURCES] memory cost, uint256 secs) = researchJob(p, b, item.index);
            if (affordable(b, cost)) {
                pay(b, cost);
                item.finishAt = uint40(t + secs);
                emit IGameEvents.ResearchStarted(pid, item.index, item.finishAt);
                return;
            }
            emit IGameEvents.ResearchDropped(pid, item.index);
            shift(p.researchQueue, 0);
        }
        p.researchBuilding = 0;
    }

    /// Remove the item at `position`, keeping the order.
    function shift(QueueItem[] storage q, uint256 position) internal {
        for (uint256 i = position; i + 1 < q.length; ++i) {
            q[i] = q[i + 1];
        }
        q.pop();
    }

    /// ⌊duration × quantity / training-room level⌋ for a troop batch (05-formulas.md, B-29).
    function trainingSeconds(Building storage b, TrainingItem storage item)
        internal
        view
        returns (uint256)
    {
        uint256 troop = item.troop;
        return Ruleset.troopSeconds()[troop] * item.quantity / b.levels[Ruleset.trainedAt()[troop]];
    }

    function troopCentipoints(uint64[TROOPS] memory units) internal pure returns (uint256 total) {
        uint256[TROOPS] memory cp = Ruleset.troopCentipoints();
        for (uint256 i; i < TROOPS; ++i) {
            total += units[i] * cp[i];
        }
    }

    // Event kinds in settle().
    uint256 private constant NONE = 0;
    uint256 private constant ROOM = 1;
    uint256 private constant RESEARCH_DONE = 2;
    uint256 private constant TRAINING = 3; // + queue index

    /// Process the building's own events up to `t` (B-06), in (time, seq) order.
    function settle(CoreState storage s, uint64 id, uint256 t) internal {
        Building storage b = s.buildings[id];
        uint64 pid = b.owner;
        Player storage p = s.players[pid];
        while (true) {
            (uint256 kind, uint256 at) = _nextEvent(b, p, id);
            if (kind == NONE || at > t) break;
            integrate(b, at);
            if (kind == ROOM) {
                uint8 room = b.roomQueue[0].index;
                uint128 cp = uint128(Ruleset.roomCentipoints()[room]);
                b.levels[room] += 1;
                b.centipoints += cp;
                p.centipoints += cp;
                emit IGameEvents.RoomCompleted(id, room, b.levels[room]);
                shift(b.roomQueue, 0);
                startNextRoom(id, b, at);
            } else if (kind == RESEARCH_DONE) {
                uint8 idx = p.researchQueue[0].index;
                p.research[idx] += 1;
                p.centipoints += uint128(Ruleset.researchCentipoints()[idx]);
                emit IGameEvents.ResearchCompleted(pid, idx, p.research[idx]);
                shift(p.researchQueue, 0);
                startNextResearch(pid, p, b, at);
            } else {
                TrainingItem[] storage q = b.training[kind - TRAINING];
                TrainingItem memory item = q[0];
                b.troops[item.troop] += item.quantity;
                p.centipoints += uint128(item.quantity * Ruleset.troopCentipoints()[item.troop]);
                emit IGameEvents.TroopsTrained(id, item.troop, item.quantity);
                shiftTraining(q, 0);
                // Batches are paid when queued, so the next one always starts.
                if (q.length > 0) q[0].finishAt = uint40(at + trainingSeconds(b, q[0]));
            }
        }
        integrate(b, t);
    }

    function _nextEvent(Building storage b, Player storage p, uint64 id)
        private
        view
        returns (uint256 kind, uint256 at)
    {
        uint256 seq;
        if (b.roomQueue.length > 0) {
            (kind, at, seq) = (ROOM, b.roomQueue[0].finishAt, b.roomQueue[0].seq);
        }
        if (p.researchBuilding == id && p.researchQueue.length > 0) {
            QueueItem storage r = p.researchQueue[0];
            if (kind == NONE || r.finishAt < at || (r.finishAt == at && r.seq < seq)) {
                (kind, at, seq) = (RESEARCH_DONE, r.finishAt, r.seq);
            }
        }
        for (uint256 q; q < 2; ++q) {
            if (b.training[q].length == 0) continue;
            TrainingItem storage item = b.training[q][0];
            if (kind == NONE || item.finishAt < at || (item.finishAt == at && item.seq < seq)) {
                (kind, at, seq) = (TRAINING + q, item.finishAt, item.seq);
            }
        }
    }

    function shiftTraining(TrainingItem[] storage q, uint256 position) internal {
        for (uint256 i = position; i + 1 < q.length; ++i) {
            q[i] = q[i + 1];
        }
        q.pop();
    }

    /// A new map building owned by `owner` (register and occupation).
    function newBuilding(
        CoreState storage s,
        uint64 owner,
        uint256 city,
        uint256 neighborhood,
        uint256 slot,
        uint256 buildSpeedLevel,
        uint256 resources,
        uint256 t
    ) internal returns (uint64 bid) {
        bid = ++s.nextBuilding;
        Building storage b = s.buildings[bid];
        b.owner = owner;
        (b.city, b.neighborhood, b.slot) = (uint8(city), uint8(neighborhood), uint8(slot));
        b.lastUpdate = uint40(t);
        b.levels[Ruleset.BUILD_SPEED_ROOM] = uint16(buildSpeedLevel);
        b.centipoints =
            uint128(buildSpeedLevel * Ruleset.roomCentipoints()[Ruleset.BUILD_SPEED_ROOM]);
        uint256[RESOURCES] memory start;
        for (uint256 r; r < RESOURCES; ++r) {
            start[r] = resources;
        }
        credit(b, start);
        s.buildingAt[GameStorage.coordKey(city, neighborhood, slot)] = bid;
    }
}

/// External entry point for settlement, shared by the other linked libraries so its code is
/// deployed once instead of being copied into each of them.
library SettleLib {
    function settle(uint64 id, uint256 t) external {
        Settlement.settle(GameStorage.core(), id, t);
    }
}
