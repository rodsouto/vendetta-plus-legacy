// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Game} from "../../src/Game.sol";
import {
    TROOPS,
    RESOURCES,
    VendettaRuleset as Ruleset
} from "../../src/generated/VendettaRuleset.sol";
import {STATION, OCCUPY} from "../../src/core/GameStorage.sol";
import {TroopsResting} from "../../src/core/GameErrors.sol";
import {GameTestBase} from "./GameTestBase.sol";

/// A session batches a reveal and a departure in one EVM transaction.
contract StationBatchSender {
    function accept(Game game) external {
        game.acceptSession(1);
    }

    function revealAndSend(Game game, uint64 mission, bytes32 salt) external {
        game.reveal(mission, STATION, [uint256(1), 1, 3], salt);
        uint256[TROOPS] memory troops;
        troops[0] = 1;
        uint256[RESOURCES] memory cargo;
        game.sendMission(3, STATION, [uint256(1), 1, 1], troops, cargo, 0);
    }
}

/// Stationing and returning share the building-wide arrival cooldown (B-22).
contract StationCooldownTest is GameTestBase {
    uint256 internal constant YEAR = 365 days;
    uint256 internal constant ROWDY = 0;
    uint256 internal constant BOOT_CAMP = 11;
    bytes32 internal constant SALT = keccak256("station cooldown");
    Game internal game;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    /// Reach two owned buildings through normal gameplay, without writing game storage directly.
    function setUp() public {
        vm.warp(T0);
        game = deployGame();
        vm.prank(admin);
        game.setGlobalPremium(T0 + 100 * YEAR);
        vm.prank(alice);
        game.register(1, 1, 1);
        vm.prank(bob);
        game.register(1, 1, 2);
        // Indices in vendetta.yaml: camp, school, producers, then their storage rooms.
        _grow(BOOT_CAMP, 1);
        _grow(1, 1);
        _grow(2, 5);
        _grow(3, 5);
        _grow(4, 5);
        _grow(5, 5);
        _grow(7, 1);
        _grow(8, 1);
        _grow(10, 1);
        for (uint256 i; i < 5; ++i) {
            vm.prank(alice);
            game.queueResearch(1, 0); // routing 5 permits occupation troops
            vm.warp(block.timestamp + YEAR);
        }
        vm.startPrank(alice);
        game.train(1, Ruleset.OCCUPATION_TROOP, 1);
        game.train(1, ROWDY, 7);
        vm.stopPrank();
        vm.warp(block.timestamp + YEAR);
        uint256[TROOPS] memory troops;
        troops[Ruleset.OCCUPATION_TROOP] = 1;
        vm.prank(alice);
        uint64 occupy = game.sendMission(1, OCCUPY, [uint256(1), 1, 3], troops, _none(), 0);
        vm.warp(game.getMission(occupy).arrival);
        game.advance(10);
        assertEq(game.getBuilding(3).owner, 1);
        vm.warp(block.timestamp + YEAR);
        game.poke(1);
    }

    function _grow(uint256 room, uint256 level) internal {
        for (uint256 i; i < level; ++i) {
            vm.prank(alice);
            game.queueRoom(1, room);
            vm.warp(block.timestamp + YEAR);
        }
    }

    function _rowdies(uint256 n) internal pure returns (uint256[TROOPS] memory troops) {
        troops[ROWDY] = n;
    }

    function _none() internal pure returns (uint256[RESOURCES] memory cargo) {}

    function _commit(uint8 kind, uint256 slot) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint64(1), kind, uint256(1), uint256(1), slot, SALT));
    }

    function _station(bool hidden, uint256 n) internal returns (uint64) {
        vm.prank(alice);
        if (hidden) {
            return game.sendHiddenMission(1, _commit(STATION, 3), 3, _rowdies(n), _none(), "", 0);
        }
        return game.sendMission(1, STATION, [uint256(1), 1, 3], _rowdies(n), _none(), 0);
    }

    function _depart(bool hidden, uint256 n) internal {
        if (hidden) {
            game.sendHiddenMission(3, _commit(STATION, 1), 3, _rowdies(n), _none(), "", 0);
        } else {
            game.sendMission(3, STATION, [uint256(1), 1, 1], _rowdies(n), _none(), 0);
        }
    }

    function _blocked(uint256 n) internal {
        vm.startPrank(alice);
        vm.expectRevert(TroopsResting.selector);
        _depart(false, n);
        vm.expectRevert(TroopsResting.selector);
        _depart(true, n);
        vm.stopPrank();
    }

    function _checkCooldown(bool hidden) internal {
        uint64 id = _station(hidden, 5);
        uint256 arrival = game.getMission(id).arrival;
        vm.warp(arrival);
        if (hidden) game.reveal(id, STATION, [uint256(1), 1, 3], SALT);
        _blocked(1); // the send drains the arrival, then reverts the entire transaction
        assertEq(game.getMission(id).owner, 1);
        assertEq(game.getBuilding(3).troops[ROWDY], 0);
        game.advance(10);
        assertEq(game.getBuilding(3).lastTroopArrival, arrival);
        vm.warp(arrival + Ruleset.TROOP_ARRIVAL_COOLDOWN - 1);
        _blocked(1);
        vm.warp(arrival + Ruleset.TROOP_ARRIVAL_COOLDOWN);
        vm.startPrank(alice);
        _depart(false, 1);
        _depart(true, 1);
        vm.stopPrank();
    }

    function test_publicStationCooldown() public {
        _checkCooldown(false);
    }

    function test_hiddenStationCooldown() public {
        _checkCooldown(true);
    }

    function test_hiddenStationOnForeignBuildingDoesNotLockDestination() public {
        vm.prank(alice);
        uint64 id = game.sendHiddenMission(1, _commit(STATION, 2), 3, _rowdies(5), _none(), "", 0);
        vm.warp(game.getMission(id).arrival);
        game.reveal(id, STATION, [uint256(1), 1, 2], SALT);
        game.advance(10);
        assertTrue(game.getMission(id).returning);
        assertEq(game.getBuilding(2).troops[ROWDY], 0);
        assertEq(
            game.getBuilding(2).lastTroopArrival, 0, "foreign station cannot lock the destination"
        );
    }

    function test_atomicRevealAndDepartureReverts() public {
        uint64 id = _station(true, 5);
        StationBatchSender batch = new StationBatchSender();
        vm.prank(alice);
        game.authorizeSession(address(batch), block.timestamp + 1 days);
        batch.accept(game);
        vm.warp(game.getMission(id).arrival);
        vm.expectRevert(TroopsResting.selector);
        batch.revealAndSend(game, id, SALT);
        assertTrue(game.getMission(id).hidden, "the reveal is rolled back too");
        assertEq(game.getBuilding(3).troops[ROWDY], 0);
    }

    function test_secondArrivalRestartsWholeBuildingCooldown() public {
        uint64 first = _station(false, 5);
        uint256 arrival = game.getMission(first).arrival;
        vm.warp(block.timestamp + 10);
        _station(false, 1);
        vm.warp(arrival + 10);
        game.advance(10);
        assertEq(game.getBuilding(3).lastTroopArrival, arrival + 10);
        vm.warp(arrival + Ruleset.TROOP_ARRIVAL_COOLDOWN);
        _blocked(5); // cannot select only the five troops that arrived first
        vm.warp(arrival + 10 + Ruleset.TROOP_ARRIVAL_COOLDOWN);
        vm.prank(alice);
        _depart(false, 5);
    }

    function test_lateHiddenStationRestsFromRevealTime() public {
        uint64 id = _station(true, 5);
        uint256 arrival = game.getMission(id).arrival;
        uint256 revealed = arrival + 20;
        vm.warp(revealed);
        game.reveal(id, STATION, [uint256(1), 1, 3], SALT);
        game.advance(10);
        assertEq(game.getBuilding(3).lastTroopArrival, revealed);
        vm.warp(arrival + Ruleset.TROOP_ARRIVAL_COOLDOWN);
        _blocked(1);
        vm.warp(revealed + Ruleset.TROOP_ARRIVAL_COOLDOWN);
        vm.prank(alice);
        _depart(false, 1);
    }

    function _checkLazyStation(bool hidden) internal {
        uint64 id = _station(hidden, 5);
        uint256 arrival = game.getMission(id).arrival;
        if (hidden) game.reveal(id, STATION, [uint256(1), 1, 3], SALT);
        vm.warp(arrival + Ruleset.TROOP_ARRIVAL_COOLDOWN);
        vm.prank(alice);
        _depart(false, 1); // settles the old arrival and sends immediately after its cooldown
        assertEq(game.getBuilding(3).lastTroopArrival, arrival);
    }

    function test_lazyPublicStationUsesScheduledArrival() public {
        _checkLazyStation(false);
    }

    function test_earlyRevealedStationUsesScheduledArrival() public {
        _checkLazyStation(true);
    }

    function test_localQueuesWorkDuringRestAndTrainingDoesNotRestartIt() public {
        vm.prank(alice);
        game.queueRoom(3, BOOT_CAMP);
        vm.warp(block.timestamp + YEAR);
        uint64 id = _station(false, 5);
        uint256 arrival = game.getMission(id).arrival;
        vm.warp(arrival);
        game.advance(10);
        vm.startPrank(alice);
        game.queueRoom(3, 4); // brewery
        game.queueResearch(1, 0);
        game.train(3, ROWDY, 1);
        vm.stopPrank();
        vm.warp(game.getBuilding(3).attackTraining[0].finishAt);
        game.poke(3);
        assertEq(game.getBuilding(3).troops[ROWDY], 6);
        assertEq(game.getBuilding(3).lastTroopArrival, arrival);
        vm.prank(alice);
        _depart(false, 6);
    }
}
