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
    TooLate,
    InvalidArrival,
    TroopsResting,
    OutOfOrder
} from "../../src/core/GameErrors.sol";
import {IGameEvents} from "../../src/core/GameErrors.sol";
import {GameTestBase} from "./GameTestBase.sol";
import {console} from "forge-std/Test.sol";

/// Hidden missions (B-22): commit, cover, reveal, parking (the world never stalls), the forfeit,
/// the recall of a parked mission and the fixed arrival.
contract HiddenMissionsTest is GameTestBase {
    uint256 internal constant S = Ruleset.STOCK_SCALE;
    uint256 internal constant BOOT_CAMP = 11;
    uint256 internal constant ROWDY = 0;
    uint256 internal constant DOLLAR = Ruleset.SALARY_RESOURCE;
    uint40 internal constant NATURAL = 0; // the arrival the inclusion gives
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
            1, _commit(kind, slot, SALT), cover, _rowdies(n), _none(), hex"c0ffee", NATURAL
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
        game.sendHiddenMission(1, bytes32(0), 0, _rowdies(1), _none(), "", NATURAL);
        vm.expectRevert(InvalidCover.selector); // beyond the farthest corner (~1,134 from 1:1:1)
        game.sendHiddenMission(1, bytes32(0), 1200, _rowdies(1), _none(), "", NATURAL);
        vm.stopPrank();
    }

    /// A fixed arrival goes from the natural one to HIDDEN_ARRIVAL_SLACK after it: TooLate before,
    /// InvalidArrival past. The way back keeps the duration.
    function test_sendArrival() public {
        Mission memory first = game.getMission(_sendHidden(ATTACK, 2, 3));
        uint256 natural = first.arrival;
        uint256 late = natural + Ruleset.HIDDEN_ARRIVAL_SLACK;
        bytes32 commit = _commit(ATTACK, 2, SALT);
        vm.startPrank(alice);
        vm.expectRevert(TooLate.selector);
        game.sendHiddenMission(1, commit, 3, _rowdies(1), _none(), "", uint40(natural - 1));
        vm.expectRevert(InvalidArrival.selector);
        game.sendHiddenMission(1, commit, 3, _rowdies(1), _none(), "", uint40(late + 1));
        uint64 id = game.sendHiddenMission(1, commit, 3, _rowdies(1), _none(), "", uint40(late));
        vm.stopPrank();
        Mission memory m = game.getMission(id);
        assertEq(m.arrival, late);
        assertEq(m.duration, first.duration);
        _reveal(id, ATTACK, 2, SALT); // before the arrival: resolves at it
        vm.warp(late);
        game.advance(5);
        m = game.getMission(id);
        assertTrue(m.returning);
        assertEq(m.arrival, late + first.duration);
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
            1, _commit(ATTACK, 40, SALT), 1, _rowdies(1), _none(), "", NATURAL
        );
        vm.expectRevert(InvalidCover.selector);
        _reveal(far, ATTACK, 40, SALT);

        // Cargo only travels with a transport.
        uint256[RESOURCES] memory res;
        res[0] = 10;
        vm.prank(alice);
        uint64 loaded =
            game.sendHiddenMission(1, _commit(ATTACK, 2, SALT), 3, _rowdies(1), res, "", NATURAL);
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

    /// The parked list keeps its arrival order when a mission leaves it (a linked list on-chain;
    /// the simulator mirrors the order): head, middle and tail removals.
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
        vm.warp(block.timestamp + Ruleset.HIDDEN_ORDER_WINDOW); // every window over: any order
        _reveal(b, ATTACK, 2, SALT); // the middle
        assertEq(_parked().length, 2);
        assertEq(_parked()[0], a);
        assertEq(_parked()[1], c);
        _reveal(a, ATTACK, 2, SALT); // the head
        assertEq(_parked().length, 1);
        assertEq(_parked()[0], c);
        uint64 d = _sendHiddenN(ATTACK, 2, 3, 1);
        vm.warp(game.getMission(d).arrival);
        game.advance(10);
        assertEq(_parked().length, 2);
        assertEq(_parked()[1], d, "appended at the tail");
        vm.prank(alice);
        game.recall(d); // the tail
        assertEq(_parked().length, 1);
        assertEq(_parked()[0], c);
        vm.warp(block.timestamp + Ruleset.HIDDEN_REVEAL_GRACE);
        game.forfeit(c); // the only one
        assertEq(_parked().length, 0);
        uint64 e = _sendHiddenN(ATTACK, 2, 3, 1);
        vm.warp(game.getMission(e).arrival);
        game.advance(10);
        assertEq(_parked().length, 1, "a fresh head after the list emptied");
        assertEq(_parked()[0], e);
    }

    /// Reveals go in arrival order for HIDDEN_ORDER_WINDOW: the second of two parked missions
    /// waits for the first, or for the first's window to pass when nobody reveals it (B-22).
    function test_revealsGoInArrivalOrderForTheWindow() public {
        uint64 a = _sendHiddenN(ATTACK, 2, 3, 2);
        uint64 b = _sendHiddenN(ATTACK, 2, 3, 2);
        uint256 arrival = game.getMission(b).arrival;
        vm.warp(arrival + 5);
        // Nothing drained yet: the reveal drains first, parks both, and b is out of order.
        vm.expectRevert(OutOfOrder.selector);
        _reveal(b, ATTACK, 2, SALT);
        assertEq(game.pendingMissions().length, 2, "reverted: nothing parked");
        _reveal(a, ATTACK, 2, SALT);
        assertEq(_parked().length, 1);
        assertEq(_parked()[0], b);
        _reveal(b, ATTACK, 2, SALT); // a is on its way: b may follow
        assertEq(_parked().length, 0);
        game.advance(10);

        // Garbage ahead holds the ones behind for the window only.
        uint64 c = _sendHiddenN(ATTACK, 2, 3, 1); // never revealed
        uint64 d = _sendHiddenN(ATTACK, 2, 3, 1);
        arrival = game.getMission(d).arrival;
        vm.warp(arrival + Ruleset.HIDDEN_ORDER_WINDOW - 1);
        vm.expectRevert(OutOfOrder.selector);
        _reveal(d, ATTACK, 2, SALT);
        vm.warp(arrival + Ruleset.HIDDEN_ORDER_WINDOW);
        _reveal(d, ATTACK, 2, SALT);
        assertEq(_parked().length, 1);
        assertEq(_parked()[0], c, "c waits for its forfeit");
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

    /// Troops that just came home rest: the building cannot send for RETURN_COOLDOWN (B-22), so
    /// an attack timed to land right after an enemy's return still catches them (the defender's
    /// send in the gap before the reveal would otherwise park the attack and move them out).
    function test_returnCooldown() public {
        vm.prank(alice);
        uint64 id = game.sendMission(1, ATTACK, [uint256(1), 1, 2], _rowdies(5), _none(), 0);
        vm.warp(game.getMission(id).arrival);
        game.advance(1); // resolves against bob and turns back
        uint256 home = game.getMission(id).arrival;
        vm.warp(home);
        game.advance(1);
        assertEq(game.getBuilding(1).troops[ROWDY], 7);
        assertEq(game.getBuilding(1).lastReturn, home);

        vm.warp(home + Ruleset.RETURN_COOLDOWN - 1);
        vm.startPrank(alice);
        vm.expectRevert(TroopsResting.selector);
        game.sendMission(1, ATTACK, [uint256(1), 1, 2], _rowdies(5), _none(), 0);
        vm.expectRevert(TroopsResting.selector);
        game.sendHiddenMission(1, _commit(ATTACK, 2, SALT), 3, _rowdies(5), _none(), "", NATURAL);
        vm.stopPrank();
        vm.prank(bob);
        game.queueRoom(2, BOOT_CAMP); // the world goes on; alice's troops stay home meanwhile
        assertEq(game.getBuilding(1).troops[ROWDY], 7);

        vm.warp(home + Ruleset.RETURN_COOLDOWN);
        vm.prank(alice);
        game.sendMission(1, ATTACK, [uint256(1), 1, 2], _rowdies(5), _none(), 0);
        assertEq(game.getBuilding(1).troops[ROWDY], 2);
    }

    /// The return cooldown outlasts the order window (B-22): a parked mission that arrived just
    /// after the defender's return (even the defender's own garbage) holds the attack's reveal
    /// until `attack arrival + window`, and the defender's troops must still be home by then.
    function test_interceptionSurvivesGarbageParkedAhead() public {
        vm.prank(bob);
        game.queueRoom(2, BOOT_CAMP);
        vm.warp(block.timestamp + 1 days);
        vm.prank(bob);
        game.train(2, ROWDY, 5);
        vm.warp(block.timestamp + 1 days);
        game.poke(2);
        uint256 start = block.timestamp;
        uint256[3] memory alicesHome = [uint256(1), 1, 1];

        // Measured on a snapshot: alice's hidden trip to bob's, bob's round trip to alice's.
        uint256 snap = vm.snapshotState();
        uint256 hiddenTrip = game.getMission(_sendHiddenN(ATTACK, 2, 3, 1)).arrival - start;
        vm.prank(bob);
        uint64 trip = game.sendMission(2, TRANSPORT, alicesHome, _rowdies(5), _none(), 0);
        vm.warp(game.getMission(trip).arrival);
        game.advance(10);
        uint256 roundTrip = game.getMission(trip).arrival - start;
        vm.revertToState(snap);
        vm.warp(start);

        vm.prank(bob);
        game.sendMission(2, TRANSPORT, alicesHome, _rowdies(5), _none(), 0);
        uint256 home = start + roundTrip; // bob's troops are home again
        vm.warp(home + 1 - hiddenTrip);
        uint64 garbage = _sendHiddenN(ATTACK, 2, 3, 1); // never revealed
        vm.warp(home + 2 - hiddenTrip);
        uint64 attack = _sendHiddenN(ATTACK, 2, 3, 5);
        assertEq(game.getMission(garbage).arrival, home + 1);
        assertEq(game.getMission(attack).arrival, home + 2);
        vm.warp(home);
        game.advance(10);
        assertEq(game.getBuilding(2).troops[ROWDY], 5);
        assertEq(game.getBuilding(2).lastReturn, home);

        // The keeper's reveal at home+10 is held by the garbage until home+16.
        vm.warp(home + 10);
        vm.expectRevert(OutOfOrder.selector);
        _reveal(attack, ATTACK, 2, SALT);
        assertEq(_parked().length, 0, "reverted: nothing parked");
        // With a 15 s cooldown bob would leave here, and the attack would find an empty building.
        vm.warp(home + 15);
        vm.prank(bob);
        vm.expectRevert(TroopsResting.selector);
        game.sendMission(2, TRANSPORT, alicesHome, _rowdies(5), _none(), 0);
        vm.warp(home + 16);
        _reveal(attack, ATTACK, 2, SALT);
        assertEq(_parked().length, 1);
        assertEq(_parked()[0], garbage);
        game.advance(10); // the battle: 5 rowdies against 5 at home
        assertEq(game.getBuilding(2).troops[ROWDY], 1);
        assertEq(game.getMission(attack).troops[ROWDY], 1);
        // The rest still rests until the cooldown is over (checked before the troops).
        vm.warp(home + Ruleset.RETURN_COOLDOWN - 1);
        vm.startPrank(bob);
        vm.expectRevert(TroopsResting.selector);
        game.sendMission(2, TRANSPORT, alicesHome, _rowdies(1), _none(), 0);
        vm.warp(home + Ruleset.RETURN_COOLDOWN);
        game.sendMission(2, TRANSPORT, alicesHome, _rowdies(1), _none(), 0);
        vm.stopPrank();
    }

    /// A forfeited mission's return starts the cooldown like any other return (B-22).
    function test_forfeitedReturnStartsTheCooldown() public {
        uint64 id = _sendHiddenN(ATTACK, 2, 3, 2);
        vm.warp(game.getMission(id).arrival + Ruleset.HIDDEN_REVEAL_GRACE);
        game.forfeit(id); // nobody revealed it: it turns back
        uint256 home = game.getMission(id).arrival;
        vm.warp(home);
        game.advance(10);
        assertEq(game.getBuilding(1).troops[ROWDY], 7);
        assertEq(game.getBuilding(1).lastReturn, home);
        vm.warp(home + Ruleset.RETURN_COOLDOWN - 1);
        vm.prank(alice);
        vm.expectRevert(TroopsResting.selector);
        game.sendHiddenMission(1, _commit(ATTACK, 2, SALT), 3, _rowdies(2), _none(), "", NATURAL);
        vm.warp(home + Ruleset.RETURN_COOLDOWN);
        _sendHiddenN(ATTACK, 2, 3, 2);
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
        uint64 id = game.sendHiddenMission(1, commit, 3, _rowdies(5), _none(), ciphertext, NATURAL);
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
