// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {
    TROOPS,
    RESEARCH,
    RESOURCES,
    VendettaRuleset as Ruleset
} from "../../src/generated/VendettaRuleset.sol";
import {
    CoreState,
    GameStorage,
    Mission,
    Building,
    Player,
    ATTACK
} from "../../src/core/GameStorage.sol";
import {Battle} from "../../src/core/Battle.sol";

/// Writes a battle directly into the core storage and resolves it with the real Battle library
/// (storage reads and writes included), to measure the worst case against B-08.
contract BattleHarness {
    function setup(uint256 attackers, uint256 defenders, uint16 research) external {
        CoreState storage s = GameStorage.core();
        Player storage a = s.players[1];
        Player storage d = s.players[2];
        (a.buildings, d.buildings) = (1, 1);
        (a.centipoints, d.centipoints) = (type(uint96).max, type(uint96).max);
        for (uint256 i; i < RESEARCH; ++i) {
            (a.research[i], d.research[i]) = (research, research);
        }
        Mission storage m = s.missions[1];
        (m.owner, m.kind) = (1, ATTACK);
        Building storage b = s.buildings[1];
        b.owner = 2;
        for (uint256 t; t < TROOPS; ++t) {
            if (Ruleset.ATTACK_TROOPS & (1 << t) != 0) m.troops[t] = uint64(attackers);
            b.troops[t] = uint64(defenders);
        }
        for (uint256 r; r < RESOURCES; ++r) {
            b.stock[r] = uint128(1_000_000 * Ruleset.STOCK_SCALE);
        }
    }

    function attack() external {
        Battle.attack(1, 1, block.timestamp);
    }
}

contract BattleGasTest is Test {
    uint256 internal constant GAS_TARGET = 3_000_000;

    /// Same search as CombatGas.t.sol (16 attack types vs 21 types), now through storage.
    function test_gasWorstCaseBattleWithStorage() public {
        uint256 worst;
        for (uint256 k = 1; k <= 64; k *= 2) {
            BattleHarness h = new BattleHarness();
            h.setup(100_000, 100_000 * k / 16, 20);
            uint256 g = gasleft();
            h.attack();
            uint256 used = g - gasleft();
            console.log("defender/attacker x16:", k, "gas:", used);
            if (used > worst) worst = used;
        }
        console.log("WORST-CASE BATTLE WITH STORAGE:", worst);
        assertLt(worst, GAS_TARGET);
    }
}
