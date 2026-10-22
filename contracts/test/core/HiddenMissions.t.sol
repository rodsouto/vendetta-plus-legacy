// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Game} from "../../src/Game.sol";
import {
    TROOPS,
    RESOURCES,
    VendettaRuleset as Ruleset
} from "../../src/generated/VendettaRuleset.sol";
import {Mission, ATTACK, TRANSPORT} from "../../src/core/GameStorage.sol";
import {
    BadReveal,
    InvalidCover,
    InvalidMission,
    TooEarly,
    TooLate
} from "../../src/core/GameErrors.sol";
import {IGameEvents} from "../../src/core/GameErrors.sol";
import {GameTestBase} from "./GameTestBase.sol";
import {console} from "forge-std/Test.sol";

/// Hidden missions (B-22): commit, cover, reveal, parking (the world never stalls), the forfeit,
/// the recall of a parked mission and the send deadline.
contract HiddenMissionsTest is GameTestBase {
    uint256 internal constant S = Ruleset.STOCK_SCALE;
    uint256 internal constant BOOT_CAMP = 11;
    uint256 internal constant ROWDY = 0;
    uint256 internal constant DOLLAR = Ruleset.SALARY_RESOURCE;
    uint40 internal constant NO_DEADLINE = type(uint40).max;
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
        return _sendHiddenN(kind, slot, cover, 5);
    }

    function _sendHiddenN(uint8 kind, uint256 slot, uint32 cover, uint256 n)
        internal
        returns (uint64)
    {
        vm.prank(alice);
        return game.sendHiddenMission(
            1, _commit(kind, slot, SALT), cover, _rowdies(n), _none(), hex"c0ffee", NO_DEADLINE
        );
    }

    function _reveal(uint64 id, uint8 kind, uint256 slot, bytes32 salt) internal {
        vm.prank(anyone);
        game.reveal(id, kind, [uint256(1), 1, slot], salt);
    }

    function _parked() internal view returns (uint64[] memory) {
        return game.parkedMissions();
    }

    function test_sendHidesKindAndTarget() public {
        uint256 before = game.getBuilding(1).stock[DOLLAR];
        uint64 id = _sendHidden(ATTACK, 2, 3);
        Mission memory m = game.getMission(id);
        assertTrue(m.hidden);
        assertEq(m.kind, 0);
        assertEq(m.city, 0);
        assertEq(m.cover, 3);
        assertEq(m.fromSlot, 1);
        assertEq(game.getBuilding(1).troops[ROWDY], 2);
        // The salary over the cover left the building.
        assertGt(before, game.getBuilding(1).stock[DOLLAR]);
    }

    function test_coverChecks() public {
        vm.startPrank(alice);
        vm.expectRevert(InvalidCover.selector);
        game.sendHiddenMission(1, bytes32(0), 0, _rowdies(1), _none(), "", NO_DEADLINE);
        vm.expectRevert(InvalidCover.selector); // beyond the farthest corner (~1,134 from 1:1:1)
        game.sendHiddenMission(1, bytes32(0), 1200, _rowdies(1), _none(), "", NO_DEADLINE);
        vm.stopPrank();
    }

    /// The deadline is the latest arrival the timelock allows: a later one reverts TooLate.
    function test_sendDeadline() public {
        uint256 arrival = game.getMission(_sendHidden(ATTACK, 2, 3)).arrival;
        vm.startPrank(alice);
        vm.expectRevert(TooLate.selector);
        game.sendHiddenMission(
            1, _commit(ATTACK, 2, SALT), 3, _rowdies(1), _none(), "", uint40(arrival - 1)
        );
        game.sendHiddenMission(
            1, _commit(ATTACK, 2, SALT), 3, _rowdies(1), _none(), "", uint40(arrival)
        );
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
        uint64 far = game.sendHiddenMission(
            1, _commit(ATTACK, 40, SALT), 1, _rowdies(1), _none(), "", NO_DEADLINE
        );
        vm.expectRevert(InvalidCover.selector);
        _reveal(far, ATTACK, 40, SALT);

        // Cargo only travels with a transport.
        uint256[RESOURCES] memory res;
        res[0] = 10;
        vm.prank(alice);
        uint64 loaded = game.sendHiddenMission(
            1, _commit(ATTACK, 2, SALT), 3, _rowdies(1), res, "", NO_DEADLINE
        );
        vm.expectRevert(InvalidMission.selector);
        _reveal(loaded, ATTACK, 2, SALT);

        _reveal(id, ATTACK, 2, SALT);
        _reveal(id, ATTACK, 2, SALT); // already revealed: a no-op, so clients and keepers can race
        Mission memory m = game.getMission(id);
        assertEq(m.kind, ATTACK);
        assertEq(m.slot, 2);
    }

    /// Revealed before it arrives, a hidden mission resolves at its arrival like a public one.
    function test_revealedBeforeArrivalResolvesAtArrival() public {
        uint64 id = _sendHidden(ATTACK, 2, 3);
        _reveal(id, ATTACK, 2, SALT);
        uint256 arrival = game.getMission(id).arrival;
        vm.warp(arrival);
        assertEq(game.advance(1), 1);
        Mission memory m = game.getMission(id);
        assertTrue(m.returning);
        assertEq(m.cargo[0], 250); // bob was undefended: looted as a public attack would
        assertEq(_parked().length, 0);
    }

    /// A due hidden mission nobody revealed is parked: the queue goes on, every action works, and
    /// the reveal brings it back with the reveal time as its arrival (B-22).
    function test_dueUnrevealedIsParkedAndTheWorldGoesOn() public {
        uint64 id = _sendHidden(ATTACK, 2, 3);
        uint256 arrival = game.getMission(id).arrival;
        vm.warp(arrival);
        vm.expectEmit(true, false, false, false, address(game));
        emit IGameEvents.MissionParked(id);
        vm.prank(bob);
        game.poke(2); // bob moves first: the attack waits for its reveal, parked
        assertEq(_parked().length, 1);
        assertEq(_parked()[0], id);
        assertEq(game.pendingMissions().length, 0);
        assertEq(game.advance(5), 0);
        // Bob keeps playing meanwhile (the world does not stall).
        vm.prank(bob);
        game.queueRoom(2, BOOT_CAMP);
        assertEq(game.getBuilding(2).roomQueue.length, 1);

        vm.warp(arrival + 10);
        _reveal(id, ATTACK, 2, SALT);
        assertEq(_parked().length, 0);
        assertEq(game.pendingMissions().length, 1);
        Mission memory m = game.getMission(id);
        assertFalse(m.hidden);
        assertEq(m.arrival, arrival + 10, "arrives at the reveal");
        assertEq(game.advance(1), 1);
        m = game.getMission(id);
        assertTrue(m.returning);
        assertGt(m.cargo[0], 0, "resolved as an attack against bob's state at the reveal");
        assertEq(m.start, arrival + 10);
    }

    /// A reveal after the arrival but before anything drained the queue also moves the arrival to
    /// the reveal: a due hidden mission always resolves at its reveal.
    function test_revealOfADueMissionStillQueuedResolvesAtTheReveal() public {
        uint64 id = _sendHidden(ATTACK, 2, 3);
        uint256 arrival = game.getMission(id).arrival;
        vm.warp(arrival + 5);
        assertEq(game.pendingMissions().length, 1);
        _reveal(id, ATTACK, 2, SALT);
        assertEq(game.getMission(id).arrival, arrival + 5);
        assertEq(game.pendingMissions().length, 1);
        assertEq(_parked().length, 0);
        game.advance(1);
        assertEq(game.getMission(id).cargo[0], 250, "looted");
    }

    /// The parked list is a swap-remove list, as the simulator mirrors it.
    function test_parkedListOrder() public {
        uint64 a = _sendHiddenN(ATTACK, 2, 3, 3);
        uint64 b = _sendHiddenN(ATTACK, 2, 3, 2);
        uint64 c = _sendHiddenN(ATTACK, 2, 3, 1);
        vm.warp(game.getMission(c).arrival);
        game.poke(1);
        assertEq(_parked().length, 3);
        assertEq(_parked()[0], a);
        assertEq(_parked()[1], b);
        assertEq(_parked()[2], c);
        _reveal(a, ATTACK, 2, SALT);
        assertEq(_parked().length, 2);
        assertEq(_parked()[0], c, "the last one took the slot of the revealed one");
        assertEq(_parked()[1], b);
        _reveal(b, ATTACK, 2, SALT);
        assertEq(_parked().length, 1);
        assertEq(_parked()[0], c);
    }

    /// Past the grace, anyone forfeits a parked mission: it turns back from that moment.
    function test_forfeitAfterTheGrace() public {
        uint64 id = _sendHidden(ATTACK, 2, 3);
        uint256 arrival = game.getMission(id).arrival;
        vm.warp(arrival);
        game.poke(2);
        assertEq(_parked().length, 1);
        vm.warp(arrival + Ruleset.HIDDEN_REVEAL_GRACE - 1);
        vm.expectRevert(TooEarly.selector);
        game.forfeit(id);
        vm.warp(arrival + Ruleset.HIDDEN_REVEAL_GRACE);
        _reveal(id, ATTACK, 2, SALT); // past the grace a reveal does nothing
        assertTrue(game.getMission(id).hidden);
        vm.warp(arrival + Ruleset.HIDDEN_REVEAL_GRACE + 7);
        vm.expectEmit(true, false, false, false, address(game));
        emit IGameEvents.MissionForfeited(id);
        vm.prank(anyone);
        game.forfeit(id);
        Mission memory m = game.getMission(id);
        assertTrue(m.returning);
        assertTrue(m.hidden, "never revealed");
        assertEq(m.troops[ROWDY], 5);
        assertEq(m.cargo[0], 0, "bob untouched");
        assertEq(m.start, arrival + Ruleset.HIDDEN_REVEAL_GRACE + 7, "turned back from now");
        assertEq(m.arrival, m.start + m.duration);
        assertEq(_parked().length, 0);
        game.forfeit(id); // no longer hidden and parked: a no-op, the keeper and the sender race
        vm.warp(m.arrival);
        game.advance(1);
        assertEq(game.getBuilding(1).troops[ROWDY], 7, "home");
    }

    /// A due mission nothing drained yet can be forfeited straight from the queue.
    function test_forfeitWorksOnAQueuedDueMission() public {
        uint64 id = _sendHidden(ATTACK, 2, 3);
        vm.warp(game.getMission(id).arrival + Ruleset.HIDDEN_REVEAL_GRACE);
        assertEq(game.pendingMissions().length, 1);
        game.forfeit(id);
        assertTrue(game.getMission(id).returning);
        assertEq(game.pendingMissions().length, 1, "the return is queued");
        assertEq(_parked().length, 0);
    }

    /// A parked mission can be recalled like any other: it turns back from now.
    function test_recallOfAParkedMission() public {
        uint64 id = _sendHidden(ATTACK, 2, 3);
        uint256 arrival = game.getMission(id).arrival;
        vm.warp(arrival);
        game.poke(2);
        assertEq(_parked().length, 1);
        vm.warp(arrival + 10);
        vm.prank(alice);
        game.recall(id);
        assertEq(_parked().length, 0);
        Mission memory m = game.getMission(id);
        assertTrue(m.returning);
        assertEq(m.start, arrival + 10);
        vm.warp(m.arrival);
        game.advance(1);
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

    /// A vacation started after the mission left does not protect, not even in the same second
    /// (B-07: ordered by creation).
    function test_vacationAfterSendDoesNotProtect() public {
        uint64 id = _sendHidden(ATTACK, 2, 3);
        vm.prank(bob);
        game.startVacation(); // same second, after the send
        assertEq(game.getPlayer(2).vacationStart, game.getMission(id).start);
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
        uint64 id =
            game.sendHiddenMission(1, commit, 3, _rowdies(5), _none(), ciphertext, NO_DEADLINE);
        console.log("sendHiddenMission (400-byte ciphertext):", g - gasleft());
        vm.prank(anyone);
        g = gasleft();
        game.reveal(id, ATTACK, [uint256(1), 1, 2], SALT);
        console.log("reveal before the arrival:", g - gasleft());
        uint64 parked = _sendHiddenN(ATTACK, 2, 3, 2);
        vm.warp(game.getMission(parked).arrival);
        g = gasleft();
        game.advance(2);
        console.log("advance: one resolved, one parked:", g - gasleft());
        vm.prank(anyone);
        g = gasleft();
        game.reveal(parked, ATTACK, [uint256(1), 1, 2], SALT);
        console.log("reveal of a parked mission (re-queued):", g - gasleft());
    }
}
