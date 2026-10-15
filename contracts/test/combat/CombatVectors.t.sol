// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {TROOPS} from "../../src/generated/VendettaRuleset.sol";
import {Combat} from "../../src/combat/Combat.sol";
import {CombatHarness} from "./CombatHarness.sol";
import {Fixtures} from "./Fixtures.sol";

/// Every target-rule combat vector (combat_target_vendetta + _random): rounds, survivors and
/// deaths per round and troop type must match the reference implementation exactly.
contract CombatVectorsTest is Test {
    CombatHarness internal harness = new CombatHarness();

    function test_combatVectors() public {
        Fixtures.CombatCase[] memory cases = Fixtures.combat();
        uint256 mismatches;
        for (uint256 i; i < cases.length; ++i) {
            if (!_matches(cases[i])) {
                ++mismatches;
                console.log("mismatch:", i, cases[i].label);
            }
        }
        console.log("combat cases:", cases.length, "mismatches:", mismatches);
        assertEq(mismatches, 0);
    }

    function _matches(Fixtures.CombatCase memory c) internal view returns (bool) {
        Combat.Result memory r = harness.battle(
            Fixtures.troops(c.attacker),
            Fixtures.troops(c.defender),
            Fixtures.allResearch(c.researchA),
            Fixtures.allResearch(c.researchD),
            c.pctA,
            c.pctD
        );
        if (r.rounds != c.rounds) return false;
        for (uint256 t; t < TROOPS; ++t) {
            if (r.attackerRemaining[t] != c.attackerRemaining[t]) return false;
            if (r.defenderRemaining[t] != c.defenderRemaining[t]) return false;
            for (uint256 n; n < c.rounds; ++n) {
                if (r.attackerDeaths[n][t] != c.attackerDeaths[n][t]) return false;
                if (r.defenderDeaths[n][t] != c.defenderDeaths[n][t]) return false;
            }
        }
        return true;
    }
}
