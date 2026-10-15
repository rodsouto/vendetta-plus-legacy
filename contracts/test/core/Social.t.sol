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
    ControllerTaken,
    NotRegistered,
    QueueFull
} from "../../src/core/GameErrors.sol";
import {GameTestBase} from "./GameTestBase.sol";
import {console} from "forge-std/Test.sol";

/// Vacation, sanctions, premium, transfer, families, wars and market (09-social.md, D-18-D-20,
/// B-11, B-14, B-25, B-26, B-31).
contract SocialTest is GameTestBase {
    uint256 internal constant BOOT_CAMP = 11;
    uint256 internal constant ROWDY = 0;

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
        vm.prank(a);
        g = gasleft();
        game.startVacation();
        console.log("startVacation:", g - gasleft());
    }
}
