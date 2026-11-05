// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Test} from "forge-std/Test.sol";
import {HiddenContext} from "../../src/core/HiddenContext.sol";
import {HiddenEvidence} from "../../src/core/HiddenEvidence.sol";
import {HiddenEvidenceState} from "../../src/core/HiddenResolution.sol";
import {GameStorage, Mission} from "../../src/core/GameStorage.sol";

contract ContextHarness {
    function seed(uint256[20] memory x) external {
        Mission storage m = GameStorage.core().missions[uint64(x[3])];
        m.owner = uint64(x[5]);
        m.fromCity = uint8(x[6]);
        m.fromNeighborhood = uint8(x[7]);
        m.fromSlot = uint8(x[8]);
        m.cover = uint32(x[9]);
        for (uint256 i; i < 4; ++i) {
            m.cargo[i] = uint64(x[10 + i]);
        }
        m.arrival = uint40(x[14]);
        m.commit = bytes32(x[18]);
        m.hidden = true;
        m.start = uint40(block.timestamp);
        m.seq = 7;
        GameStorage.core().heapPos[uint64(x[3])] = 1;
    }

    function encode(uint64 id, bytes memory packet) external view returns (bytes memory) {
        return HiddenContext.encode(id, packet);
    }

    function bind(uint64 id, bytes memory packet, address consumer) external {
        HiddenEvidence.bindPacket(id, packet, consumer, consumer);
    }

    function receipt(uint64 id) external view returns (HiddenEvidenceState memory) {
        return GameStorage.core().hiddenEvidence[id];
    }
}

contract HiddenContextTest is Test {
    ContextHarness h;
    string json;
    bytes packet;
    uint256[20] words;

    function setUp() public {
        vm.chainId(100);
        vm.warp(1692806200);
        ContextHarness impl = new ContextHarness();
        vm.etch(0x1111111111111111111111111111111111111111, address(impl).code);
        h = ContextHarness(0x1111111111111111111111111111111111111111);
        json = vm.readFile("../docs/benchmarks/timelock-opening/codec-v2/vectors.json");
        packet = vm.parseJsonBytes(json, ".vectors[0].packet");
        words = abi.decode(vm.parseJsonBytes(json, ".vectors[0].abi"), (uint256[20]));
        h.seed(words);
    }

    function testArchivedContextsMatchByteForByte() public {
        for (uint256 i; i < 9; ++i) {
            string memory prefix = string.concat(".vectors[", vm.toString(i), "]");
            bytes memory expected = vm.parseJsonBytes(json, string.concat(prefix, ".abi"));
            h.seed(abi.decode(expected, (uint256[20])));
            bytes memory encoded =
                h.encode(1, vm.parseJsonBytes(json, string.concat(prefix, ".packet")));
            assertEq(encoded, expected);
            assertEq(
                keccak256(encoded), vm.parseJsonBytes32(json, string.concat(prefix, ".statement"))
            );
        }
    }

    function testBindingUsesStoredMissionAndOriginalIdentity() public {
        h.bind(1, packet, address(this));
        HiddenEvidenceState memory e = h.receipt(1);
        assertEq(e.receipt.statement, keccak256(h.encode(1, packet)));
        assertEq(e.receipt.arrival, words[14]);
        assertEq(e.receipt.seq, 7);
        vm.expectRevert();
        h.bind(1, packet, address(this));
    }

    function testDomainSeparationAndMissionId() public {
        bytes32 root = keccak256(h.encode(1, packet));
        vm.chainId(101);
        assertNotEq(keccak256(h.encode(1, packet)), root);
        vm.chainId(100);
        ContextHarness other = new ContextHarness();
        other.seed(words);
        assertNotEq(keccak256(other.encode(1, packet)), root);
        words[3] = 2;
        h.seed(words);
        assertNotEq(keccak256(h.encode(2, packet)), root);
    }

    function testFuzzStoredSemanticFields(uint8 selector, uint64 value) public {
        uint256[10] memory indexes = [uint256(5), 6, 7, 8, 9, 10, 11, 12, 13, 18];
        uint256 at = indexes[selector % 10];
        uint256 mask = at >= 6 && at <= 8 ? 255 : at == 9 ? type(uint32).max : type(uint64).max;
        uint256 next = uint256(value) & mask;
        if (at == 5 && next == 0) next = 1;
        vm.assume(next != words[at]);
        bytes32 root = keccak256(h.encode(1, packet));
        words[at] = next;
        h.seed(words);
        assertNotEq(keccak256(h.encode(1, packet)), root);
    }

    function testMalformedFramingRejected() public {
        for (uint256 i; i < 4; ++i) {
            uint256 at = i < 2 ? i * 3 : i == 2 ? 4 : 35;
            bytes memory bad = bytes.concat(packet);
            bad[at] = bytes1(uint8(bad[at]) ^ 1);
            vm.expectRevert(HiddenContext.ResolutionInvalidPacket.selector);
            h.encode(1, bad);
        }
        vm.expectRevert(HiddenContext.ResolutionInvalidPacket.selector);
        h.encode(1, new bytes(272));
        vm.expectRevert(HiddenContext.ResolutionInvalidPacket.selector);
        h.encode(1, bytes.concat(packet, hex"00"));
    }

    function testRoundAndArrivalProfileRejected() public {
        uint64[3] memory rounds = [uint64(0), uint64(1) << 53, type(uint64).max];
        for (uint256 i; i < 3; ++i) {
            bytes memory bad = bytes.concat(packet);
            bytes8 r = bytes8(rounds[i]);
            for (uint256 j; j < 8; ++j) {
                bad[36 + j] = r[j];
            }
            vm.expectRevert(HiddenContext.ResolutionInvalidPacket.selector);
            h.encode(1, bad);
        }
        words[14]++;
        h.seed(words);
        vm.expectRevert(HiddenContext.ResolutionInvalidContext.selector);
        h.encode(1, packet);
    }

    function testOpaqueGarbageIsAdmittedForCertifiedInvalidity() public {
        bytes32 root = keccak256(h.encode(1, packet));
        for (uint256 i = 44; i < packet.length; ++i) {
            packet[i] = 0;
        }
        assertNotEq(keccak256(h.encode(1, packet)), root);
        h.bind(1, packet, address(this));
        assertEq(h.receipt(1).receipt.status, 1);
    }

    function testLateBindingAndUnknownMissionRejected() public {
        vm.warp(block.timestamp + 1);
        vm.expectRevert(HiddenEvidence.ResolutionInvalidBinding.selector);
        h.bind(1, packet, address(this));
        vm.expectRevert(HiddenContext.ResolutionInvalidContext.selector);
        h.encode(99, packet);
    }
}
