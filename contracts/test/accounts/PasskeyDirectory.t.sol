// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PasskeyDirectory} from "../../src/accounts/PasskeyDirectory.sol";

contract PasskeyDirectoryTest is Test {
    PasskeyDirectory internal dir = new PasskeyDirectory();
    bytes internal cred = hex"0102030405060708";

    function test_publishAndLookup() public {
        address account = makeAddr("account");
        vm.prank(account);
        dir.publish(cred, bytes32(uint256(1)), bytes32(uint256(2)));
        PasskeyDirectory.Passkey[] memory list = dir.lookup(cred, 0, 10);
        assertEq(list.length, 1);
        assertEq(list[0].x, bytes32(uint256(1)));
        assertEq(list[0].y, bytes32(uint256(2)));
        assertEq(list[0].account, account);
        assertEq(dir.lookup(hex"ff", 0, 10).length, 0);
        assertEq(dir.count(cred), 1);

        vm.prank(account);
        vm.expectRevert(PasskeyDirectory.AlreadyPublished.selector);
        dir.publish(cred, bytes32(uint256(1)), bytes32(uint256(2)));
    }

    /// A squatter cannot hide the real entry: it is appended, and the client checks every entry.
    function test_squatterIsOnlyAnotherEntry() public {
        vm.prank(makeAddr("squatter"));
        dir.publish(cred, bytes32(uint256(9)), bytes32(uint256(9)));
        vm.prank(makeAddr("account"));
        dir.publish(cred, bytes32(uint256(1)), bytes32(uint256(2)));
        assertEq(dir.count(cred), 2);
        assertEq(dir.lookup(cred, 1, 10)[0].account, makeAddr("account"));
    }

    function test_paged() public {
        for (uint256 i; i < 5; ++i) {
            vm.prank(address(uint160(0x100 + i)));
            dir.publish(cred, bytes32(i), bytes32(i));
        }
        PasskeyDirectory.Passkey[] memory page = dir.lookup(cred, 3, 10);
        assertEq(page.length, 2);
        assertEq(page[0].x, bytes32(uint256(3)));
        assertEq(dir.lookup(cred, 1, 2).length, 2);
        assertEq(dir.lookup(cred, 9, 2).length, 0);
    }
}
