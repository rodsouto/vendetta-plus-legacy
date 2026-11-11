// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Test} from "forge-std/Test.sol";
import {GameStorage, CoreState, Mission} from "../../src/core/GameStorage.sol";
import {HiddenResolution} from "../../src/core/HiddenResolution.sol";
import {Missions} from "../../src/core/Missions.sol";
import {Heap} from "../../src/core/Heap.sol";
import {
    BadReveal,
    InvalidMission,
    InvalidCoordinate,
    InvalidCover
} from "../../src/core/GameErrors.sol";

/// Bypass only admission/cryptography to drive the real private _applyReveal via advance.
contract HiddenPredicateHarness {
    function seed(uint256[20] memory words, bytes memory plain) external {
        CoreState storage s = GameStorage.core();
        Mission storage m = s.missions[1];
        m.owner = uint64(words[5]);
        m.fromCity = uint8(words[6]);
        m.fromNeighborhood = uint8(words[7]);
        m.fromSlot = uint8(words[8]);
        m.cover = uint32(words[9]);
        for (uint256 i; i < 4; ++i) {
            m.cargo[i] = uint64(words[10 + i]);
        }
        m.commit = bytes32(words[18]);
        m.hidden = true;
        m.arrival = 100;
        m.duration = 100;
        m.seq = 1;
        m.troops[0] = 1;
        s.seq = 2;
        Heap.push(s, 1);
        HiddenResolution.initialize(s.hiddenEvidence[1].receipt, bytes32(0), 100, 1);
        HiddenResolution.recordVerified(s.hiddenEvidence[1].receipt, bytes32(0), true, plain);
    }

    function advance() external returns (uint256) {
        return Missions.advance(1);
    }

    function consumed() external view returns (bool) {
        return GameStorage.core().hiddenEvidence[1].receipt.consumed;
    }
}

contract HiddenPredicateTest is Test {
    function testCircuitPredicateCorpus() public {
        string memory path = vm.envOr("HIDDEN_STATIC_CORPUS", string(""));
        bool generated = bytes(path).length != 0;
        if (!generated) path = "../docs/benchmarks/timelock-opening/codec-v2/vectors.json";
        string memory json = vm.readFile(path);
        uint256 count = generated ? vm.parseJsonUint(json, ".count") : 9;
        assertGt(count, 0);
        vm.warp(100);
        uint256 checked;
        for (uint256 i; i < count; ++i) {
            string memory base = string.concat(".vectors[", vm.toString(i), "]");
            bytes memory plain = vm.parseJsonBytes(json, string.concat(base, ".rawPlain"));
            if (!generated) {
                // Static conformance holds crypto/version valid. The complete circuit tests
                // separately cover damaged MAC/tag/version and must not be conflated here.
                if (
                    !vm.parseJsonBool(json, string.concat(base, ".headerValid"))
                        || !vm.parseJsonBool(json, string.concat(base, ".payloadValid"))
                        || plain[0] != bytes1(uint8(2))
                ) continue;
            }
            HiddenPredicateHarness h = new HiddenPredicateHarness();
            h.seed(
                abi.decode(vm.parseJsonBytes(json, string.concat(base, ".abi")), (uint256[20])),
                plain
            );
            bool valid = keccak256(
                    bytes(vm.parseJsonString(json, string.concat(base, ".expected")))
                ) == keccak256("valid");
            (bool ok, bytes memory result) = address(h).call(abi.encodeCall(h.advance, ()));
            assertEq(ok, valid, base);
            assertEq(h.consumed(), valid, base);
            if (valid) {
                assertEq(abi.decode(result, (uint256)), 1, base);
            } else {
                bytes4 reason = bytes4(result);
                assertTrue(
                    reason == BadReveal.selector || reason == InvalidMission.selector
                        || reason == InvalidCoordinate.selector || reason == InvalidCover.selector,
                    base
                );
            }
            ++checked;
        }
        assertEq(checked, generated ? count : 6);
    }
}
