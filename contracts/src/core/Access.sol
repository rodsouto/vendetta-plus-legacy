// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Building, Player, CoreState} from "./GameStorage.sol";
import {Settlement, SettleLib} from "./Settlement.sol";
import {NotRegistered, NotOwner} from "./GameErrors.sol";

/// Checks and settlement shared by every player action. Mirrors packages/rules/src/sim/common.ts.
library Access {
    function owned(CoreState storage s, address caller, uint64 id)
        internal
        view
        returns (uint64 pid, Player storage p, Building storage b)
    {
        pid = s.playerOf[caller];
        if (pid == 0) revert NotRegistered();
        b = s.buildings[id];
        if (b.owner != pid) revert NotOwner();
        p = s.players[pid];
    }

    /// Settle the building and, if the player researches elsewhere, that building too.
    function settleForAction(CoreState storage, Player storage p, uint64 id) internal {
        SettleLib.settle(id, block.timestamp);
        uint64 rb = p.researchBuilding;
        if (rb != 0 && rb != id) SettleLib.settle(rb, block.timestamp);
    }

    /// B-25. Per-player premium arrives in 3c; for now only the admin's global premium.
    function isPremium(CoreState storage s, Player storage) internal view returns (bool) {
        return s.globalPremiumUntil > block.timestamp;
    }
}
