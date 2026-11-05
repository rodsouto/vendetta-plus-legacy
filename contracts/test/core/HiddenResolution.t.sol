// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Test} from "forge-std/Test.sol";
import {HiddenResolution, HiddenResolutionState} from "../../src/core/HiddenResolution.sol";

struct ResolutionSnapshot {
    uint256 arrival;
    bool consumed;
    bool initialized;
    bytes plain;
    uint256 seq;
    bytes32 statement;
    uint256 status;
}

/// Test-only trusted-adapter harness: no certificate verification or Game activation.
contract HiddenResolutionHarness {
    HiddenResolutionState internal receipt;

    function initialize(bytes32 root, uint40 arrival, uint64 seq) external {
        HiddenResolution.initialize(receipt, root, arrival, seq);
    }

    function record(bytes32 root, bool valid, bytes calldata plain) external returns (bool) {
        return HiddenResolution.recordVerified(receipt, root, valid, plain);
    }

    function consume() external returns (uint8, uint40, uint64, bytes memory) {
        return HiddenResolution.consume(receipt);
    }

    function snapshot() external view returns (ResolutionSnapshot memory) {
        return ResolutionSnapshot(
            receipt.arrival,
            receipt.consumed,
            receipt.status != 0,
            receipt.plain,
            receipt.seq,
            receipt.statement,
            receipt.status
        );
    }
}

contract HiddenResolutionTest is Test {
    struct Input {
        uint256 arrival;
        uint256 op;
        bytes plain;
        uint256 seq;
        bytes32 statement;
        uint256 time;
        bool valid;
    }

    function testReplaysTypeScriptReceiptTraces() public {
        string memory json = vm.readFile("../packages/rules/generated/hidden-resolution.json");
        uint256 count;
        for (uint256 c; c < 5; ++c) {
            HiddenResolutionHarness harness = new HiddenResolutionHarness();
            string memory base = string.concat(".cases[", vm.toString(c), "]");
            uint256 length = vm.parseJsonUint(json, string.concat(base, ".stepCount"));
            for (uint256 i; i < length; ++i) {
                _replay(harness, json, string.concat(base, ".steps[", vm.toString(i), "]"));
                ++count;
            }
        }
        assertEq(count, 33);
    }

    function _input(string memory json, string memory path) private pure returns (Input memory s) {
        s.arrival = vm.parseJsonUint(json, string.concat(path, ".arrival"));
        s.op = vm.parseJsonUint(json, string.concat(path, ".op"));
        s.plain = vm.parseJsonBytes(json, string.concat(path, ".plain"));
        s.seq = vm.parseJsonUint(json, string.concat(path, ".seq"));
        s.statement = vm.parseJsonBytes32(json, string.concat(path, ".statement"));
        s.time = vm.parseJsonUint(json, string.concat(path, ".time"));
        s.valid = vm.parseJsonBool(json, string.concat(path, ".valid"));
    }

    function _replay(HiddenResolutionHarness harness, string memory json, string memory path)
        private
    {
        Input memory s = _input(json, string.concat(path, ".input"));
        string memory expected = string.concat(path, ".expected");
        vm.warp(s.time);
        bytes memory callData;
        if (s.op == 0) {
            callData =
                abi.encodeCall(harness.initialize, (s.statement, uint40(s.arrival), uint64(s.seq)));
        } else if (s.op == 1) {
            callData = abi.encodeCall(harness.record, (s.statement, s.valid, s.plain));
        } else {
            callData = abi.encodeCall(harness.consume, ());
        }
        (bool ok, bytes memory result) = address(harness).call(callData);
        string memory error = vm.parseJsonString(json, string.concat(expected, ".error"));
        if (bytes(error).length != 0) {
            assertFalse(ok, path);
            assertEq(bytes4(result), bytes4(keccak256(bytes(string.concat(error, "()")))));
        } else {
            assertTrue(ok, path);
            if (s.op == 1) {
                assertEq(
                    abi.decode(result, (bool)),
                    vm.parseJsonBool(json, string.concat(expected, ".changed"))
                );
            }
            if (s.op == 2) _consumed(json, expected, result);
        }
        _snapshot(json, string.concat(expected, ".state"), harness.snapshot());
    }

    function _consumed(string memory json, string memory path, bytes memory result) private pure {
        (uint8 status, uint40 arrival, uint64 seq, bytes memory plain) =
            abi.decode(result, (uint8, uint40, uint64, bytes));
        assertEq(status, vm.parseJsonUint(json, string.concat(path, ".resultStatus")));
        assertEq(arrival, vm.parseJsonUint(json, string.concat(path, ".resultArrival")));
        assertEq(seq, vm.parseJsonUint(json, string.concat(path, ".resultSeq")));
        assertEq(plain, vm.parseJsonBytes(json, string.concat(path, ".resultPlain")));
    }

    function _snapshot(string memory json, string memory path, ResolutionSnapshot memory s)
        private
        view
    {
        assertEq(s.arrival, vm.parseJsonUint(json, string.concat(path, ".arrival")));
        assertEq(s.consumed, vm.parseJsonBool(json, string.concat(path, ".consumed")));
        assertEq(s.initialized, vm.parseJsonBool(json, string.concat(path, ".initialized")));
        assertEq(s.plain, vm.parseJsonBytes(json, string.concat(path, ".plain")));
        assertEq(s.seq, vm.parseJsonUint(json, string.concat(path, ".seq")));
        assertEq(s.statement, vm.parseJsonBytes32(json, string.concat(path, ".statement")));
        assertEq(s.status, vm.parseJsonUint(json, string.concat(path, ".status")));
    }

    function testFuzzLateReceiptPreservesOriginalTime(uint40 arrival, uint64 seq, uint32 delay)
        public
    {
        vm.assume(arrival > 0);
        HiddenResolutionHarness harness = new HiddenResolutionHarness();
        bytes32 root = keccak256("root");
        harness.initialize(root, arrival, seq);
        vm.warp(uint256(arrival) + delay);
        harness.record(root, false, "");
        (uint8 status, uint40 originalArrival, uint64 originalSeq, bytes memory plain) =
            harness.consume();
        assertEq(status, 3);
        assertEq(originalArrival, arrival);
        assertEq(originalSeq, seq);
        assertEq(plain.length, 0);
    }
}
