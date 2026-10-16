// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    TROOPS,
    RESEARCH,
    RESOURCES,
    VendettaRuleset as Ruleset
} from "../generated/VendettaRuleset.sol";
import {TroopStats} from "../combat/TroopStats.sol";
import {Map} from "../rules/Map.sol";
import {
    Building,
    Player,
    Mission,
    CoreState,
    GameStorage,
    ATTACK,
    STATION,
    TRANSPORT,
    OCCUPY
} from "./GameStorage.sol";
import {Settlement, SettleLib} from "./Settlement.sol";
import {Access} from "./Access.sol";
import {Heap} from "./Heap.sol";
import {Battle} from "./Battle.sol";
import {MarketRules} from "./Market.sol";
import {
    Backlog,
    InvalidMission,
    InvalidCoordinate,
    OwnTarget,
    InvalidTroops,
    NoUnits,
    TooManyMissions,
    CargoExceeded,
    CannotAfford,
    NotRecallable,
    LastBuilding,
    TargetOnVacation,
    InvalidTrade,
    IGameEvents
} from "./GameErrors.sol";

/// Missions and the global mission queue (B-07, B-08; 07-missions.md). Linked external library.
/// Mirrors packages/rules/src/sim/missions.ts: same checks, same order, same errors.
library Missions {
    /// Missions processed by one action at most before it reverts with Backlog (B-08).
    uint256 internal constant MAX_MISSIONS_PER_TX = 10;

    /// Gas a single mission may need at most (B-08 invariant; BattleGas checks the worst battle
    /// against it). With less gas left and a mission due, processing reverts with Backlog instead
    /// of running out of gas midway; since it never succeeds short, a gas estimate always covers
    /// every mission it has to process. The simulator does not model gas: with enough gas both
    /// behave the same.
    uint256 internal constant MISSION_GAS_RESERVE = 3_000_000;

    // ------------------------------------------------------------------ queue

    /// Every action first catches up the global queue; a remaining backlog reverts.
    function drain() external {
        CoreState storage s = GameStorage.core();
        _processDue(s, MAX_MISSIONS_PER_TX);
        uint64 head = Heap.head(s);
        if (head != 0 && s.missions[head].arrival <= block.timestamp) revert Backlog();
    }

    /// Anyone can process up to `max` due missions; never reverts on a remaining backlog (only when
    /// short of gas for the next one).
    function advance(uint256 max) external returns (uint256) {
        return _processDue(GameStorage.core(), max);
    }

    function _processDue(CoreState storage s, uint256 max) private returns (uint256 n) {
        while (n < max) {
            uint64 id = Heap.head(s);
            if (id == 0 || s.missions[id].arrival > block.timestamp) break;
            if (gasleft() < MISSION_GAS_RESERVE) revert Backlog();
            Heap.remove(s, id);
            _process(s, id);
            ++n;
        }
    }

    function _finish(CoreState storage s, uint64 id) private {
        s.players[s.missions[id].owner].missions -= 1;
        s.activeMissions -= 1;
        delete s.missions[id];
        emit IGameEvents.MissionEnded(id);
    }

    /// Turn a mission around at `t`; a mission with no units left ends instead.
    function _sendBack(CoreState storage s, uint64 id, uint256 t) private {
        Mission storage m = s.missions[id];
        bool any;
        for (uint256 i; i < TROOPS; ++i) {
            if (m.troops[i] > 0) {
                any = true;
                break;
            }
        }
        if (!any) return _finish(s, id);
        m.returning = true;
        m.start = uint40(t);
        m.arrival = uint40(t + m.duration);
        m.seq = s.seq++;
        Heap.push(s, id);
        emit IGameEvents.MissionReturning(id, m.arrival);
    }

    /// Resolve one mission at its arrival time (07-missions.md#arrival-rules).
    function _process(CoreState storage s, uint64 id) private {
        Mission storage m = s.missions[id];
        uint256 t = m.arrival;
        if (m.returning) return _arriveHome(s, id, t);
        uint64 target = s.buildingAt[GameStorage.coordKey(m.city, m.neighborhood, m.slot)];
        uint64 targetOwner = target == 0 ? 0 : s.buildings[target].owner;
        uint8 kind = m.kind;
        if (kind == ATTACK) {
            if (target == 0 || targetOwner == m.owner) return _sendBack(s, id, t);
            SettleLib.settle(target, t);
            Battle.attack(id, target, t);
            return _sendBack(s, id, t);
        }
        if (kind == STATION) {
            if (target == 0 || targetOwner != m.owner) return _sendBack(s, id, t);
            SettleLib.settle(target, t);
            Building storage b = s.buildings[target];
            for (uint256 i; i < TROOPS; ++i) {
                b.troops[i] += m.troops[i];
            }
            return _finish(s, id);
        }
        if (kind == TRANSPORT) {
            if (target != 0) {
                SettleLib.settle(target, t);
                Settlement.credit(s.buildings[target], _cargo(m));
                if (m.trade != 0) MarketRules.settle(s, m, targetOwner, t);
            }
            delete m.cargo; // delivered, or lost on an empty slot
            return _sendBack(s, id, t);
        }
        // OCCUPY
        uint256 occ = Ruleset.OCCUPATION_TROOP;
        if (target != 0 || m.troops[occ] < Ruleset.OCCUPATION_TROOPS_CONSUMED) {
            return _sendBack(s, id, t);
        }
        Player storage p = s.players[m.owner];
        uint64 bid = Settlement.newBuilding(
            s,
            m.owner,
            m.city,
            m.neighborhood,
            m.slot,
            Ruleset.OCCUPATION_BUILD_SPEED_LEVEL,
            Ruleset.OCCUPATION_RESOURCES,
            t
        );
        m.troops[occ] -= uint64(Ruleset.OCCUPATION_TROOPS_CONSUMED);
        p.buildings += 1;
        p.centipoints = p.centipoints + s.buildings[bid].centipoints
            - uint128(Ruleset.OCCUPATION_TROOPS_CONSUMED * Ruleset.troopCentipoints()[occ]);
        emit IGameEvents.PointsChanged(m.owner, p.centipoints);
        emit IGameEvents.BuildingOccupied(bid, m.owner, id);
        _sendBack(s, id, t);
    }

    function _arriveHome(CoreState storage s, uint64 id, uint256 t) private {
        Mission storage m = s.missions[id];
        Building storage origin = s.buildings[m.origin];
        if (origin.owner == m.owner) {
            SettleLib.settle(m.origin, t);
            for (uint256 i; i < TROOPS; ++i) {
                origin.troops[i] += m.troops[i];
            }
            Settlement.credit(origin, _cargo(m));
        } else {
            // The building was abandoned: troops are lost.
            Player storage p = s.players[m.owner];
            p.centipoints -= uint128(Settlement.troopCentipoints(m.troops));
            emit IGameEvents.PointsChanged(m.owner, p.centipoints);
        }
        _finish(s, id);
    }

    function _cargo(Mission storage m) private view returns (uint256[RESOURCES] memory c) {
        for (uint256 r; r < RESOURCES; ++r) {
            c[r] = m.cargo[r];
        }
    }

    // ------------------------------------------------------------------ actions

    struct Plan {
        uint256 units;
        uint256 speed;
        uint256 capacity;
        uint256 salaryUnits;
        uint256 duration;
        uint256 salary;
    }

    function send(
        address caller,
        uint64 id,
        uint8 kind,
        uint256[3] memory target,
        uint256[TROOPS] memory troops,
        uint256[RESOURCES] memory resources,
        uint64 trade
    ) external returns (uint64 mid) {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p, Building storage b) = Access.owned(s, caller, id);
        _validateTarget(s, pid, b, kind, target);
        if (trade != 0 && (kind != TRANSPORT || !MarketRules.openFor(s, trade, pid))) {
            revert InvalidTrade();
        }
        if (p.missions >= Ruleset.MAX_OUTGOING_MISSIONS) revert TooManyMissions();
        Access.settleForAction(s, p, id);

        Plan memory plan = _plan(p, b, troops);
        if (kind != TRANSPORT) delete resources;
        _charge(b, plan, target, resources);
        mid = _create(s, pid, id, kind, target, plan.duration);
        Mission storage m = s.missions[mid];
        m.trade = trade;
        for (uint256 i; i < TROOPS; ++i) {
            b.troops[i] -= uint64(troops[i]);
            m.troops[i] = uint64(troops[i]);
        }
        for (uint256 r; r < RESOURCES; ++r) {
            m.cargo[r] = uint64(resources[r]);
        }
        p.missions += 1;
        emit IGameEvents.MissionSent(mid, pid, id, kind, m.city, m.neighborhood, m.slot, m.arrival);
    }

    function _validateTarget(
        CoreState storage s,
        uint64 pid,
        Building storage b,
        uint8 kind,
        uint256[3] memory target
    ) private view {
        if (kind < ATTACK || kind > OCCUPY) revert InvalidMission();
        if (
            target[0] < 1 || target[0] > Ruleset.CITIES || target[1] < 1
                || target[1] > Ruleset.NEIGHBORHOODS || target[2] < 1 || target[2] > Ruleset.SLOTS
        ) revert InvalidCoordinate();
        if (target[0] == b.city && target[1] == b.neighborhood && target[2] == b.slot) {
            revert InvalidMission();
        }
        uint64 targetId = s.buildingAt[GameStorage.coordKey(target[0], target[1], target[2])];
        if (kind == ATTACK && targetId != 0 && s.buildings[targetId].owner == pid) {
            revert OwnTarget();
        }
        if (targetId != 0 && s.players[s.buildings[targetId].owner].vacationUntil > block.timestamp)
        {
            revert TargetOnVacation(); // D-18
        }
    }

    /// Travel time, salary, cargo limit; pays resources + salary from the building.
    function _charge(
        Building storage b,
        Plan memory plan,
        uint256[3] memory target,
        uint256[RESOURCES] memory resources
    ) private {
        uint256 dist = Map.distance([uint256(b.city), b.neighborhood, b.slot], target);
        plan.duration = Map.travelSeconds(dist, plan.speed);
        plan.salary = Map.salary(dist, plan.salaryUnits);
        uint256 carried;
        for (uint256 r; r < RESOURCES; ++r) {
            carried += resources[r];
        }
        if (carried > 0 && carried + plan.salary > plan.capacity) revert CargoExceeded();
        uint256[RESOURCES] memory cost;
        for (uint256 r; r < RESOURCES; ++r) {
            cost[r] = resources[r];
        }
        cost[Ruleset.SALARY_RESOURCE] += plan.salary;
        if (!Settlement.affordable(b, cost)) revert CannotAfford();
        Settlement.pay(b, cost);
    }

    function _create(
        CoreState storage s,
        uint64 pid,
        uint64 origin,
        uint8 kind,
        uint256[3] memory target,
        uint256 duration
    ) private returns (uint64 mid) {
        mid = ++s.nextMission;
        Mission storage m = s.missions[mid];
        (m.owner, m.origin, m.kind) = (pid, origin, kind);
        (m.city, m.neighborhood, m.slot) = (uint8(target[0]), uint8(target[1]), uint8(target[2]));
        (m.start, m.arrival, m.duration) =
        (uint40(block.timestamp), uint40(block.timestamp + duration), uint40(duration));
        m.seq = s.seq++;
        s.activeMissions += 1;
        Heap.push(s, mid);
    }

    /// Only attack troops present in the building; speed = slowest, capacity and salary summed.
    function _plan(Player storage p, Building storage b, uint256[TROOPS] memory troops)
        private
        view
        returns (Plan memory plan)
    {
        uint256[RESEARCH] memory levels;
        for (uint256 i; i < RESEARCH; ++i) {
            levels[i] = p.research[i];
        }
        uint256[TROOPS] memory salary = Ruleset.troopSalary();
        for (uint256 i; i < TROOPS; ++i) {
            uint256 n = troops[i];
            if (n == 0) continue;
            if (Ruleset.ATTACK_TROOPS & (1 << i) == 0 || n > b.troops[i]) revert InvalidTroops();
            uint256 speed = TroopStats.speed(i, levels);
            plan.units += n;
            if (plan.speed == 0 || speed < plan.speed) plan.speed = speed;
            plan.capacity += n * TroopStats.capacity(i, levels);
            plan.salaryUnits += n * salary[i];
        }
        if (plan.units == 0) revert NoUnits();
    }

    /// A mission not yet returning turns back, arriving after the time already travelled.
    function recall(address caller, uint64 missionId) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid,) = Access.active(s, caller);
        Mission storage m = s.missions[missionId];
        if (m.owner != pid || m.returning) revert NotRecallable();
        Heap.remove(s, missionId);
        m.returning = true;
        m.arrival = uint40(block.timestamp + (block.timestamp - m.start));
        m.start = uint40(block.timestamp);
        m.seq = s.seq++;
        Heap.push(s, missionId);
        emit IGameEvents.MissionRecalled(missionId, m.arrival);
    }

    /// Abandon a building: rooms, troops and queues are lost; never the last one (B-30).
    function abandon(address caller, uint64 id) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p, Building storage b) = Access.owned(s, caller, id);
        if (p.buildings <= 1) revert LastBuilding();
        Access.settleForAction(s, p, id);
        p.centipoints -= b.centipoints + uint128(Settlement.troopCentipoints(b.troops));
        emit IGameEvents.PointsChanged(pid, p.centipoints);
        if (p.researchBuilding == id) {
            delete p.researchQueue;
            p.researchBuilding = 0;
        }
        p.buildings -= 1;
        delete s.buildingAt[GameStorage.coordKey(b.city, b.neighborhood, b.slot)];
        delete b.roomQueue;
        delete b.training;
        delete s.buildings[id];
        emit IGameEvents.BuildingAbandoned(id, pid);
    }
}
