// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {TROOPS, RESEARCH} from "../../src/generated/VendettaRuleset.sol";
import {Combat} from "../../src/combat/Combat.sol";
import {TroopStats} from "../../src/combat/TroopStats.sol";

/// External entry point so tests can measure a whole battle (stats of both sides + resolution) as
/// one call, the way a mission contract will run it.
contract CombatHarness {
    function battle(
        uint256[TROOPS] memory attacker,
        uint256[TROOPS] memory defender,
        uint256[RESEARCH] memory attackerResearch,
        uint256[RESEARCH] memory defenderResearch,
        uint256 pctA,
        uint256 pctD
    ) external pure returns (Combat.Result memory) {
        TroopStats.Stats memory sa = TroopStats.combat(attackerResearch);
        TroopStats.Stats memory sd = TroopStats.combat(defenderResearch);
        return Combat.resolve(
            Combat.Side(attacker, sa.attack, sa.defense, pctA),
            Combat.Side(defender, sd.attack, sd.defense, pctD)
        );
    }
}
