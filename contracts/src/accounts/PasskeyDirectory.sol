// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// Public directory of passkeys (blockchain.md B-15): WebAuthn returns the public key only when a
/// passkey is created, never when signing in, so a new device holding a synced passkey looks its
/// public key up here to rebuild the player's account. No owner, no upgrades.
///
/// Anybody can publish an entry under any credential id, so entries are hints, not truth: the
/// client keeps only the entry whose key verifies the sign-in assertion and whose account is the
/// one that key derives (the account is always the publisher, msg.sender). There is no cap, so a
/// squatter cannot fill a credential id to block the real account; lookups are paged.
contract PasskeyDirectory {
    struct Passkey {
        bytes32 x; // P-256 public key
        bytes32 y;
        address account; // the smart account that published it
    }

    mapping(bytes32 credential => Passkey[]) private _entries;

    event PasskeyPublished(
        bytes32 indexed credential, address indexed account, bytes32 x, bytes32 y
    );

    error AlreadyPublished();

    /// Called by the account itself (in the batch that creates it) for its own passkey.
    function publish(bytes calldata credentialId, bytes32 x, bytes32 y) external {
        bytes32 id = keccak256(credentialId);
        Passkey[] storage list = _entries[id];
        uint256 n = list.length;
        for (uint256 i; i < n; ++i) {
            if (list[i].account == msg.sender && list[i].x == x && list[i].y == y) {
                revert AlreadyPublished();
            }
        }
        list.push(Passkey(x, y, msg.sender));
        emit PasskeyPublished(id, msg.sender, x, y);
    }

    function count(bytes calldata credentialId) external view returns (uint256) {
        return _entries[keccak256(credentialId)].length;
    }

    /// Entries `from` .. `from + max` (fewer at the end), in publication order.
    function lookup(bytes calldata credentialId, uint256 from, uint256 max)
        external
        view
        returns (Passkey[] memory page)
    {
        Passkey[] storage list = _entries[keccak256(credentialId)];
        uint256 end = from + max < list.length ? from + max : list.length;
        page = new Passkey[](end > from ? end - from : 0);
        for (uint256 i; i < page.length; ++i) {
            page[i] = list[from + i];
        }
    }
}
