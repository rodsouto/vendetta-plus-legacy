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
    OFFER_SURRENDER,
    OFFER_DRAW
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
    TradeOpen,
    InvalidWithdrawal,
    SharesLeft,
    TooManyTrades,
    CannotAfford,
    NotOwner,
    ControllerTaken,
    NotRegistered,
    QueueFull,
    NoOffer,
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
    /// Every mission home, then past the return cooldown so the next send is not TroopsResting.
    function _allHome() internal {
        for (;;) {
            uint64[] memory ids = game.pendingMissions();
            if (ids.length == 0) {
                vm.warp(block.timestamp + Ruleset.TROOP_ARRIVAL_COOLDOWN);
                return;
            }
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

    function _stock(uint64 building, uint256 r) internal view returns (uint256) {
        return game.getBuilding(building).stock[r] / Ruleset.STOCK_SCALE;
    }

    /// Alice and Bob get rowdies, then Alice offers Bob 300 weapons from her building for 100
    /// dollars and Bob accepts, his deposit (10 dollars) from his building. The window just opened.
    function _accepted() internal returns (uint64 t) {
        _armyFor(alice, 1, 3);
        _armyFor(bob, 2, 3);
        vm.prank(alice);
        t = game.offerTrade(2, 1, WEAPONS, 300, _only(DOLLAR, 100));
        vm.prank(bob);
        game.acceptTrade(t, 2);
    }

    function _afterWindow(uint64 t) internal {
        vm.warp(uint256(game.getTrade(t).closesAt) + 1);
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
        game.transferPlayer(dave); // scheduled (B-26)
        skip(Ruleset.CONTROLLER_REMOVAL_DELAY);
        vm.prank(dave);
        game.acceptTransfer(1); // the target takes it
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
        vm.prank(bob);
        game.offerPeace(war, OFFER_DRAW); // replaced before alice answers
        vm.prank(alice);
        vm.expectRevert(NoOffer.selector); // the surrender she saw is gone
        game.answerPeace(war, OFFER_SURRENDER, true);
        vm.prank(alice);
        game.answerPeace(war, OFFER_DRAW, false); // declined: the war goes on
        vm.prank(bob);
        game.offerPeace(war, OFFER_SURRENDER);
        (bool ended, uint64 winner) = game.warResult(war);
        assertFalse(ended);
        vm.prank(alice);
        game.answerPeace(war, OFFER_SURRENDER, true);
        w = game.getWar(war);
        assertTrue(w.ended);
        assertEq(w.winner, fa);
        (ended, winner) = game.warResult(war);
        assertTrue(ended);
        assertEq(winner, fa);
    }

    /// B-31: a family that dissolves loses its running wars; the result view says so.
    function test_warLostByDissolution() public {
        vm.prank(alice);
        uint64 fa = game.createFamily("AAA", "Alpha");
        vm.prank(bob);
        uint64 fb = game.createFamily("BBB", "Beta");
        vm.prank(alice);
        uint64 war = game.declareWar(fb);
        (bool ended, uint64 winner) = game.warResult(war);
        assertFalse(ended);
        assertEq(winner, 0);
        vm.prank(bob);
        game.dissolveFamily();
        assertFalse(game.getWar(war).ended); // the stored record is lazy
        (ended, winner) = game.warResult(war);
        assertTrue(ended);
        assertEq(winner, fa);
        (ended, winner) = game.warResult(99);
        assertFalse(ended);
    }

    // ------------------------------------------------------------------ market

    function test_marketRatesAndCap() public {
        uint256[RESOURCES] memory price;
        price[3] = 99; // 300 weapons are worth 100 dollars at 3-5-1
        vm.startPrank(alice);
        vm.expectRevert(InvalidOffer.selector);
        game.offerTrade(2, 1, 0, 300, price);
        price[3] = 100;
        vm.expectRevert(NotOwner.selector); // the goods would leave Bob's building
        game.offerTrade(2, 2, 0, 300, price);
        for (uint256 i; i < Ruleset.MAX_OPEN_OFFERS; ++i) {
            game.offerTrade(2, 1, 0, 300, price);
        }
        vm.expectRevert(TooManyOffers.selector);
        game.offerTrade(2, 1, 0, 300, price);
        vm.stopPrank();
    }

    /// D-19: acceptance takes the goods from the offer's building and the deposit from the
    /// buyer's, and fixes the terms.
    function test_marketAcceptHoldsGoodsAndDeposit() public {
        vm.prank(alice);
        uint64 big = game.offerTrade(2, 1, WEAPONS, 30_000, _only(DOLLAR, 10_000));
        vm.prank(bob);
        vm.expectRevert(CannotAfford.selector); // Alice has no 30,000 weapons
        game.acceptTrade(big, 2);
        vm.prank(alice);
        uint64 t = game.offerTrade(2, 1, WEAPONS, 300, _only(DOLLAR, 100));
        vm.prank(bob);
        vm.expectRevert(NotOwner.selector); // the deposit from Alice's building
        game.acceptTrade(t, 1);
        uint256 dollars = _stock(2, DOLLAR);
        uint256 weapons = _stock(1, WEAPONS); // at the cap: production adds nothing
        uint40 closes = uint40(block.timestamp + Ruleset.MARKET_WINDOW_SECONDS);
        vm.expectEmit(address(game));
        emit IGameEvents.TradeAccepted(t, closes, [uint64(0), 0, 0, 10]);
        vm.prank(bob);
        game.acceptTrade(t, 2);
        Trade memory x = game.getTrade(t);
        assertEq(x.closesAt, closes);
        assertEq(x.deposit[DOLLAR], 10);
        assertEq(x.from, 1);
        assertEq(x.rate[WEAPONS], 3); // 3-5-1
        assertEq(x.rate[DOLLAR], 1);
        assertEq(_stock(2, DOLLAR), dollars - 10);
        assertEq(_stock(1, WEAPONS), weapons - 300);
    }

    /// D-19: the buyer withdraws the goods it paid for at any time; once final, the seller gets
    /// the rest and the unpaid fraction of the deposit, and nobody offers or accepts with a share
    /// left in a final trade.
    function test_marketSharesAndWithdrawals() public {
        uint64 t = _accepted();
        _ship(bob, 2, [uint256(1), 1, 1], 3, _only(DOLLAR, 40), t);
        assertEq(game.getTrade(t).paid[DOLLAR], 40);
        vm.prank(bob);
        game.queueRoom(2, MOB_SCHOOL); // room for weapons
        vm.startPrank(bob);
        vm.expectRevert(InvalidWithdrawal.selector); // 300 × 40 / 100 = 120 earned
        game.withdrawTrade(t, 2, _only(WEAPONS, 121));
        vm.expectRevert(InvalidWithdrawal.selector); // the deposit waits for the end
        game.withdrawTrade(t, 2, _only(DOLLAR, 1));
        vm.expectRevert(InvalidWithdrawal.selector);
        game.withdrawTrade(t, 2, _none());
        vm.expectRevert(NotOwner.selector);
        game.withdrawTrade(t, 1, _only(WEAPONS, 1));
        vm.expectEmit(address(game));
        emit IGameEvents.TradeWithdrawn(t, 2, [uint64(100), 0, 0, 0]);
        game.withdrawTrade(t, 2, _only(WEAPONS, 100));
        game.withdrawTrade(t, 2, _only(WEAPONS, 20));
        vm.expectRevert(InvalidWithdrawal.selector);
        game.withdrawTrade(t, 2, _only(WEAPONS, 1));
        vm.stopPrank();
        vm.prank(alice);
        vm.expectRevert(InvalidWithdrawal.selector); // nothing is the seller's before the end
        game.withdrawTrade(t, 1, _only(WEAPONS, 1));
        vm.prank(carol);
        vm.expectRevert(InvalidTrade.selector);
        game.withdrawTrade(t, 3, _only(WEAPONS, 1));

        // Alice: the other 180 weapons and ⌈10 × 60 / 100⌉ = 6 dollars; Bob: the other 4 dollars.
        _afterWindow(t);
        vm.prank(alice);
        game.queueRoom(1, MOB_SCHOOL); // room for weapons and 25 dollars
        vm.startPrank(alice);
        vm.expectRevert(InvalidWithdrawal.selector);
        game.withdrawTrade(t, 1, _only(WEAPONS, 181));
        vm.expectRevert(InvalidWithdrawal.selector);
        game.withdrawTrade(t, 1, _only(DOLLAR, 7));
        game.withdrawTrade(t, 1, _only(WEAPONS, 180));
        vm.expectRevert(SharesLeft.selector);
        game.offerTrade(3, 1, WEAPONS, 300, _only(DOLLAR, 100));
        game.withdrawTrade(t, 1, _only(DOLLAR, 6));
        game.offerTrade(3, 1, WEAPONS, 300, _only(DOLLAR, 100)); // nothing left: free again
        vm.stopPrank();
        vm.startPrank(bob);
        vm.expectRevert(SharesLeft.selector);
        game.offerTrade(3, 2, WEAPONS, 300, _only(DOLLAR, 100));
        vm.expectRevert(InvalidWithdrawal.selector);
        game.withdrawTrade(t, 2, _only(DOLLAR, 5));
        game.withdrawTrade(t, 2, _only(DOLLAR, 4));
        game.offerTrade(3, 2, WEAPONS, 300, _only(DOLLAR, 100));
        vm.stopPrank();
        assertEq(game.getPlayer(1).offers.length, 1, "the finished trade left Alice's list");
    }

    /// D-19, D-26: a full payment makes the trade final early, and counts at the door even when
    /// the seller's building has no room; the buyer gets everything back.
    function test_marketFullPayment() public {
        uint64 t = _accepted();
        assertEq(_stock(1, DOLLAR), 10_000); // Alice's dollars sit at the level-0 cap
        uint256[RESOURCES] memory cargo;
        cargo[DOLLAR] = 130; // 100 count, the rest and the ammunition are a plain transport
        cargo[1] = 7;
        _ship(bob, 2, [uint256(1), 1, 1], 3, cargo, t);
        assertEq(game.getTrade(t).paid[DOLLAR], 100);
        assertEq(_stock(1, DOLLAR), 10_000);
        _allHome();
        vm.prank(bob);
        vm.expectRevert(InvalidTrade.selector); // final: nothing left to pay
        game.sendMission(2, TRANSPORT, [uint256(1), 1, 1], _rowdies(1), _only(DOLLAR, 1), t);
        vm.prank(alice);
        vm.expectRevert(InvalidWithdrawal.selector); // Alice was paid in full: nothing left
        game.withdrawTrade(t, 1, _only(WEAPONS, 1));
        vm.prank(alice);
        game.offerTrade(3, 1, WEAPONS, 300, _only(DOLLAR, 100)); // not blocked
        vm.prank(bob);
        game.queueRoom(2, MOB_SCHOOL);
        vm.startPrank(bob);
        game.withdrawTrade(t, 2, _only(WEAPONS, 300));
        game.withdrawTrade(t, 2, _only(DOLLAR, 10));
        vm.stopPrank();
    }

    /// B-11: only the buyer pays, to the seller's building, arriving within the window.
    function test_marketPaymentRules() public {
        uint64 t = _accepted();
        vm.prank(alice);
        vm.expectRevert(InvalidTrade.selector); // the seller never ships for a trade
        game.sendMission(1, TRANSPORT, [uint256(1), 1, 2], _rowdies(1), _only(WEAPONS, 10), t);
        vm.startPrank(bob);
        vm.expectRevert(InvalidTrade.selector); // a third party's building
        game.sendMission(2, TRANSPORT, [uint256(1), 1, 3], _rowdies(1), _only(DOLLAR, 10), t);
        vm.expectRevert(InvalidTrade.selector); // an empty slot
        game.sendMission(2, TRANSPORT, [uint256(1), 1, 9], _rowdies(1), _only(DOLLAR, 10), t);
        vm.stopPrank();
        vm.warp(game.getTrade(t).closesAt); // a payment leaving now arrives after the window
        vm.prank(bob);
        vm.expectRevert(InvalidTrade.selector);
        game.sendMission(2, TRANSPORT, [uint256(1), 1, 1], _rowdies(1), _only(DOLLAR, 10), t);
    }

    /// B-11: at most MAX_PURCHASES trades as buyer.
    function test_marketBuyerCap() public {
        vm.startPrank(alice);
        for (uint256 i; i < Ruleset.MAX_OPEN_OFFERS; ++i) {
            game.offerTrade(2, 1, WEAPONS, 30, _only(DOLLAR, 10));
        }
        vm.stopPrank();
        vm.prank(carol);
        uint64 extra = game.offerTrade(2, 3, WEAPONS, 30, _only(DOLLAR, 10));
        vm.startPrank(bob);
        for (uint64 id = 1; id <= Ruleset.MAX_PURCHASES; ++id) {
            game.acceptTrade(id, 2);
        }
        vm.expectRevert(TooManyTrades.selector);
        game.acceptTrade(extra, 2);
        vm.stopPrank();
        assertEq(game.getPlayer(2).purchases.length, Ruleset.MAX_PURCHASES);
    }

    /// D-19: a party withdraws whatever the counterparty's state; a suspended one cannot (B-14).
    function test_marketWithdrawWhileCounterpartySuspended() public {
        uint64 t = _accepted();
        _ship(bob, 2, [uint256(1), 1, 1], 3, _only(DOLLAR, 40), t);
        _afterWindow(t);
        vm.prank(admin);
        game.suspend(2, block.timestamp + 10 days);
        vm.prank(alice);
        game.queueRoom(1, MOB_SCHOOL);
        vm.prank(alice);
        game.withdrawTrade(t, 1, _only(WEAPONS, 180));
        vm.prank(bob);
        vm.expectRevert(Suspended.selector);
        game.withdrawTrade(t, 2, _only(DOLLAR, 4));
    }

    function test_marketVacationLock() public {
        uint256[RESOURCES] memory price;
        price[DOLLAR] = 100;
        vm.prank(alice);
        uint64 t = game.offerTrade(2, 1, WEAPONS, 300, price);
        vm.prank(carol);
        game.startVacation(); // not a party
        vm.prank(bob);
        game.acceptTrade(t, 2);
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
        uint64 t = game.offerTrade(2, 1, 0, 300, price);
        console.log("offerTrade:", g - gasleft());
        vm.prank(b);
        g = gasleft();
        game.acceptTrade(t, 2);
        console.log("acceptTrade:", g - gasleft());
        vm.warp(block.timestamp + Ruleset.MARKET_WINDOW_SECONDS + 1); // no vacation inside the window
        vm.prank(a);
        g = gasleft();
        game.startVacation();
        console.log("startVacation:", g - gasleft());
    }
}

contract MarketRulesTest is SocialTest {
    uint256 internal constant AMMUNITION = 1;

    /// B-11: a price that matches more than one rate is rejected, so the stored rate is never
    /// ambiguous; quantities and prices must fit in 64 bits.
    function test_marketOfferChecks() public {
        uint256[RESOURCES] memory price;
        price[WEAPONS] = 3;
        price[DOLLAR] = 1; // 10 ammunition for 3 weapons and 1 dollar fits both 3-5-1 and 2-4-1
        vm.startPrank(alice);
        vm.expectRevert(InvalidOffer.selector);
        game.offerTrade(2, 1, AMMUNITION, 10, price);
        game.offerTrade(2, 1, AMMUNITION, 10, _only(DOLLAR, 2)); // 3-5-1 only
        vm.expectRevert(InvalidOffer.selector);
        game.offerTrade(2, 1, WEAPONS, 3 * (uint256(1) << 64), _only(DOLLAR, uint256(1) << 64));
        vm.expectRevert(InvalidOffer.selector);
        game.offerTrade(2, 1, WEAPONS, uint256(1) << 64, _only(DOLLAR, (uint256(1) << 64) / 3));
        vm.stopPrank();
    }

    /// B-11: accepting checks the seller again: active.
    function test_marketAcceptChecksTheSeller() public {
        vm.prank(alice);
        uint64 t = game.offerTrade(2, 1, WEAPONS, 300, _only(DOLLAR, 100));
        vm.prank(admin);
        game.suspend(1, block.timestamp + 10 days);
        vm.prank(bob);
        vm.expectRevert(InvalidTrade.selector);
        game.acceptTrade(t, 2);
        vm.prank(admin);
        game.suspend(1, 0);
        vm.prank(alice);
        game.startVacation();
        vm.prank(bob);
        vm.expectRevert(InvalidTrade.selector);
        game.acceptTrade(t, 2);
        vm.prank(alice);
        game.endVacation();
        vm.prank(bob);
        game.acceptTrade(t, 2);
        assertTrue(game.getTrade(t).accepted);
    }

    /// B-11: a payment may arrive at the window's last second, and counts even when the queue is
    /// drained after the window closed; one second later it cannot leave.
    function test_marketPaymentArrivesExactlyAtTheDeadline() public {
        uint64 t = _accepted();
        uint256 closes = game.getTrade(t).closesAt;
        uint256 snap = vm.snapshotState();
        vm.prank(bob);
        uint64 probe =
            game.sendMission(2, TRANSPORT, [uint256(1), 1, 1], _rowdies(3), _only(DOLLAR, 40), t);
        uint256 duration = game.getMission(probe).arrival - block.timestamp;
        vm.revertToState(snap);
        snap = vm.snapshotState();
        vm.warp(closes - duration + 1);
        vm.prank(bob);
        vm.expectRevert(InvalidTrade.selector);
        game.sendMission(2, TRANSPORT, [uint256(1), 1, 1], _rowdies(3), _only(DOLLAR, 40), t);
        vm.revertToState(snap);
        vm.warp(closes - duration);
        vm.prank(bob);
        uint64 id =
            game.sendMission(2, TRANSPORT, [uint256(1), 1, 1], _rowdies(3), _only(DOLLAR, 40), t);
        assertEq(game.getMission(id).arrival, closes);
        vm.warp(closes + 1 days);
        game.advance(10);
        assertEq(game.getTrade(t).paid[DOLLAR], 40);
    }

    /// D-19: shares are totals minus what was taken, so more payment after a withdrawal earns the
    /// rest of the goods.
    function test_marketPaymentAfterPartialWithdrawal() public {
        uint64 t = _accepted();
        _ship(bob, 2, [uint256(1), 1, 1], 3, _only(DOLLAR, 40), t);
        vm.prank(bob);
        game.queueRoom(2, MOB_SCHOOL);
        vm.prank(bob);
        game.withdrawTrade(t, 2, _only(WEAPONS, 120));
        _allHome();
        _ship(bob, 2, [uint256(1), 1, 1], 3, _only(DOLLAR, 60), t); // paid in full: final
        uint256[RESOURCES] memory rest;
        (rest[WEAPONS], rest[DOLLAR]) = (180, 10);
        vm.startPrank(bob);
        vm.expectRevert(InvalidWithdrawal.selector);
        game.withdrawTrade(t, 2, _only(WEAPONS, 181));
        game.withdrawTrade(t, 2, rest);
        vm.stopPrank();
        vm.prank(alice);
        vm.expectRevert(InvalidWithdrawal.selector);
        game.withdrawTrade(t, 1, _only(WEAPONS, 1));
    }

    /// B-11: a recalled payment never reaches the seller and pays nothing.
    function test_marketRecalledPaymentPaysNothing() public {
        uint64 t = _accepted();
        vm.prank(bob);
        uint64 id =
            game.sendMission(2, TRANSPORT, [uint256(1), 1, 1], _rowdies(3), _only(DOLLAR, 40), t);
        vm.warp(block.timestamp + 1);
        vm.prank(bob);
        game.recall(id);
        _allHome();
        assertEq(game.getTrade(t).paid[DOLLAR], 0);
    }

    /// D-19: on a tiny trade the seller's deposit share is the unpaid fraction of the rounded
    /// deposit, rounded up. 9 weapons for 10 ammunition and 1 dollar; 1 ammunition left unpaid.
    function test_marketTinyTradeDeposit() public {
        _armyFor(alice, 1, 3);
        _armyFor(bob, 2, 3);
        uint256[RESOURCES] memory price;
        (price[AMMUNITION], price[DOLLAR]) = (10, 1);
        vm.prank(alice);
        uint64 t = game.offerTrade(2, 1, WEAPONS, 9, price);
        vm.prank(bob);
        game.acceptTrade(t, 2);
        assertEq(game.getTrade(t).deposit[AMMUNITION], 1);
        assertEq(game.getTrade(t).deposit[DOLLAR], 1);
        uint256[RESOURCES] memory paid;
        (paid[AMMUNITION], paid[DOLLAR]) = (9, 1);
        _ship(bob, 2, [uint256(1), 1, 1], 3, paid, t);
        _afterWindow(t);
        vm.prank(bob);
        game.queueRoom(2, MOB_SCHOOL); // production refilled the stores during the window
        vm.prank(alice);
        game.queueRoom(1, MOB_SCHOOL);
        vm.startPrank(bob); // ⌊9 × 2.8 / 3⌋ = 8 weapons; nothing of the deposit
        vm.expectRevert(InvalidWithdrawal.selector);
        game.withdrawTrade(t, 2, _only(WEAPONS, 9));
        vm.expectRevert(InvalidWithdrawal.selector);
        game.withdrawTrade(t, 2, _only(AMMUNITION, 1));
        game.withdrawTrade(t, 2, _only(WEAPONS, 8));
        vm.stopPrank();
        uint256[RESOURCES] memory seller;
        (seller[WEAPONS], seller[AMMUNITION], seller[DOLLAR]) = (1, 1, 1);
        vm.prank(alice);
        game.withdrawTrade(t, 1, seller);
    }
}
