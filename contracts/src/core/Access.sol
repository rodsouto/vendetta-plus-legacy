// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Building, Player, Session, CoreState} from "./GameStorage.sol";
import {SettleLib} from "./Settlement.sol";
import {NotRegistered, NotOwner, OnVacation, Suspended, NotController} from "./GameErrors.sol";

/// Checks and settlement shared by every player action. Mirrors packages/rules/src/sim/common.ts.
library Access {
    /// The player a live session key plays for, or 0 (B-15).
    function sessionPlayer(CoreState storage s, address caller) internal view returns (uint64) {
        Session storage k = s.sessions[caller];
        if (k.until <= block.timestamp) return 0;
        return s.players[k.player].sessionEpoch == k.epoch ? k.player : 0;
    }

    /// The player behind the caller: its controller, or a live session key.
    function resolve(CoreState storage s, address caller)
        internal
        view
        returns (uint64 pid, Player storage p)
    {
        pid = s.playerOf[caller];
        if (pid == 0) pid = sessionPlayer(s, caller);
        if (pid == 0) revert NotRegistered();
        p = s.players[pid];
    }

    /// Account management (sessions, transfer) needs the controller itself, never a session key.
    function controllerOnly(CoreState storage s, address caller)
        internal
        view
        returns (uint64 pid, Player storage p)
    {
        pid = s.playerOf[caller];
        if (pid == 0) {
            if (sessionPlayer(s, caller) != 0) revert NotController();
            revert NotRegistered();
        }
        p = s.players[pid];
    }

    /// The acting player; a player on vacation (D-18) or suspended (B-14) cannot act.
    function active(CoreState storage s, address caller)
        internal
        view
        returns (uint64 pid, Player storage p)
    {
        (pid, p) = resolve(s, caller);
        if (p.vacationUntil > block.timestamp) revert OnVacation();
        if (p.suspendedUntil > block.timestamp) revert Suspended();
    }

    function owned(CoreState storage s, address caller, uint64 id)
        internal
        view
        returns (uint64 pid, Player storage p, Building storage b)
    {
        (pid, p) = active(s, caller);
        b = s.buildings[id];
        if (b.owner != pid) revert NotOwner();
    }

    /// Settle the building and, if the player researches elsewhere, that building too.
    function settleForAction(CoreState storage, Player storage p, uint64 id) internal {
        SettleLib.settle(id, block.timestamp);
        uint64 rb = p.researchBuilding;
        if (rb != 0 && rb != id) SettleLib.settle(rb, block.timestamp);
    }

    /// B-25: the player's own premium or the admin's global premium.
    function isPremium(CoreState storage s, Player storage p) internal view returns (bool) {
        return p.premiumUntil > block.timestamp || s.globalPremiumUntil > block.timestamp;
    }
}
