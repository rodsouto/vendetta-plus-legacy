// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    TROOPS,
    RESEARCH,
    RESOURCES,
    ROOMS,
    VendettaRuleset as Ruleset
} from "../generated/VendettaRuleset.sol";
import {Combat} from "../combat/Combat.sol";
import {Honor} from "../combat/Honor.sol";
import {Loot} from "../combat/Loot.sol";
import {TroopStats} from "../combat/TroopStats.sol";
import {Building, Player, Mission, CoreState, GameStorage} from "./GameStorage.sol";
import {Settlement, SettleLib} from "./Settlement.sol";
import {IGameEvents, BattleReport} from "./GameErrors.sol";
import {FamilyRules} from "./Families.sol";

/// An attack mission against another player's building, at its arrival time (06-combat.md). Linked
/// external library, called by Missions. Mirrors `battle` in packages/rules/src/sim/missions.ts.
library Battle {
    function _settleResearch(Player storage p, uint256 t) private {
        if (p.researchBuilding != 0) SettleLib.settle(p.researchBuilding, t);
    }

    function _pct(Player storage p) private view returns (uint256) {
        return Honor.pct(p.buildings, p.research[Ruleset.HONOR_RESEARCH]);
    }

    function _side(uint64[TROOPS] memory count, uint16[RESEARCH] memory research, uint256 pct)
        private
        pure
        returns (Combat.Side memory side)
    {
        uint256[RESEARCH] memory levels;
        for (uint256 i; i < RESEARCH; ++i) {
            levels[i] = research[i];
        }
        TroopStats.Stats memory st = TroopStats.combat(levels);
        for (uint256 i; i < TROOPS; ++i) {
            side.count[i] = count[i];
        }
        (side.attack, side.defense, side.pct) = (st.attack, st.defense, pct);
    }

    /// Resolves the battle: survivors, troop points, loot into the mission cargo.
    function attack(uint64 missionId, uint64 buildingId, uint256 t) external {
        CoreState storage s = GameStorage.core();
        Player storage attacker = s.players[s.missions[missionId].owner];
        _settleResearch(attacker, t);
        Player storage defender = s.players[s.buildings[buildingId].owner];
        if (defender.researchBuilding != buildingId) _settleResearch(defender, t);
        BattleReport memory report = _fight(s, missionId, buildingId);
        emit IGameEvents.Battle(
            missionId,
            s.missions[missionId].owner,
            s.buildings[buildingId].owner,
            buildingId,
            report
        );
    }

    function _fight(CoreState storage s, uint64 missionId, uint64 buildingId)
        private
        returns (BattleReport memory report)
    {
        Mission storage m = s.missions[missionId];
        Building storage b = s.buildings[buildingId];
        Player storage attacker = s.players[m.owner];
        Player storage defender = s.players[b.owner];
        (report.attacker, report.defender) = (m.troops, b.troops);
        (report.attackerResearch, report.defenderResearch) = (attacker.research, defender.research);
        (report.attackerPct, report.defenderPct) = (_pct(attacker), _pct(defender));
        Combat.Result memory r = Combat.resolve(
            _side(report.attacker, report.attackerResearch, report.attackerPct),
            _side(report.defender, report.defenderResearch, report.defenderPct)
        );
        (report.attackerSurvivors, report.defenderSurvivors) =
        (r.attackerRemaining, r.defenderRemaining);
        if (_apply(m, b, attacker, defender, report)) {
            report.loot = _loot(m, b, attacker, r.attackerRemaining);
        }
    }

    /// Writes survivors and removes lost troop points; true if the defender has no troops left.
    function _apply(
        Mission storage m,
        Building storage b,
        Player storage attacker,
        Player storage defender,
        BattleReport memory report
    ) private returns (bool wiped) {
        uint64[TROOPS] memory lostA;
        uint64[TROOPS] memory lostD;
        wiped = true;
        for (uint256 i; i < TROOPS; ++i) {
            lostA[i] = report.attacker[i] - uint64(report.attackerSurvivors[i]);
            lostD[i] = report.defender[i] - uint64(report.defenderSurvivors[i]);
            m.troops[i] = uint64(report.attackerSurvivors[i]);
            b.troops[i] = uint64(report.defenderSurvivors[i]);
            if (report.defenderSurvivors[i] > 0) wiped = false;
        }
        uint256 cpA = Settlement.troopCentipoints(lostA);
        uint256 cpD = Settlement.troopCentipoints(lostD);
        attacker.centipoints -= uint128(cpA);
        defender.centipoints -= uint128(cpD);
        FamilyRules.warScore(GameStorage.core(), attacker, defender, cpA, cpD);
    }

    /// D-06: capacity of the survivors over the unprotected stock, in loot order.
    function _loot(
        Mission storage m,
        Building storage b,
        Player storage attacker,
        uint256[TROOPS] memory survivors
    ) private returns (uint256[RESOURCES] memory loot) {
        uint256[RESEARCH] memory levels;
        for (uint256 i; i < RESEARCH; ++i) {
            levels[i] = attacker.research[i];
        }
        uint256 capacity;
        for (uint256 i; i < TROOPS; ++i) {
            if (survivors[i] > 0) capacity += survivors[i] * TroopStats.capacity(i, levels);
        }
        uint256[RESOURCES] memory unprotected = _unprotected(b);
        uint256[RESOURCES] memory order = Ruleset.lootOrder();
        uint256[RESOURCES] memory ordered;
        for (uint256 k; k < RESOURCES; ++k) {
            ordered[k] = unprotected[order[k]];
        }
        uint256[RESOURCES] memory taken = Loot.apportion(capacity, ordered);
        for (uint256 k; k < RESOURCES; ++k) {
            uint256 i = order[k];
            loot[i] = taken[k];
            b.stock[i] -= uint128(taken[k] * Ruleset.STOCK_SCALE);
            m.cargo[i] += uint64(taken[k]);
        }
    }

    /// Whole stock above the protected amount of each resource (01-resources.md).
    function _unprotected(Building storage b) private view returns (uint256[RESOURCES] memory u) {
        uint256[ROOMS] memory res = Ruleset.storageResource();
        uint256[ROOMS] memory base = Ruleset.storageBase();
        uint256[ROOMS] memory perLevel = Ruleset.storagePerLevel();
        uint256[ROOMS] memory divisor = Ruleset.storageSafeDivisor();
        uint256[RESOURCES] memory safe;
        for (uint256 i; i < ROOMS; ++i) {
            if (res[i] == Ruleset.NO_RESOURCE) continue;
            safe[res[i]] = (base[i] + perLevel[i] * b.levels[i]) / divisor[i];
        }
        for (uint256 r; r < RESOURCES; ++r) {
            uint256 have = b.stock[r] / Ruleset.STOCK_SCALE;
            u[r] = have > safe[r] ? have - safe[r] : 0;
        }
    }
}
