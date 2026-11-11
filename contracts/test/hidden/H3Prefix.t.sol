// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Test} from "forge-std/Test.sol";
import {H3Prefix} from "../../src/hidden/H3Prefix.sol";

// Models candidates, not a claimed SHA preimage for exhaustion or zero.
contract RejectAllCandidates is H3Prefix {
    constructor() H3Prefix(msg.sender) {}

    function candidate(bytes32, uint32 index) internal pure override returns (uint256) {
        return index == 65535 ? 0 : FR;
    }
}

contract AcceptZeroCandidate is H3Prefix {
    constructor() H3Prefix(msg.sender) {}

    function candidate(bytes32, uint32) internal pure override returns (uint256) {
        return 0;
    }
}

contract HiddenH3PrefixTest is Test {
    bytes32 constant PRE = 0x11766807f9a9fc7d634328fff3cbd98d6fab560182e870342242753bb53ce06a;
    uint256 constant SCALAR =
        45007087982830307960066972967956446568514081403645713084635648904263614511513;

    function begin(H3Prefix h, uint256 context) internal returns (bytes32) {
        return h.begin(bytes32(context), bytes32(uint256(1)), PRE);
    }

    function testRealRejectedPrefixThenFirstAcceptedCandidate() public {
        H3Prefix h = new H3Prefix(address(this));
        bytes32 receipt = begin(h, 1);
        h.advance(receipt, 4);
        (, uint256 scalar, uint32 next, uint32 at, uint8 status) = h.states(receipt);
        assertEq(status, h.COMPUTING());
        assertEq(next, 5);
        assertEq(at, 0);
        assertEq(scalar, 0);
        h.advance(receipt, 128);
        (, scalar, next, at, status) = h.states(receipt);
        assertEq(status, h.ACCEPTED());
        assertEq(scalar, SCALAR);
        assertEq(at, 5);
        assertEq(next, 6);
        vm.expectRevert();
        h.advance(receipt, 1);
    }

    function testUnknownBudgetAuthorizationAndRebinding() public {
        H3Prefix h = new H3Prefix(address(this));
        vm.expectRevert();
        h.advance(bytes32(uint256(123)), 1);
        vm.prank(address(0xbeef));
        vm.expectRevert();
        h.begin(bytes32(0), bytes32(0), PRE);
        bytes32 receipt = begin(h, 0);
        assertTrue(h.contextInitialized(bytes32(0)));
        vm.expectRevert();
        h.begin(bytes32(0), bytes32(uint256(2)), bytes32(0));
        vm.expectRevert();
        h.advance(receipt, 0);
        vm.expectRevert();
        h.advance(receipt, 129);
        h.advance(receipt, 1);
        (,, uint32 next,,) = h.states(receipt);
        assertEq(next, 2);
    }

    function testContextsCannotShareProgress() public {
        H3Prefix h = new H3Prefix(address(this));
        bytes32 a = begin(h, 1);
        bytes32 b = begin(h, 2);
        assertNotEq(a, b);
        h.advance(a, 4);
        (,, uint32 nextA,,) = h.states(a);
        (,, uint32 nextB,,) = h.states(b);
        assertEq(nextA, 5);
        assertEq(nextB, 1);
    }

    function testExactExhaustionWithModeledCandidates() public {
        H3Prefix h = new RejectAllCandidates();
        bytes32 receipt = begin(h, 1);
        for (uint256 i; i < 511; ++i) {
            h.advance(receipt, 128);
        }
        (,, uint32 next,, uint8 status) = h.states(receipt);
        assertEq(next, 65409);
        assertEq(status, h.COMPUTING());
        h.advance(receipt, 125);
        (,, next,, status) = h.states(receipt);
        assertEq(next, 65534);
        assertEq(status, h.COMPUTING());
        h.advance(receipt, 128);
        (, uint256 scalar, uint32 end, uint32 at, uint8 terminal) = h.states(receipt);
        assertEq(terminal, h.EXHAUSTED());
        assertEq(end, 65535);
        assertEq(at, 0);
        assertEq(scalar, 0);
        vm.expectRevert();
        h.advance(receipt, 1);
    }

    function testAcceptedZeroIsNotExhaustion() public {
        H3Prefix h = new AcceptZeroCandidate();
        bytes32 receipt = begin(h, 1);
        h.advance(receipt, 128);
        (, uint256 scalar, uint32 next, uint32 at, uint8 status) = h.states(receipt);
        assertEq(status, h.ACCEPTED());
        assertEq(scalar, 0);
        assertEq(next, 2);
        assertEq(at, 1);
    }
}
