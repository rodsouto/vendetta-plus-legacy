// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {TROOPS, RESOURCES, VendettaRuleset as Ruleset} from "../generated/VendettaRuleset.sol";
import {Costs} from "../rules/Costs.sol";
import {Building, Player, TrainingItem, CoreState, GameStorage} from "./GameStorage.sol";
import {Settlement} from "./Settlement.sol";
import {Access} from "./Access.sol";
import {
    UnknownEntity,
    NoUnits,
    TimingRoomRequired,
    RequirementsNotMet,
    QueueFull,
    CannotAfford,
    NothingToCancel,
    IGameEvents
} from "./GameErrors.sol";

/// Troop training queues (05-formulas.md#troop-training, D-11, D-13, D-14, B-29). Linked external
/// library. Mirrors `train` / `cancelTraining` in packages/rules/src/sim/missions.ts.
library Training {
    function _cost(uint256 troop, uint256 quantity)
        private
        pure
        returns (uint256[RESOURCES] memory cost)
    {
        uint256[RESOURCES] memory unit = Ruleset.troopCost()[troop];
        for (uint256 r; r < RESOURCES; ++r) {
            cost[r] = unit[r] * quantity;
        }
    }

    function train(address caller, uint64 id, uint256 troop, uint256 quantity) external {
        CoreState storage s = GameStorage.core();
        (, Player storage p, Building storage b) = Access.owned(s, caller, id);
        if (troop >= TROOPS) revert UnknownEntity();
        if (quantity < 1) revert NoUnits();
        Access.settleForAction(s, p, id);
        if (b.levels[Ruleset.trainedAt()[troop]] < 1) revert TimingRoomRequired(); // D-14
        if (!Costs.met(Ruleset.troopRequirements()[troop], b.levels, p.research)) {
            revert RequirementsNotMet();
        }
        TrainingItem[] storage q = b.training[Ruleset.ATTACK_TROOPS & (1 << troop) != 0 ? 0 : 1];
        uint256 limit = Access.isPremium(s, p) ? Ruleset.TROOP_QUEUE_PREMIUM : Ruleset.TROOP_QUEUE;
        if (q.length >= limit) revert QueueFull();
        uint256[RESOURCES] memory cost = _cost(troop, quantity);
        if (!Settlement.affordable(b, cost)) revert CannotAfford();
        Settlement.pay(b, cost);
        q.push(TrainingItem(uint8(troop), s.seq++, 0, uint64(quantity)));
        if (q.length == 1) {
            q[0].finishAt = uint40(block.timestamp + Settlement.trainingSeconds(b, q[0]));
        }
        emit IGameEvents.TroopsQueued(id, uint8(troop), uint64(quantity), q[q.length - 1].seq);
    }

    /// Cancel a batch (queue 0 = attack, 1 = defense): always refunded in full (paid when queued).
    function cancel(address caller, uint64 id, uint256 queue, uint256 position) external {
        CoreState storage s = GameStorage.core();
        (, Player storage p, Building storage b) = Access.owned(s, caller, id);
        Access.settleForAction(s, p, id);
        if (queue > 1 || position >= b.training[queue].length) revert NothingToCancel();
        TrainingItem[] storage q = b.training[queue];
        TrainingItem memory item = q[position];
        Settlement.shiftTraining(q, position);
        Settlement.credit(b, _cost(item.troop, item.quantity));
        if (position == 0 && q.length > 0) {
            q[0].finishAt = uint40(block.timestamp + Settlement.trainingSeconds(b, q[0]));
        }
        emit IGameEvents.TrainingCancelled(id, queue, position);
    }
}
