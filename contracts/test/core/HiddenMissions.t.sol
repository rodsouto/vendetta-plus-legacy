// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {GameTestBase} from "./GameTestBase.sol";
import {Game} from "../../src/Game.sol";
import {Mission, ATTACK} from "../../src/core/GameStorage.sol";
import {HiddenEvidenceState} from "../../src/core/HiddenResolution.sol";
import {HiddenAdmission} from "../../src/core/HiddenAdmission.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {HiddenContext} from "../../src/core/HiddenContext.sol";
import {HiddenEvidence} from "../../src/core/HiddenEvidence.sol";
import {Backlog, BadReveal} from "../../src/core/GameErrors.sol";
import {TROOPS, RESOURCES} from "../../src/generated/VendettaRuleset.sol";

contract HiddenMissionsTest is GameTestBase {
    Game game;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        vm.warp(T0);
        game = deployGame();
        vm.prank(alice);
        game.register(1, 1, 1);
        vm.prank(bob);
        game.register(1, 1, 2);
        vm.prank(alice);
        game.queueRoom(1, 11);
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        game.train(1, 0, 7);
        vm.warp(block.timestamp + 1 days);
        game.poke(1);
    }

    function troops(uint256 n) internal pure returns (uint256[TROOPS] memory t) {
        t[0] = n;
    }

    function send(uint256 n) internal returns (uint64 id) {
        uint40 at = hiddenArrival(game, 1, 1, troops(n));
        uint256[RESOURCES] memory cargo;
        vm.prank(alice);
        id = game.sendHiddenMission(
            1,
            keccak256(
                abi.encode(
                    uint64(1), ATTACK, uint256(1), uint256(1), uint256(2), bytes32(uint256(5))
                )
            ),
            1,
            troops(n),
            cargo,
            testPacket(at),
            at
        );
    }

    function evidence(uint64 id) internal view returns (HiddenEvidenceState memory) {
        return abi.decode(game.getHiddenEvidence(id), (HiddenEvidenceState));
    }

    function testGenesisRejectsMissingConsumers() public {
        Game impl = new Game();
        vm.expectRevert(HiddenAdmission.ResolutionInvalidConsumers.selector);
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(Game.initialize, (admin, operator, arbiter, address(0), address(0)))
        );
    }

    function testGenesisRejectsEOAConsumers() public {
        Game impl = new Game();
        vm.expectRevert(HiddenAdmission.ResolutionInvalidConsumers.selector);
        new ERC1967Proxy(
            address(impl), abi.encodeCall(Game.initialize, (admin, operator, arbiter, alice, bob))
        );
    }

    function testGameFitsEIP170() public {
        Game impl = new Game();
        assertLe(address(impl).code.length, 24576);
    }

    function testEverySendBindsConfiguredConsumersFromGenesis() public {
        uint64 id = send(5);
        Mission memory m = game.getMission(id);
        HiddenEvidenceState memory e = evidence(id);
        assertEq(m.kind, 0);
        assertEq(m.slot, 0);
        assertEq(e.receipt.status, 1);
        assertEq(e.receipt.arrival, m.arrival);
        assertEq(e.receipt.seq, m.seq);
        (address opening, address invalidPoint) = game.hiddenConsumers();
        assertEq(e.openingConsumer, opening);
        assertEq(e.invalidPointConsumer, invalidPoint);
    }

    function testLateCertificateDoesNotExpireOrMoveArrival() public {
        uint64 id = send(5);
        Mission memory m = game.getMission(id);
        vm.warp(uint256(m.arrival) + 7200);
        assertEq(game.advance(20), 0);
        vm.expectRevert(Backlog.selector);
        game.poke(2);
        certify(game, id, ATTACK, [uint256(1), 1, 2], bytes32(uint256(5)));
        assertEq(game.getMission(id).arrival, m.arrival);
        assertEq(game.advance(1), 1);
        assertEq(game.getMission(id).start, m.arrival);
        assertEq(game.getMission(id).arrival, uint256(m.arrival) + m.duration);
        assertTrue(evidence(id).receipt.consumed);
        game.advance(20);
        assertEq(game.getMission(id).owner, 0);
    }

    function testInvalidCertificateReturnsAtOriginalArrival() public {
        uint64 id = send(5);
        Mission memory m = game.getMission(id);
        vm.warp(uint256(m.arrival) + 7200);
        rejectMission(game, id);
        assertEq(game.advance(1), 1);
        assertEq(game.getMission(id).start, m.arrival);
        assertTrue(game.getMission(id).returning);
    }

    function testCertificateSchemasRejectWrongLengthsWithoutInvalidating() public {
        uint64 id = send(5);
        for (uint8 kind = 1; kind <= 2; ++kind) {
            uint256 size = kind == 1 ? 55 * 32 : 2 * 32;
            for (uint256 i; i < 4; ++i) {
                uint256 length = i == 0 ? 0 : i == 1 ? size - 1 : i == 2 ? size + 1 : size + 32;
                vm.expectRevert(HiddenEvidence.ResolutionInvalidProof.selector);
                game.submitHiddenEvidence(id, abi.encode(kind, hex"00", new bytes(length)));
                assertEq(evidence(id).receipt.status, 1);
                assertFalse(evidence(id).receipt.consumed);
            }
        }
        Mission memory m = game.getMission(id);
        vm.warp(uint256(m.arrival) + 7200);
        assertEq(game.advance(20), 0);
        assertEq(game.pendingMissions()[0], id);
        rejectMission(game, id);
        assertEq(game.advance(1), 1);
        assertTrue(game.getMission(id).returning);
        assertEq(game.getMission(id).arrival, uint256(m.arrival) + m.duration);
        game.advance(20);
        assertEq(game.getMission(id).owner, 0);
        assertEq(game.getBuilding(1).troops[0], 7);
        assertEq(game.getPlayer(1).missions, 0);
        assertEq(game.advance(20), 0);
        assertEq(game.getBuilding(1).troops[0], 7);
    }

    function testDefensiveValidationRollsBackConsumption() public {
        uint64 id = send(5);
        Mission memory m = game.getMission(id);
        certify(game, id, ATTACK, [uint256(1), 1, 2], bytes32(uint256(6)));
        vm.warp(m.arrival);
        vm.expectRevert(BadReveal.selector);
        game.advance(1);
        assertFalse(evidence(id).receipt.consumed);
        assertEq(game.pendingMissions()[0], id);
    }

    function testRecallBeforeArrivalCancelsEvidenceOnlyOnce() public {
        uint64 id = send(5);
        vm.warp(block.timestamp + 1);
        vm.prank(alice);
        game.recall(id);
        assertTrue(evidence(id).cancelled);
        Mission memory m = game.getMission(id);
        certify(game, id, ATTACK, [uint256(1), 1, 2], bytes32(uint256(5)));
        assertEq(game.getMission(id).arrival, m.arrival);
    }

    function testMalformedLegacyEnvelopeCannotCreateMission() public {
        uint40 at = hiddenArrival(game, 1, 1, troops(5));
        uint256[RESOURCES] memory cargo;
        vm.prank(alice);
        vm.expectRevert(HiddenContext.ResolutionInvalidPacket.selector);
        game.sendHiddenMission(1, bytes32(0), 1, troops(5), cargo, hex"00", at);
        assertEq(game.pendingMissions().length, 0);
        assertEq(game.getPlayer(1).missions, 0);
        assertEq(game.getBuilding(1).troops[0], 7);
    }

    function testLaterCertificateDoesNotOvertakePendingHead() public {
        uint64 a = send(5);
        uint64 b = send(1);
        certify(game, b, ATTACK, [uint256(1), 1, 2], bytes32(uint256(5)));
        vm.warp(uint256(game.getMission(b).arrival) + 7200);
        assertEq(game.advance(20), 0);
        rejectMission(game, a);
        assertEq(game.advance(2), 2);
        assertTrue(evidence(a).receipt.consumed);
        assertTrue(evidence(b).receipt.consumed);
    }

    function testRemovedRoutesAreNotCallable() public {
        (bool ok,) = address(game)
            .call(
                abi.encodeWithSignature(
                    "activateHiddenV2(address,address)", address(this), address(this)
                )
            );
        assertFalse(ok);
        (ok,) = address(game).call(abi.encodeWithSignature("forfeit(uint64)", uint64(1)));
        assertFalse(ok);
        (ok,) = address(game)
            .call(
                abi.encodeWithSignature(
                    "reveal(uint64,uint8,uint256[3],bytes32)",
                    uint64(1),
                    uint8(1),
                    [uint256(1), 1, 2],
                    bytes32(0)
                )
            );
        assertFalse(ok);
    }
}
