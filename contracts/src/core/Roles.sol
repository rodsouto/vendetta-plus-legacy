// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CoreState, GameStorage, ROLE_ADMIN, ROLE_OPERATOR, ROLE_ARBITER} from "./GameStorage.sol";
import {NotAllowed, IGameEvents} from "./GameErrors.sol";

/// The privileged roles (B-17): the admin upgrades and assigns roles, the operator grants premium
/// (B-25), the arbiter suspends (B-14). The admin assigns any role at once; a holder hands its own
/// role over in two steps (propose, accept), so roles keep rotating after the freeze. The admin
/// setting its own role to address(0) is the freeze: no more upgrades or assignments.
library Roles {
    function check(address caller, uint8 role) internal view {
        if (caller != GameStorage.core().roles[role]) revert NotAllowed();
    }

    /// Game.initialize only.
    function init(address admin, address operator, address arbiter) external {
        _set(ROLE_ADMIN, admin);
        _set(ROLE_OPERATOR, operator);
        _set(ROLE_ARBITER, arbiter);
    }

    /// The admin assigns a role at once; it also drops the old holder's proposal, so a compromised
    /// holder cannot keep the role through a successor it chose.
    function set(address caller, uint8 role, address account) external {
        check(caller, ROLE_ADMIN);
        _set(role, account);
    }

    /// The holder proposes its successor; address(0) withdraws the proposal.
    function propose(address caller, uint8 role, address account) external {
        check(caller, role);
        GameStorage.core().pendingRoles[role] = account;
        emit IGameEvents.RoleProposed(role, account);
    }

    function accept(address caller, uint8 role) external {
        if (caller != GameStorage.core().pendingRoles[role]) revert NotAllowed();
        _set(role, caller);
    }

    function _set(uint8 role, address account) private {
        CoreState storage s = GameStorage.core();
        s.roles[role] = account;
        delete s.pendingRoles[role];
        emit IGameEvents.RoleTransferred(role, account);
    }
}
