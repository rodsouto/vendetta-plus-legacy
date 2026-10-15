// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {
    TROOPS,
    RESEARCH,
    VendettaRuleset as Ruleset
} from "../../src/generated/VendettaRuleset.sol";
import {Combat} from "../../src/combat/Combat.sol";
import {CombatHarness} from "./CombatHarness.sol";
import {Fixtures} from "./Fixtures.sol";

/// Gas of one whole battle (both sides' stats + resolution), B-08 target: < 3M.
contract CombatGasTest is Test {
    uint256 internal constant GAS_TARGET = 3_000_000;
    CombatHarness internal harness = new CombatHarness();

    /// Worst case: every attack type against every troop type (16 + 21 stacks, the most fights per
    /// round), searching the defender/attacker size ratio that keeps the battle going for 5 rounds.
    function test_gasWorstCase() public {
        uint256 worst;
        uint256 worstRounds;
        uint256 units = 100_000;
        for (uint256 k = 1; k <= 64; k *= 2) {
            uint256[TROOPS] memory attacker;
            uint256[TROOPS] memory defender;
            for (uint256 t; t < TROOPS; ++t) {
                if (Ruleset.ATTACK_TROOPS & (1 << t) != 0) attacker[t] = units;
                defender[t] = units * k / 16;
            }
            (uint256 gas, uint256 rounds) = _measure(attacker, defender, 20, 20);
            console.log("defender/attacker size x16:", k, "rounds:", rounds);
            console.log("  gas:", gas);
            if (gas > worst) (worst, worstRounds) = (gas, rounds);
        }
        console.log("WORST-CASE GAS:", worst, "rounds:", worstRounds);
        assertEq(worstRounds, Combat.MAX_ROUNDS, "worst case should last 5 rounds");
        assertLt(worst, GAS_TARGET);
    }

    /// Typical raid: a few attack types against a small defense.
    function test_gasTypical() public {
        uint256[TROOPS] memory attacker;
        uint256[TROOPS] memory defender;
        attacker[0] = 3_000;
        attacker[3] = 800;
        attacker[10] = 120;
        defender[16] = 1_500;
        defender[17] = 400;
        (uint256 gas, uint256 rounds) = _measure(attacker, defender, 8, 6);
        console.log("TYPICAL GAS:", gas, "rounds", rounds);
        assertLt(gas, GAS_TARGET);
    }

    function _measure(
        uint256[TROOPS] memory attacker,
        uint256[TROOPS] memory defender,
        uint256 researchA,
        uint256 researchD
    ) internal view returns (uint256 gas, uint256 rounds) {
        uint256[RESEARCH] memory ra = Fixtures.allResearch(researchA);
        uint256[RESEARCH] memory rd = Fixtures.allResearch(researchD);
        uint256 before = gasleft();
        Combat.Result memory r = harness.battle(attacker, defender, ra, rd, 100, 100);
        gas = before - gasleft();
        rounds = r.rounds;
    }
}
