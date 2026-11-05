// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {H3Prefix} from "./H3Prefix.sol";

interface Vm {
    function readFile(string calldata) external view returns (string memory);
    function parseJsonBytes32(string calldata, string calldata) external pure returns (bytes32);
    function parseJsonString(string calldata, string calldata) external pure returns (string memory);
    function parseUint(string calldata) external pure returns (uint256);
    function prank(address) external;
}

contract RejectAll is H3Prefix {
    constructor() H3Prefix(msg.sender) {}

    function candidate(bytes32, uint32 index) internal pure override returns (uint256) {
        return index == 65535 ? 0 : FR; // 65535 must never be examined.
    }
}

contract AcceptZero is H3Prefix {
    constructor() H3Prefix(msg.sender) {}

    function candidate(bytes32, uint32) internal pure override returns (uint256) {
        return 0;
    }
}

contract HashThenReject is H3Prefix {
    constructor() H3Prefix(msg.sender) {}

    function candidate(bytes32 pre, uint32 index) internal view override returns (uint256) {
        // Artificial rejection keeps the SHA work. This is a workload measurement, not a preimage.
        return FR + (super.candidate(pre, index) & type(uint64).max);
    }
}

contract H3PrefixTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    event log_named_uint(string key, uint256 value);

    function fixture() internal view returns (bytes32 pre, uint256 expected) {
        string memory data = vm.readFile("fixture.json");
        return (vm.parseJsonBytes32(data, ".preHash"), vm.parseUint(vm.parseJsonString(data, ".scalar")));
    }

    function init(H3Prefix h, bytes32 pre, uint256 context) internal returns (bytes32) {
        return h.begin(bytes32(context), bytes32(uint256(1)), pre);
    }

    function test_real_five_candidate_prefix() public {
        (bytes32 pre, uint256 expected) = fixture();
        H3Prefix h = new H3Prefix(address(this));
        bytes32 receipt = init(h, pre, 1);
        uint256 gasBefore = gasleft();
        h.advance(receipt, 4);
        emit log_named_uint("h3_reject_four_gas", gasBefore - gasleft());
        (, uint256 scalar, uint32 next, uint32 at, uint8 status) = h.states(receipt);
        require(status == h.COMPUTING() && next == 5 && at == 0 && scalar == 0, "prefix state");
        gasBefore = gasleft();
        h.advance(receipt, 1);
        emit log_named_uint("h3_accept_fifth_gas", gasBefore - gasleft());
        (, scalar, next, at, status) = h.states(receipt);
        require(status == h.ACCEPTED() && next == 6 && at == 5 && scalar == expected, "wrong first scalar");
    }

    function test_single_batch_agrees_and_stops() public {
        (bytes32 pre, uint256 expected) = fixture();
        H3Prefix h = new H3Prefix(address(this));
        bytes32 r = init(h, pre, 1);
        uint256 gasBefore = gasleft();
        h.advance(r, 128);
        emit log_named_uint("h3_first_five_one_call_gas", gasBefore - gasleft());
        (, uint256 scalar, uint32 next, uint32 at, uint8 status) = h.states(r);
        require(status == h.ACCEPTED() && next == 6 && at == 5 && scalar == expected);
        (bool ok,) = address(h).call(abi.encodeCall(h.advance, (r, 1)));
        require(!ok, "terminal changed");
    }

    function test_rejects_untrusted_initialization_and_rebinding() public {
        H3Prefix h = new H3Prefix(address(this));
        vm.prank(address(0xbeef));
        (bool ok,) =
            address(h).call(abi.encodeCall(h.begin, (bytes32(uint256(1)), bytes32(uint256(1)), bytes32(uint256(2)))));
        require(!ok);
        bytes32 r = init(h, bytes32(uint256(2)), 1);
        (ok,) = address(h)
            .call(abi.encodeCall(h.begin, (bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(3)))));
        require(!ok);
        (bytes32 pre,, uint32 next,,) = h.states(r);
        require(pre == bytes32(uint256(2)) && next == 1);
    }

    function test_rejects_unknown_receipt_and_bad_budgets() public {
        H3Prefix h = new H3Prefix(address(this));
        (bool ok,) = address(h).call(abi.encodeCall(h.advance, (bytes32(uint256(123)), 1)));
        require(!ok);
        bytes32 r = init(h, bytes32(uint256(2)), 1);
        (ok,) = address(h).call(abi.encodeCall(h.advance, (r, 0)));
        require(!ok);
        (ok,) = address(h).call(abi.encodeCall(h.advance, (r, 129)));
        require(!ok);
    }

    function test_contexts_cannot_mix_progress() public {
        (bytes32 pre,) = fixture();
        H3Prefix h = new H3Prefix(address(this));
        bytes32 a = init(h, pre, 1);
        bytes32 b = init(h, pre, 2);
        require(a != b);
        h.advance(a, 4);
        (,, uint32 nextA,,) = h.states(a);
        (,, uint32 nextB,,) = h.states(b);
        require(nextA == 5 && nextB == 1);
    }

    function test_zero_context_is_not_an_uninitialized_sentinel() public {
        H3Prefix h = new H3Prefix(address(this));
        bytes32 receipt = init(h, bytes32(0), 0);
        require(h.contextInitialized(bytes32(0)));
        (bool ok,) = address(h).call(abi.encodeCall(h.begin, (bytes32(0), bytes32(uint256(1)), bytes32(uint256(2)))));
        require(!ok);
        h.advance(receipt, 1);
        (,, uint32 next,,) = h.states(receipt);
        require(next == 2);
    }

    function test_full_range_exhaustion_uses_mock_candidates() public {
        RejectAll h = new RejectAll();
        bytes32 r = init(h, bytes32(uint256(1)), 1);
        for (uint256 i; i < 512; i++) {
            h.advance(r, 128);
        }
        (, uint256 scalar, uint32 next, uint32 at, uint8 status) = h.states(r);
        require(status == h.EXHAUSTED() && next == 65535 && at == 0 && scalar == 0, "wrong finite limit");
    }

    function test_zero_is_accepted_by_h3_not_mission_validity() public {
        AcceptZero h = new AcceptZero();
        bytes32 r = init(h, bytes32(uint256(1)), 1);
        h.advance(r, 128);
        (, uint256 scalar, uint32 next, uint32 at, uint8 status) = h.states(r);
        require(status == h.ACCEPTED() && next == 2 && at == 1 && scalar == 0, "zero differs from exhausted");
    }

    function test_hash_workload_128_forced_rejections() public {
        HashThenReject h = new HashThenReject();
        bytes32 r = init(h, bytes32(uint256(1)), 1);
        uint256 gasBefore = gasleft();
        h.advance(r, 128);
        emit log_named_uint("h3_forced_hash_reject_128_gas", gasBefore - gasleft());
        (,, uint32 next,, uint8 status) = h.states(r);
        require(status == h.COMPUTING() && next == 129);
    }
}
