// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// Test-only certificate consumer. Production Deploy never constructs this contract.
contract HiddenConsumerMock {
    error MockRejected();

    function check(bytes32 root, bytes calldata proof, uint256[55] calldata x)
        external
        pure
        returns (bool, bytes memory)
    {
        if (root != bytes32((x[48] << 128) | x[49])) revert MockRejected();
        return abi.decode(proof, (bool, bytes));
    }

    function check(bytes32 root, bytes calldata proof, uint256[2] calldata x)
        external
        pure
        returns (bool)
    {
        if (root != bytes32((x[0] << 128) | x[1])) revert MockRejected();
        return abi.decode(proof, (bool));
    }
}
