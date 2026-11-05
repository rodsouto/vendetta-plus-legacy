// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {HiddenConsumerMock} from "../helpers/HiddenConsumer.sol";
import {HiddenEvidenceState} from "../../src/core/HiddenResolution.sol";
import {Map} from "../../src/rules/Map.sol";
import {TroopStats} from "../../src/combat/TroopStats.sol";
import {
    TROOPS,
    RESEARCH,
    VendettaRuleset as Ruleset
} from "../../src/generated/VendettaRuleset.sol";
import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Game} from "../../src/Game.sol";

/// Deploys the Game behind its UUPS proxy, as the deploy script does.
abstract contract GameTestBase is Test {
    uint256 internal constant T0 = 1_700_000_000;
    address internal admin = makeAddr("admin");
    address internal operator = makeAddr("operator");
    address internal arbiter = makeAddr("arbiter");

    function deployGame() internal returns (Game) {
        HiddenConsumerMock consumer = new HiddenConsumerMock();
        Game impl = new Game();
        return Game(
            address(
                new ERC1967Proxy(
                    address(impl),
                    abi.encodeCall(
                        Game.initialize,
                        (admin, operator, arbiter, address(consumer), address(consumer))
                    )
                )
            )
        );
    }

    function testPacket(uint40 arrival) internal pure returns (bytes memory) {
        return abi.encodePacked(
            bytes4(0x56444832),
            bytes32(0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971),
            bytes8(uint64((uint256(arrival) + 15 - 1692803367) / 3 + 1)),
            new bytes(229)
        );
    }

    function hiddenArrival(Game game, uint64 player, uint32 cover, uint256[TROOPS] memory troops)
        internal
        view
        returns (uint40 at)
    {
        Game.PlayerView memory p = game.getPlayer(player);
        uint256[RESEARCH] memory levels;
        for (uint256 i; i < RESEARCH; ++i) {
            levels[i] = p.research[i];
        }
        uint256 speed;
        for (uint256 i; i < TROOPS; ++i) {
            if (troops[i] > 0) {
                uint256 v = TroopStats.speed(i, levels);
                if (speed == 0 || v < speed) speed = v;
            }
        }
        if (speed == 0) speed = 1;
        uint256 natural =
            block.timestamp + Map.travelSeconds(uint256(cover) * Ruleset.DISTANCE_UNIT, speed);
        at = uint40(natural + (3 - (natural + 15 - 1692803367) % 3) % 3);
    }

    function certify(Game game, uint64 id, uint8 kind, uint256[3] memory target, bytes32 salt)
        internal
    {
        HiddenEvidenceState memory e = abi.decode(game.getHiddenEvidence(id), (HiddenEvidenceState));
        uint256[55] memory x;
        x[48] = uint256(e.receipt.statement) >> 128;
        x[49] = uint128(uint256(e.receipt.statement));
        bytes memory plain = abi.encodePacked(
            bytes1(uint8(2)), kind, uint8(target[0]), uint8(target[1]), uint8(target[2]), salt
        );
        game.submitHiddenEvidence(id, abi.encode(uint8(1), abi.encode(true, plain), abi.encode(x)));
    }

    function rejectMission(Game game, uint64 id) internal {
        HiddenEvidenceState memory e = abi.decode(game.getHiddenEvidence(id), (HiddenEvidenceState));
        uint256[2] memory x =
            [uint256(e.receipt.statement) >> 128, uint256(uint128(uint256(e.receipt.statement)))];
        game.submitHiddenEvidence(id, abi.encode(uint8(2), abi.encode(true), abi.encode(x)));
    }
}
