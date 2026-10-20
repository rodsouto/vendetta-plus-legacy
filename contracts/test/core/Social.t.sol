// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Game} from "../../src/Game.sol";
import {
    TROOPS,
    RESOURCES,
    VendettaRuleset as Ruleset
} from "../../src/generated/VendettaRuleset.sol";
import {
    Mission,
    War,
    Trade,
    ATTACK,
    TRANSPORT,
    SUBCAPO,
    OFFER_SURRENDER
} from "../../src/core/GameStorage.sol";
import {
    OnVacation,
    Suspended,
    TargetOnVacation,
    VacationCooldown,
    MissionsInFlight,
    NameTaken,
    InvalidName,
    NotAllowed,
    AlreadyAtWar,
    InvalidOffer,
    TooManyOffers,
    InvalidTrade,
    InDebt,
    TradeOpen,
    InvalidClaim,
    NotOwner,
    ControllerTaken,
    NotRegistered,
    QueueFull,
    IGameEvents
} from "../../src/core/GameErrors.sol";
import {GameTestBase} from "./GameTestBase.sol";
import {console} from "forge-std/Test.sol";

/// Vacation, sanctions, premium, transfer, families, wars and market (09-social.md, D-18-D-20,
/// B-11, B-14, B-25, B-26, B-31).
contract SocialTest is GameTestBase {
    uint256 internal constant BOOT_CAMP = 11;
    uint256 internal constant MOB_SCHOOL = 1;
    uint256 internal constant ROWDY = 0;
    uint256 internal constant WEAPONS = 0;
    uint256 internal constant DOLLAR = 3;

    Game internal game;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function setUp() public {
        vm.warp(T0);
        game = deployGame();
        vm.prank(alice);
        game.register(1, 1, 1);
        vm.prank(bob);
        game.register(1, 1, 2);
        vm.prank(carol);
        game.register(1, 1, 3);
    }

    function _none() internal pure returns (uint256[RESOURCES] memory r) {}

    function _rowdies(uint256 n) internal pure returns (uint256[TROOPS] memory t) {
        t[ROWDY] = n;
    }

    /// alice gets a boot camp and n rowdies.
    function _army(uint256 n) internal {
        vm.prank(alice);
        game.queueRoom(1, BOOT_CAMP);
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        game.train(1, ROWDY, n);
        vm.warp(block.timestamp + 1 days);
    }

    /// `who`, owner of `building`, gets a boot camp and `n` rowdies; two days pass.
    function _armyFor(address who, uint64 building, uint256 n) internal {
        vm.prank(who);
        game.queueRoom(building, BOOT_CAMP);
        vm.warp(block.timestamp + 1 days);
        vm.prank(who);
        game.train(building, ROWDY, n);
        vm.warp(block.timestamp + 1 days);
    }

    function _only(uint256 r, uint256 n) internal pure returns (uint256[RESOURCES] memory a) {
        a[r] = n;
    }

    /// A transport with `rowdies` rowdies from `building` (owner `who`) to `to`, processed on arrival.
    function _ship(
        address who,
        uint64 building,
        uint256[3] memory to,
        uint256 rowdies,
        uint256[RESOURCES] memory cargo,
        uint64 trade
    ) internal {
        vm.prank(who);
        uint64 id = game.sendMission(building, TRANSPORT, to, _rowdies(rowdies), cargo, trade);
        vm.warp(game.getMission(id).arrival);
        game.advance(10);
    }

    /// Every mission home.
    function _allHome() internal {
        for (;;) {
            uint64[] memory ids = game.pendingMissions();
            if (ids.length == 0) return;
            uint256 next = type(uint256).max;
            for (uint256 i; i < ids.length; ++i) {
                uint256 a = game.getMission(ids[i]).arrival;
                if (a < next) next = a;
            }
            if (next > block.timestamp) vm.warp(next);
            game.advance(10);
        }
    }

    function _weapons(uint64 building) internal view returns (uint256) {
        return game.getBuilding(building).stock[WEAPONS] / Ruleset.STOCK_SCALE;
    }

    /// Alice sells Bob 300 weapons for 100 dollars, delivers them all and Bob pays `dollars`.
    /// Returns the trade; the window is still open.
    function _defaulted(uint256 dollars) internal returns (uint64 t) {
        vm.prank(alice);
        t = game.offerTrade(2, WEAPONS, 300, _only(DOLLAR, 100));
        _armyFor(alice, 1, 3);
        _armyFor(bob, 2, 3);
        vm.prank(bob);
        game.acceptTrade(t);
        _ship(alice, 1, [uint256(1), 1, 2], 3, _only(WEAPONS, 300), t);
        if (dollars > 0) _ship(bob, 2, [uint256(1), 1, 1], 3, _only(DOLLAR, dollars), t);
        _allHome();
    }

    /// Moves past the window and makes room for weapons in Alice's building (a mob school).
    function _afterWindow(uint64 t) internal {
        vm.warp(uint256(game.getTrade(t).acceptedAt) + Ruleset.MARKET_WINDOW_SECONDS + 1);
        vm.prank(alice);
        game.queueRoom(1, MOB_SCHOOL);
    }

    // ------------------------------------------------------------------ account

    function test_vacationLocksAndProtects() public {
        vm.prank(bob);
        game.startVacation();
        vm.prank(bob);
        vm.expectRevert(OnVacation.selector);
        game.queueRoom(2, 0);
        _army(1);
        vm.prank(alice);
        vm.expectRevert(TargetOnVacation.selector);
        game.sendMission(1, ATTACK, [uint256(1), 1, 2], _rowdies(1), _none(), 0);
        vm.prank(bob);
        game.endVacation();
        vm.warp(block.timestamp + 6 days);
        vm.prank(bob);
        vm.expectRevert(VacationCooldown.selector);
        game.startVacation();
        vm.warp(block.timestamp + 1 days);
        vm.prank(bob);
        game.startVacation();
    }

    function test_noVacationWithMissionsInFlight() public {
        _army(1);
        vm.prank(alice);
        game.sendMission(1, ATTACK, [uint256(1), 1, 50], _rowdies(1), _none(), 0);
        vm.prank(alice);
        vm.expectRevert(MissionsInFlight.selector);
        game.startVacation();
    }

    function test_suspendedCannotActButCanBeAttacked() public {
        _army(3);
        vm.prank(admin);
        game.suspend(2, block.timestamp + 10 days);
        vm.prank(bob);
        vm.expectRevert(Suspended.selector);
        game.queueRoom(2, 0);
        vm.prank(alice);
        game.sendMission(1, ATTACK, [uint256(1), 1, 2], _rowdies(3), _none(), 0); // allowed (B-14)
        vm.prank(admin);
        game.suspend(2, 0);
        vm.prank(bob);
        game.queueRoom(2, 0);
    }

    function test_premiumRaisesQueueLimits() public {
        vm.startPrank(alice);
        game.queueRoom(1, 2);
        vm.expectRevert(QueueFull.selector);
        game.queueRoom(1, 2);
        vm.stopPrank();
        vm.prank(admin);
        game.grantPremium(1, block.timestamp + 30 days);
        vm.prank(alice);
        game.queueRoom(1, 2);
    }

    function test_transferMovesTheAccount() public {
        address dave = makeAddr("dave");
        vm.prank(alice);
        vm.expectRevert(ControllerTaken.selector);
        game.transferPlayer(bob);
        vm.prank(alice);
        game.transferPlayer(dave);
        assertEq(game.playerOf(dave), 1);
        assertEq(game.playerOf(alice), 0);
        vm.prank(alice);
        vm.expectRevert(NotRegistered.selector);
        game.queueRoom(1, 0);
        vm.prank(dave);
        game.queueRoom(1, 0);
    }

    // ------------------------------------------------------------------ families and wars

    function test_familyNamesUniqueIgnoringCase() public {
        vm.prank(alice);
        game.createFamily("MOB", "The Mob");
        vm.prank(bob);
        vm.expectRevert(NameTaken.selector);
        game.createFamily("mob", "Other");
        vm.prank(bob);
        vm.expectRevert(InvalidName.selector);
        game.createFamily("A", "Too short tag");
        vm.prank(bob);
        vm.expectRevert(InvalidName.selector);
        game.createFamily(unicode"Ñu", "Not ASCII");
    }

    function test_familyPermissions() public {
        vm.prank(alice);
        uint64 f = game.createFamily("MOB", "The Mob");
        vm.prank(bob);
        game.applyToFamily(f);
        vm.prank(carol);
        vm.expectRevert(NotAllowed.selector); // not a leader of any family
        game.answerApplication(2, true);
        vm.prank(alice);
        game.answerApplication(2, true);
        assertEq(game.getPlayer(2).family, f);
        vm.prank(alice);
        game.setRank(2, SUBCAPO);
        vm.prank(bob);
        vm.expectRevert(NotAllowed.selector); // the Capo cannot be kicked (D-20)
        game.kickMember(1);
        vm.prank(alice);
        vm.expectRevert(NotAllowed.selector); // the Capo cannot leave
        game.leaveFamily();
        vm.prank(alice);
        game.dissolveFamily();
        assertFalse(game.getFamily(f).alive);
        vm.prank(bob); // bob's membership lapsed with the family: he can found one with the freed tag
        game.createFamily("mob", "New Mob");
    }

    function test_warScoreAndSurrender() public {
        vm.prank(alice);
        uint64 fa = game.createFamily("AAA", "Alpha");
        vm.prank(bob);
        uint64 fb = game.createFamily("BBB", "Beta");
        vm.prank(alice);
        uint64 war = game.declareWar(fb);
        vm.prank(bob);
        vm.expectRevert(AlreadyAtWar.selector);
        game.declareWar(fa);
        // bob defends with rowdies too, so both sides lose troops.
        vm.prank(bob);
        game.queueRoom(2, BOOT_CAMP);
        _army(7);
        vm.prank(bob);
        game.train(2, ROWDY, 7);
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        uint64 id = game.sendMission(1, ATTACK, [uint256(1), 1, 2], _rowdies(7), _none(), 0);
        vm.warp(game.getMission(id).arrival);
        game.advance(1);
        War memory w = game.getWar(war);
        assertGt(w.lostA, 0);
        assertGt(w.lostB, 0);
        assertEq(w.lostA % 600, 0); // rowdies are worth 6 points
        vm.prank(bob);
        game.offerPeace(war, OFFER_SURRENDER);
        vm.prank(alice);
        game.answerPeace(war, true);
        w = game.getWar(war);
        assertTrue(w.ended);
        assertEq(w.winner, fa);
    }

    // ------------------------------------------------------------------ market

    function test_marketRatesAndCap() public {
        uint256[RESOURCES] memory price;
        price[3] = 99; // 300 weapons are worth 100 dollars at 3-5-1
        vm.startPrank(alice);
        vm.expectRevert(InvalidOffer.selector);
        game.offerTrade(2, 0, 300, price);
        price[3] = 100;
        for (uint256 i; i < Ruleset.MAX_OPEN_OFFERS; ++i) {
            game.offerTrade(2, 0, 300, price);
        }
        vm.expectRevert(TooManyOffers.selector);
        game.offerTrade(2, 0, 300, price);
        vm.stopPrank();
    }

    function test_marketDeliveryByTradeId() public {
        uint256[RESOURCES] memory price;
        price[3] = 100;
        vm.prank(alice);
        uint64 t = game.offerTrade(2, 0, 300, price);
        _army(2);
        uint256[RESOURCES] memory res;
        res[0] = 150;
        vm.prank(alice);
        vm.expectRevert(InvalidTrade.selector); // not accepted yet
        game.sendMission(1, TRANSPORT, [uint256(1), 1, 2], _rowdies(2), res, t);
        vm.prank(bob);
        game.acceptTrade(t);
        vm.prank(alice);
        uint64 id = game.sendMission(1, TRANSPORT, [uint256(1), 1, 2], _rowdies(2), res, t);
        vm.warp(game.getMission(id).arrival);
        game.advance(1);
        Trade memory tr = game.getTrade(t);
        assertEq(tr.delivered, 150);
        assertEq(tr.rate, 0); // 3-5-1
    }

    function test_marketShipmentCountsUpToWhatRemains() public {
        uint256[RESOURCES] memory price;
        price[DOLLAR] = 100;
        vm.prank(alice);
        uint64 t = game.offerTrade(2, WEAPONS, 300, price);
        _armyFor(alice, 1, 3);
        vm.prank(bob);
        game.acceptTrade(t);
        uint256[RESOURCES] memory cargo;
        cargo[WEAPONS] = 400; // 300 count, the rest and the ammunition are a plain transport
        cargo[1] = 7;
        _ship(alice, 1, [uint256(1), 1, 2], 3, cargo, t);
        assertEq(game.getTrade(t).delivered, 300);
    }

    function test_marketVacationLock() public {
        uint256[RESOURCES] memory price;
        price[DOLLAR] = 100;
        vm.prank(alice);
        uint64 t = game.offerTrade(2, WEAPONS, 300, price);
        vm.prank(carol);
        game.startVacation(); // not a party
        vm.prank(bob);
        game.acceptTrade(t);
        uint256 lock = block.timestamp + Ruleset.MARKET_WINDOW_SECONDS;
        assertEq(game.getPlayer(1).tradeLockUntil, lock);
        assertEq(game.getPlayer(2).tradeLockUntil, lock);
        vm.prank(alice);
        vm.expectRevert(TradeOpen.selector);
        game.startVacation();
        vm.warp(lock);
        vm.prank(bob);
        vm.expectRevert(TradeOpen.selector);
        game.startVacation();
        vm.warp(lock + 1);
        vm.prank(bob);
        game.startVacation();
    }

    function test_marketClaimRegistersAndPaysTheDebt() public {
        uint64 t = _defaulted(40); // Bob owes (300 − 120) × 1.1 = 198 weapons
        vm.prank(alice);
        vm.expectRevert(InvalidTrade.selector); // the window is open
        game.claimTrade(t, 2, 1, _only(WEAPONS, 1));
        _afterWindow(t);

        vm.prank(bob);
        vm.expectRevert(InvalidTrade.selector); // the debtor
        game.claimTrade(t, 2, 1, _only(WEAPONS, 1));
        vm.prank(carol);
        vm.expectRevert(InvalidTrade.selector); // a third party
        game.claimTrade(t, 2, 1, _only(WEAPONS, 1));
        vm.startPrank(alice);
        vm.expectRevert(NotOwner.selector); // into the debtor's own building
        game.claimTrade(t, 2, 2, _only(WEAPONS, 1));
        vm.expectRevert(NotOwner.selector); // from somebody else's
        game.claimTrade(t, 3, 1, _only(WEAPONS, 1));
        uint256[RESOURCES] memory zero;
        vm.expectRevert(InvalidClaim.selector);
        game.claimTrade(t, 2, 1, zero);
        vm.expectRevert(InvalidClaim.selector); // more than owed
        game.claimTrade(t, 2, 1, _only(WEAPONS, 199));
        vm.expectRevert(InvalidClaim.selector); // not owed
        game.claimTrade(t, 2, 1, _only(DOLLAR, 1));

        uint256 before = _weapons(1);
        uint64[RESOURCES] memory moved;
        moved[WEAPONS] = 100;
        vm.expectEmit();
        emit IGameEvents.DebtRegistered(t, 2, 1);
        vm.expectEmit();
        emit IGameEvents.TradeClaimed(t, moved);
        uint256 g = gasleft();
        game.claimTrade(t, 2, 1, _only(WEAPONS, 100));
        console.log("claimTrade (first, registers the debt):", g - gasleft());
        assertEq(_weapons(1), before + 100);
        Trade memory tr = game.getTrade(t);
        assertTrue(tr.registered);
        assertEq(tr.returned[WEAPONS], 100);
        assertEq(game.getPlayer(2).debts, 1);
        assertEq(game.owes(2, 1), 1);

        vm.expectEmit();
        emit IGameEvents.DebtPaid(t);
        game.claimTrade(t, 2, 1, _only(WEAPONS, 98));
        assertEq(game.getTrade(t).returned[WEAPONS], 198);
        assertEq(game.getPlayer(2).debts, 0);
        assertEq(game.owes(2, 1), 0);
        vm.expectRevert(InvalidTrade.selector); // nothing left
        game.claimTrade(t, 2, 1, _only(WEAPONS, 1));
        vm.stopPrank();
    }

    function test_marketDebtRestrictionsAndBounce() public {
        uint64 t = _defaulted(0); // Bob owes 330 weapons
        _afterWindow(t);
        vm.prank(bob);
        game.offerTrade(3, 1, 500, _only(DOLLAR, 100)); // nothing registered yet
        vm.prank(alice);
        game.claimTrade(t, 2, 1, _only(WEAPONS, 30));
        assertEq(game.getPlayer(2).debts, 1);

        vm.prank(carol);
        uint64 offered = game.offerTrade(2, 1, 500, _only(DOLLAR, 100));
        vm.startPrank(bob);
        vm.expectRevert(InDebt.selector);
        game.offerTrade(3, 1, 500, _only(DOLLAR, 100));
        vm.expectRevert(InDebt.selector);
        game.acceptTrade(offered);
        vm.expectRevert(InDebt.selector);
        game.startVacation();
        vm.expectRevert(InDebt.selector); // a third party
        game.sendMission(2, TRANSPORT, [uint256(1), 1, 3], _rowdies(1), _only(WEAPONS, 5), 0);
        vm.expectRevert(InDebt.selector); // an empty slot
        game.sendMission(2, TRANSPORT, [uint256(1), 1, 9], _rowdies(1), _only(WEAPONS, 5), 0);
        game.sendMission(2, ATTACK, [uint256(1), 1, 3], _rowdies(1), _only(WEAPONS, 0), 0); // not a transport
        game.sendMission(2, TRANSPORT, [uint256(1), 1, 1], _rowdies(1), _only(WEAPONS, 5), 0); // the creditor
        // A hidden transport leaves unchecked and turns back with its cargo on arrival.
        bytes32 salt = bytes32(uint256(7));
        bytes32 commit =
            keccak256(abi.encode(uint64(2), TRANSPORT, uint256(1), uint256(1), uint256(3), salt));
        uint64 hidden = game.sendHiddenMission(2, commit, 3, _rowdies(1), _only(WEAPONS, 5), hex"");
        vm.stopPrank();
        vm.warp(game.getMission(hidden).arrival);
        game.reveal(hidden, TRANSPORT, [uint256(1), 1, 3], salt);
        game.advance(10);
        Mission memory m = game.getMission(hidden);
        assertTrue(m.returning);
        assertEq(m.cargo[WEAPONS], 5); // back with the cargo
        _allHome();

        // Paying the rest back by a transport that names the trade closes the debt.
        vm.prank(bob);
        uint64 paying =
            game.sendMission(2, TRANSPORT, [uint256(1), 1, 1], _rowdies(3), _only(WEAPONS, 300), t);
        vm.warp(game.getMission(paying).arrival);
        vm.expectEmit();
        emit IGameEvents.DebtPaid(t);
        game.advance(10);
        assertEq(game.getTrade(t).returned[WEAPONS], 330);
        assertEq(game.getPlayer(2).debts, 0);
        assertEq(game.owes(2, 1), 0);
        vm.prank(bob);
        game.offerTrade(3, 1, 500, _only(DOLLAR, 100)); // free again
    }

    function test_marketClaimFromDebtorOnVacationOrSuspended() public {
        uint64 t = _defaulted(0);
        _afterWindow(t);
        vm.prank(bob);
        game.startVacation(); // nothing registered yet, the lock has passed
        vm.prank(alice);
        game.claimTrade(t, 2, 1, _only(WEAPONS, 100));
        vm.prank(admin);
        game.suspend(2, block.timestamp + 30 days);
        vm.prank(alice);
        game.claimTrade(t, 2, 1, _only(WEAPONS, 100));
        assertEq(game.getTrade(t).returned[WEAPONS], 200);
        vm.prank(alice);
        game.startVacation();
        vm.prank(alice);
        vm.expectRevert(OnVacation.selector); // the creditor itself has to be active
        game.claimTrade(t, 2, 1, _only(WEAPONS, 100));
    }
}

contract SocialGasTest is GameTestBase {
    function test_gasSocial() public {
        vm.warp(T0);
        Game game = deployGame();
        address a = makeAddr("a");
        address b = makeAddr("b");
        vm.prank(a);
        game.register(1, 1, 1);
        vm.prank(b);
        game.register(1, 1, 2);
        uint256 g;
        vm.prank(a);
        g = gasleft();
        uint64 f = game.createFamily("MOB", "The Mob");
        console.log("createFamily:", g - gasleft());
        vm.prank(b);
        g = gasleft();
        game.applyToFamily(f);
        console.log("applyToFamily:", g - gasleft());
        vm.prank(a);
        g = gasleft();
        game.answerApplication(2, true);
        console.log("answerApplication (accept):", g - gasleft());
        uint256[RESOURCES] memory price;
        price[3] = 100;
        vm.prank(a);
        g = gasleft();
        uint64 t = game.offerTrade(2, 0, 300, price);
        console.log("offerTrade:", g - gasleft());
        vm.prank(b);
        g = gasleft();
        game.acceptTrade(t);
        console.log("acceptTrade:", g - gasleft());
        vm.warp(block.timestamp + Ruleset.MARKET_WINDOW_SECONDS + 1); // no vacation inside the window
        vm.prank(a);
        g = gasleft();
        game.startVacation();
        console.log("startVacation:", g - gasleft());
    }
}
