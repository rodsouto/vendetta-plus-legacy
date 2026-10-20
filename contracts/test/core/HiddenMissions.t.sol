// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Game} from "../../src/Game.sol";
import {
    TROOPS,
    RESOURCES,
    VendettaRuleset as Ruleset
} from "../../src/generated/VendettaRuleset.sol";
import {Mission, ATTACK, TRANSPORT} from "../../src/core/GameStorage.sol";
import {Unrevealed, BadReveal, InvalidCover, InvalidMission} from "../../src/core/GameErrors.sol";
import {IGameEvents} from "../../src/core/GameErrors.sol";
import {GameTestBase} from "./GameTestBase.sol";
import {console} from "forge-std/Test.sol";

/// Hidden missions (B-22): commit, cover, bond, reveal, the blocking grace and the forfeit.
contract HiddenMissionsTest is GameTestBase {
    uint256 internal constant S = Ruleset.STOCK_SCALE;
    uint256 internal constant BOOT_CAMP = 11;
    uint256 internal constant ROWDY = 0;
    uint256 internal constant DOLLAR = Ruleset.SALARY_RESOURCE;
    bytes32 internal constant SALT = keccak256("salt");

    Game internal game;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal anyone = makeAddr("anyone");

    function setUp() public {
        vm.warp(T0);
        game = deployGame();
        vm.prank(admin);
        game.setGlobalPremium(T0 + 3650 days);
        vm.prank(alice);
        game.register(1, 1, 1);
        vm.prank(bob);
        game.register(1, 1, 2);
        vm.prank(alice);
        game.queueRoom(1, BOOT_CAMP);
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        game.train(1, ROWDY, 7);
        vm.warp(block.timestamp + 1 days);
        game.poke(1);
    }

    function _rowdies(uint256 n) internal pure returns (uint256[TROOPS] memory t) {
        t[ROWDY] = n;
    }

    function _none() internal pure returns (uint256[RESOURCES] memory r) {}

    function _commit(uint8 kind, uint256 slot, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint64(1), kind, uint256(1), uint256(1), slot, salt));
    }

    /// alice (player 1, slot 1:1:1) sends 5 rowdies to 1:1:`slot` hidden, with `cover`.
    function _sendHidden(uint8 kind, uint256 slot, uint32 cover) internal returns (uint64) {
        vm.prank(alice);
        return game.sendHiddenMission(
            1, _commit(kind, slot, SALT), cover, _rowdies(5), _none(), hex"c0ffee"
        );
    }

    function _reveal(uint64 id, uint8 kind, uint256 slot, bytes32 salt) internal {
        vm.prank(anyone);
        game.reveal(id, kind, [uint256(1), 1, slot], salt);
    }

    function test_sendHidesKindAndTarget() public {
        uint256 before = game.getBuilding(1).stock[DOLLAR];
        uint64 id = _sendHidden(ATTACK, 2, 3);
        Mission memory m = game.getMission(id);
        assertTrue(m.hidden);
        assertEq(m.kind, 0);
        assertEq(m.city, 0);
        assertEq(m.cover, 3);
        assertEq(m.bond, Ruleset.HIDDEN_MISSION_BOND);
        assertEq(m.fromSlot, 1);
        // The bond (plus the salary over the cover) left the building.
        assertGe(before - game.getBuilding(1).stock[DOLLAR], Ruleset.HIDDEN_MISSION_BOND * S);
    }

    function test_coverChecks() public {
        vm.startPrank(alice);
        vm.expectRevert(InvalidCover.selector);
        game.sendHiddenMission(1, bytes32(0), 0, _rowdies(1), _none(), "");
        vm.expectRevert(InvalidCover.selector); // beyond the farthest corner (~1,134 from 1:1:1)
        game.sendHiddenMission(1, bytes32(0), 1200, _rowdies(1), _none(), "");
        vm.stopPrank();
    }

    function test_revealChecks() public {
        uint64 id = _sendHidden(ATTACK, 2, 3);
        vm.expectRevert(BadReveal.selector);
        _reveal(id, ATTACK, 2, keccak256("other"));
        vm.expectRevert(BadReveal.selector);
        _reveal(id, TRANSPORT, 2, SALT); // the kind is committed too

        // Cover 1 is shorter than the distance to 1:1:40 (2 rows and 5 columns away).
        vm.prank(alice);
        uint64 far =
            game.sendHiddenMission(1, _commit(ATTACK, 40, SALT), 1, _rowdies(1), _none(), "");
        vm.expectRevert(InvalidCover.selector);
        _reveal(far, ATTACK, 40, SALT);

        // Cargo only travels with a transport.
        uint256[RESOURCES] memory res;
        res[0] = 10;
        vm.prank(alice);
        uint64 loaded = game.sendHiddenMission(1, _commit(ATTACK, 2, SALT), 3, _rowdies(1), res, "");
        vm.expectRevert(InvalidMission.selector);
        _reveal(loaded, ATTACK, 2, SALT);

        _reveal(id, ATTACK, 2, SALT);
        _reveal(id, ATTACK, 2, SALT); // already revealed: a no-op, so clients and keepers can race
        Mission memory m = game.getMission(id);
        assertEq(m.kind, ATTACK);
        assertEq(m.slot, 2);
    }

    function test_revealedAttackResolvesAndReturnsTheBond() public {
        uint64 id = _sendHidden(ATTACK, 2, 3);
        _reveal(id, ATTACK, 2, SALT);
        uint256 arrival = game.getMission(id).arrival;
        vm.warp(arrival - 1);
        game.poke(1);
        uint256 before = game.getBuilding(1).stock[DOLLAR];
        vm.warp(arrival);
        assertEq(game.advance(1), 1);
        Mission memory m = game.getMission(id);
        assertTrue(m.returning);
        assertEq(m.bond, 0);
        assertEq(m.cargo[0], 250); // bob was undefended: looted as a public attack would
        uint256 gained = game.getBuilding(1).stock[DOLLAR] - before; // bond + 1 s of production
        assertGe(gained, Ruleset.HIDDEN_MISSION_BOND * S);
        assertLt(gained, (Ruleset.HIDDEN_MISSION_BOND + 1) * S);
    }

    function test_unrevealedBlocksThenForfeits() public {
        uint64 id = _sendHidden(ATTACK, 2, 3);
        uint256 arrival = game.getMission(id).arrival;
        vm.warp(arrival);
        vm.prank(bob);
        vm.expectRevert(Unrevealed.selector); // bob cannot move first: the attack resolves first
        game.poke(2);
        assertEq(game.advance(5), 0);

        vm.warp(arrival + Ruleset.HIDDEN_REVEAL_GRACE - 1);
        vm.expectRevert(Unrevealed.selector);
        game.poke(2);

        vm.warp(arrival + Ruleset.HIDDEN_REVEAL_GRACE);
        vm.expectEmit(true, false, false, false, address(game));
        emit IGameEvents.MissionForfeited(id);
        game.advance(1);
        Mission memory m = game.getMission(id);
        assertTrue(m.returning);
        assertEq(m.bond, 0);
        assertEq(m.troops[ROWDY], 5);
        assertEq(m.arrival, arrival + m.duration); // turned back from its arrival time
        assertEq(game.getBuilding(2).stock[0], 10_000 * S, "bob untouched");
    }

    function test_revealUnblocksTheQueue() public {
        uint64 id = _sendHidden(ATTACK, 2, 3);
        vm.warp(game.getMission(id).arrival + 10);
        vm.expectRevert(Unrevealed.selector);
        game.poke(2);
        _reveal(id, ATTACK, 2, SALT); // no drain: works while the queue is blocked
        game.poke(2); // resolves the attack first
        assertTrue(game.getMission(id).returning);
    }

    function test_recallKeepsTheBond() public {
        uint64 id = _sendHidden(ATTACK, 2, 3);
        vm.warp(block.timestamp + 10);
        vm.prank(alice);
        game.recall(id);
        uint256 arrival = game.getMission(id).arrival;
        vm.warp(arrival - 1);
        game.poke(1);
        uint256 before = game.getBuilding(1).stock[DOLLAR];
        vm.warp(arrival);
        game.advance(1);
        assertGe(game.getBuilding(1).stock[DOLLAR] - before, Ruleset.HIDDEN_MISSION_BOND * S);
        assertEq(game.getBuilding(1).troops[ROWDY], 7);
    }

    /// D-18 at arrival: sent while bob was on vacation, it bounces even if bob is back by then.
    function test_vacationAtSendBounces() public {
        vm.prank(bob);
        game.startVacation();
        uint64 id = _sendHidden(ATTACK, 2, 3);
        vm.warp(block.timestamp + 1);
        vm.prank(bob);
        game.endVacation();
        _reveal(id, ATTACK, 2, SALT);
        vm.warp(game.getMission(id).arrival);
        game.advance(1);
        Mission memory m = game.getMission(id);
        assertTrue(m.returning);
        assertEq(m.cargo[0], 0, "no battle");
    }

    /// A vacation started after the mission left does not protect.
    function test_vacationAfterSendDoesNotProtect() public {
        uint64 id = _sendHidden(ATTACK, 2, 3);
        vm.warp(block.timestamp + 1);
        vm.prank(bob);
        game.startVacation();
        _reveal(id, ATTACK, 2, SALT);
        vm.warp(game.getMission(id).arrival);
        game.advance(1);
        assertEq(game.getMission(id).cargo[0], 250, "looted");
    }

    function test_gasHiddenSendAndReveal() public {
        bytes memory ciphertext = new bytes(400);
        bytes32 commit = _commit(ATTACK, 2, SALT);
        vm.prank(alice);
        uint256 g = gasleft();
        uint64 id = game.sendHiddenMission(1, commit, 3, _rowdies(5), _none(), ciphertext);
        console.log("sendHiddenMission (400-byte ciphertext):", g - gasleft());
        vm.prank(anyone);
        g = gasleft();
        game.reveal(id, ATTACK, [uint256(1), 1, 2], SALT);
        console.log("reveal:", g - gasleft());
    }
}
