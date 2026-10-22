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
    BadReveal,
    InvalidCover,
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
    InDebt,
    TooLate,
    TooEarly,
    TroopsResting,
    OutOfOrder,
    IGameEvents
} from "./GameErrors.sol";

/// Missions and the global mission queue (B-07, B-08, B-22; 07-missions.md). Linked external library.
/// Mirrors packages/rules/src/sim/missions.ts: same checks, same order, same errors.
library Missions {
    /// Missions processed by one action at most before it reverts with Backlog (B-08).
    uint256 internal constant MAX_MISSIONS_PER_TX = 4;

    /// Gas a single mission may need at most (B-08 invariant; MissionGas measures the heaviest
    /// attack against it). With less gas left and a mission due, processing reverts with Backlog
    /// instead of running out of gas midway; since it never succeeds short, a gas estimate always
    /// covers every mission it has to process. The simulator does not model gas: with enough gas
    /// both behave the same.
    uint256 internal constant MISSION_GAS_RESERVE = 7_000_000;

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

    /// Takes due missions out of the queue, at most `max`: a due hidden mission nobody revealed
    /// yet is parked instead of processed (B-22) and counts as one.
    function _processDue(CoreState storage s, uint256 max) private returns (uint256 n) {
        while (n < max) {
            uint64 id = Heap.head(s);
            if (id == 0) break;
            Mission storage m = s.missions[id];
            if (m.arrival > block.timestamp) break;
            if (gasleft() < MISSION_GAS_RESERVE) revert Backlog();
            Heap.remove(s, id);
            if (m.hidden && !m.returning) _park(s, id);
            else _process(s, id);
            ++n;
        }
    }

    /// A due hidden mission nobody revealed yet leaves the queue for the parked list (B-22):
    /// appended at the tail, which keeps the list in (arrival, seq) order since the drain parks
    /// missions in queue order and a parked one never comes back as hidden.
    function _park(CoreState storage s, uint64 id) private {
        uint64 tail = s.parkedTail;
        if (tail == 0) {
            s.parkedHead = id;
        } else {
            s.parkedNext[tail] = id;
            s.parkedPrev[id] = tail;
        }
        s.parkedTail = id;
        emit IGameEvents.MissionParked(id);
    }

    /// Unlinks a mission from the parked list, wherever it is (mirrored by the simulator, so the
    /// lists match).
    function _unpark(CoreState storage s, uint64 id) private {
        uint64 prev = s.parkedPrev[id];
        uint64 next = s.parkedNext[id];
        if (prev == 0) s.parkedHead = next;
        else s.parkedNext[prev] = next;
        if (next == 0) s.parkedTail = prev;
        else s.parkedPrev[next] = prev;
        delete s.parkedPrev[id];
        delete s.parkedNext[id];
    }

    /// Takes a mission out of the queue or the parked list, wherever it is.
    function _dequeue(CoreState storage s, uint64 id) private {
        if (s.heapPos[id] != 0) Heap.remove(s, id);
        else _unpark(s, id);
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

    /// D-18 at arrival: the target's owner was on vacation when the mission was sent. A vacation
    /// started in the send second counts by creation order (B-07).
    function _sentDuringVacation(Player storage o, Mission storage m) private view returns (bool) {
        if (m.start >= o.vacationUntil) return false;
        return o.vacationStart < m.start || (o.vacationStart == m.start && o.vacationSeq < m.seq);
    }

    /// Resolve one mission at its arrival time (07-missions.md#arrival-rules).
    function _process(CoreState storage s, uint64 id) private {
        Mission storage m = s.missions[id];
        uint256 t = m.arrival;
        if (m.returning) return _arriveHome(s, id, t);
        uint64 target = s.buildingAt[GameStorage.coordKey(m.city, m.neighborhood, m.slot)];
        uint64 targetOwner = target == 0 ? 0 : s.buildings[target].owner;
        // D-18 for a hidden mission, checked when it resolves (B-22).
        if (m.cover > 0 && target != 0 && _sentDuringVacation(s.players[targetOwner], m)) {
            return _sendBack(s, id, t);
        }
        uint8 kind = m.kind;
        if (kind == ATTACK) {
            if (target == 0 || targetOwner == m.owner) return _sendBack(s, id, t);
            SettleLib.settleBefore(target, t, m.seq);
            Battle.attack(id, target, t);
            return _sendBack(s, id, t);
        }
        if (kind == STATION) {
            if (target == 0 || targetOwner != m.owner) return _sendBack(s, id, t);
            SettleLib.settleBefore(target, t, m.seq);
            Building storage b = s.buildings[target];
            for (uint256 i; i < TROOPS; ++i) {
                b.troops[i] += m.troops[i];
            }
            return _finish(s, id);
        }
        if (kind == TRANSPORT) {
            // B-11: a debtor's transport to anyone but itself and its creditors turns back, cargo
            // included (hidden missions cannot be checked at send).
            if (!MarketRules.transportAllowed(
                    s, m.owner, s.players[m.owner], targetOwner, m.trade, t
                )) {
                return _sendBack(s, id, t);
            }
            if (target != 0) {
                SettleLib.settleBefore(target, t, m.seq);
                Settlement.credit(s.buildings[target], _cargo(m));
            }
            // D-26: the shipment counts for its trade whatever happened to the building.
            if (m.trade != 0) MarketRules.settle(s, m, t);
            delete m.cargo; // delivered, or lost on an empty slot (D-10, D-26)
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
        emit IGameEvents.BuildingOccupied(bid, m.owner, id);
        _sendBack(s, id, t);
    }

    function _arriveHome(CoreState storage s, uint64 id, uint256 t) private {
        Mission storage m = s.missions[id];
        Building storage origin = s.buildings[m.origin];
        if (origin.owner == m.owner) {
            SettleLib.settleBefore(m.origin, t, m.seq);
            for (uint256 i; i < TROOPS; ++i) {
                origin.troops[i] += m.troops[i];
            }
            origin.lastReturn = uint40(t); // the troops rest before they can leave again (B-22)
            Settlement.credit(origin, _cargo(m));
        } else {
            // The building was abandoned: troops are lost.
            Player storage p = s.players[m.owner];
            p.centipoints -= uint128(Settlement.troopCentipoints(m.troops));
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
        _checkSend(s, pid, p, b, kind, target, trade);
        if (p.missions >= Ruleset.MAX_OUTGOING_MISSIONS) revert TooManyMissions();
        Access.settleForAction(s, p, id);
        _checkRested(b);

        Plan memory plan = _plan(p, b, troops);
        if (kind != TRANSPORT) delete resources;
        _charge(b, plan, Map.distance([uint256(b.city), b.neighborhood, b.slot], target), resources);
        mid = _create(s, pid, id, troops, resources, plan.duration);
        Mission storage m = s.missions[mid];
        (m.kind, m.city, m.neighborhood, m.slot) =
        (kind, uint8(target[0]), uint8(target[1]), uint8(target[2]));
        m.trade = trade;
        p.missions += 1;
        emit IGameEvents.MissionSent(mid, pid, id, kind, m.city, m.neighborhood, m.slot, m.arrival);
    }

    /// A mission whose kind and target stay secret until revealed (B-22). Duration and salary use
    /// the declared `cover` distance (grid units), at most the distance to the farthest map corner.
    /// `deadline`: the latest arrival the ciphertext's timelock allows; a later one reverts TooLate.
    function sendHidden(
        address caller,
        uint64 id,
        bytes32 commit,
        uint32 cover,
        uint256[TROOPS] memory troops,
        uint256[RESOURCES] memory resources,
        bytes calldata ciphertext,
        uint40 deadline
    ) external returns (uint64 mid) {
        CoreState storage s = GameStorage.core();
        mid = _createHidden(s, caller, id, cover, troops, resources);
        Mission storage m = s.missions[mid];
        // The arrival must not pass the round the ciphertext was encrypted for (B-22).
        if (m.arrival > deadline) revert TooLate();
        m.commit = commit;
        emit IGameEvents.MissionSent(mid, m.owner, id, 0, 0, 0, 0, m.arrival);
        emit IGameEvents.HiddenMissionSent(mid, commit, cover, ciphertext);
    }

    /// Checks, charges (salary over the cover and the cargo) and creates the mission.
    function _createHidden(
        CoreState storage s,
        address caller,
        uint64 id,
        uint32 cover,
        uint256[TROOPS] memory troops,
        uint256[RESOURCES] memory resources
    ) private returns (uint64 mid) {
        (uint64 pid, Player storage p, Building storage b) = Access.owned(s, caller, id);
        _checkCover(b, cover);
        if (p.missions >= Ruleset.MAX_OUTGOING_MISSIONS) revert TooManyMissions();
        Access.settleForAction(s, p, id);
        _checkRested(b);
        Plan memory plan = _plan(p, b, troops);
        _charge(b, plan, uint256(cover) * Ruleset.DISTANCE_UNIT, resources);
        p.missions += 1;
        mid = _create(s, pid, id, troops, resources, plan.duration);
        Mission storage m = s.missions[mid];
        m.hidden = true;
        m.cover = cover;
    }

    /// A building that just took returning troops in cannot send for RETURN_COOLDOWN (B-22).
    function _checkRested(Building storage b) private view {
        if (block.timestamp < uint256(b.lastReturn) + Ruleset.RETURN_COOLDOWN) {
            revert TroopsResting();
        }
    }

    /// `1 ≤ cover ≤` the distance from the origin to the farthest map corner (B-22).
    function _checkCover(Building storage b, uint32 cover) private view {
        uint256 dist = uint256(cover) * Ruleset.DISTANCE_UNIT;
        if (cover == 0 || dist > Map.maxDistanceFrom([uint256(b.city), b.neighborhood, b.slot])) {
            revert InvalidCover();
        }
    }

    /// Reveals go in arrival order for HIDDEN_ORDER_WINDOW: a parked mission that arrived before
    /// `id` and is still within its window must be revealed first (B-22). The parked list is in
    /// (arrival, seq) order and `id` is parked (the drain parked every due mission), so the
    /// predecessor decides: past its window, every earlier one is past its own too.
    function _checkOrder(CoreState storage s, uint64 id) private view {
        uint64 prev = s.parkedPrev[id];
        if (prev == 0) return;
        if (block.timestamp < uint256(s.missions[prev].arrival) + Ruleset.HIDDEN_ORDER_WINDOW) {
            revert OutOfOrder();
        }
    }

    /// Anyone may reveal a hidden mission until its grace ends. Game drains the queue first, like
    /// for any action, so the due missions ahead are processed or parked; then the commitment and
    /// the target are checked. An invalid reveal reverts; past the grace it does nothing (the
    /// mission is forfeited instead). A mission revealed after its arrival (parked by that drain)
    /// gets the reveal time as its arrival and a fresh seq, so it resolves against the target's
    /// state at this second; reveals go in arrival order for a window (B-22).
    function reveal(uint64 missionId, uint8 kind, uint256[3] memory target, bytes32 salt) external {
        CoreState storage s = GameStorage.core();
        Mission storage m = s.missions[missionId];
        if (!m.hidden || m.returning) return; // already revealed, recalled or resolved: clients race
        if (block.timestamp >= uint256(m.arrival) + Ruleset.HIDDEN_REVEAL_GRACE) return; // forfeit
        if (keccak256(abi.encode(m.owner, kind, target[0], target[1], target[2], salt)) != m.commit)
        {
            revert BadReveal();
        }
        uint256[3] memory from = [uint256(m.fromCity), m.fromNeighborhood, m.fromSlot];
        _checkTarget(kind, target, from);
        if (Map.distance(from, target) > uint256(m.cover) * Ruleset.DISTANCE_UNIT) {
            revert InvalidCover();
        }
        if (kind != TRANSPORT) {
            for (uint256 r; r < RESOURCES; ++r) {
                if (m.cargo[r] > 0) revert InvalidMission();
            }
        }
        m.hidden = false;
        (m.kind, m.city, m.neighborhood, m.slot) =
        (kind, uint8(target[0]), uint8(target[1]), uint8(target[2]));
        if (m.arrival <= block.timestamp) {
            _checkOrder(s, missionId);
            _dequeue(s, missionId);
            m.arrival = uint40(block.timestamp);
            m.seq = s.seq++;
            Heap.push(s, missionId);
        }
        emit IGameEvents.MissionRevealed(missionId, kind, m.city, m.neighborhood, m.slot);
    }

    /// Past the grace, anyone sends a hidden mission nobody revealed back home: it turns back from
    /// now with all its troops and cargo (B-22). It touches no building, so it never drains the
    /// queue; the keeper and the sender race, so a mission no longer hidden is ignored.
    function forfeit(uint64 missionId) external {
        CoreState storage s = GameStorage.core();
        Mission storage m = s.missions[missionId];
        if (!m.hidden || m.returning) return;
        if (block.timestamp < uint256(m.arrival) + Ruleset.HIDDEN_REVEAL_GRACE) revert TooEarly();
        _dequeue(s, missionId);
        emit IGameEvents.MissionForfeited(missionId);
        _sendBack(s, missionId, block.timestamp);
    }

    /// A valid kind and coordinate, other than the origin.
    function _checkTarget(uint8 kind, uint256[3] memory target, uint256[3] memory from)
        private
        pure
    {
        if (kind < ATTACK || kind > OCCUPY) revert InvalidMission();
        if (
            target[0] < 1 || target[0] > Ruleset.CITIES || target[1] < 1
                || target[1] > Ruleset.NEIGHBORHOODS || target[2] < 1 || target[2] > Ruleset.SLOTS
        ) revert InvalidCoordinate();
        if (target[0] == from[0] && target[1] == from[1] && target[2] == from[2]) {
            revert InvalidMission();
        }
    }

    /// The target checks of a public send, plus the trade's (D-26): a trade transport goes to the
    /// counterparty's building (the creditor's, after the window), and at arrival it counts
    /// whatever happened to the building.
    function _checkSend(
        CoreState storage s,
        uint64 pid,
        Player storage p,
        Building storage b,
        uint8 kind,
        uint256[3] memory target,
        uint64 trade
    ) private view {
        uint64 to = _validateTarget(s, pid, p, b, kind, target, trade);
        if (trade != 0 && (kind != TRANSPORT || !MarketRules.openFor(s, trade, pid, to))) {
            revert InvalidTrade();
        }
    }

    /// Mirrors checkSendTarget in missions.ts, which clients also run before a hidden mission.
    /// Returns the target's owner (0 for an empty slot).
    function _validateTarget(
        CoreState storage s,
        uint64 pid,
        Player storage p,
        Building storage b,
        uint8 kind,
        uint256[3] memory target,
        uint64 trade
    ) private view returns (uint64 to) {
        _checkTarget(kind, target, [uint256(b.city), b.neighborhood, b.slot]);
        uint64 targetId = s.buildingAt[GameStorage.coordKey(target[0], target[1], target[2])];
        to = targetId == 0 ? 0 : s.buildings[targetId].owner;
        if (to != 0) {
            if (kind == ATTACK && to == pid) revert OwnTarget();
            if (s.players[to].vacationUntil > block.timestamp) revert TargetOnVacation(); // D-18
        }
        // B-11: a player with a registered debt only transports to its own and its creditors'.
        if (
            kind == TRANSPORT
                && !MarketRules.transportAllowed(s, pid, p, to, trade, block.timestamp)
        ) {
            revert InDebt();
        }
    }

    /// Travel time, salary, cargo limit over `dist`; pays resources + salary from the building.
    function _charge(
        Building storage b,
        Plan memory plan,
        uint256 dist,
        uint256[RESOURCES] memory resources
    ) private {
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
        uint256[TROOPS] memory troops,
        uint256[RESOURCES] memory cargo,
        uint256 duration
    ) private returns (uint64 mid) {
        mid = ++s.nextMission;
        Mission storage m = s.missions[mid];
        Building storage b = s.buildings[origin];
        (m.owner, m.origin) = (pid, origin);
        (m.fromCity, m.fromNeighborhood, m.fromSlot) = (b.city, b.neighborhood, b.slot);
        for (uint256 i; i < TROOPS; ++i) {
            b.troops[i] -= uint64(troops[i]);
            m.troops[i] = uint64(troops[i]);
        }
        for (uint256 r; r < RESOURCES; ++r) {
            m.cargo[r] = uint64(cargo[r]);
        }
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
        _dequeue(s, missionId);
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
