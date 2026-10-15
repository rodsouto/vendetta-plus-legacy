// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {VendettaRuleset as Ruleset} from "../generated/VendettaRuleset.sol";
import {Player, CoreState, GameStorage} from "./GameStorage.sol";
import {Access} from "./Access.sol";
import {
    NotRegistered,
    MissionsInFlight,
    VacationCooldown,
    NotOnVacation,
    ControllerTaken,
    IGameEvents
} from "./GameErrors.sol";

/// Vacation (D-18), sanctions (B-14), premium (B-25) and account transfer (B-26). Linked external
/// library. Mirrors packages/rules/src/sim/account.ts.
library Account {
    /// 15 days; needs no own missions in flight and 7 days since the last vacation ended.
    function startVacation(address caller) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.active(s, caller);
        if (p.missions > 0) revert MissionsInFlight();
        if (
            p.vacationUntil > 0
                && block.timestamp < p.vacationUntil + Ruleset.VACATION_COOLDOWN_SECONDS
        ) revert VacationCooldown();
        p.vacationUntil = uint40(block.timestamp + Ruleset.VACATION_SECONDS);
        emit IGameEvents.VacationStarted(pid, p.vacationUntil);
    }

    /// Ends the vacation now; the cooldown counts from here.
    function endVacation(address caller) external {
        CoreState storage s = GameStorage.core();
        uint64 pid = s.playerOf[caller];
        if (pid == 0) revert NotRegistered();
        Player storage p = s.players[pid];
        if (p.vacationUntil <= block.timestamp) revert NotOnVacation();
        p.vacationUntil = uint40(block.timestamp);
        emit IGameEvents.VacationEnded(pid);
    }

    /// Arbiter (admin in v1, checked by Game): suspend until `until`; 0 lifts it.
    function suspend(uint64 player, uint256 until) external {
        Player storage p = _player(player);
        p.suspendedUntil = uint40(until);
        emit IGameEvents.PlayerSuspended(player, uint40(until));
    }

    /// Admin (checked by Game): premium for one player until `until` (paid off-chain).
    function grantPremium(uint64 player, uint256 until) external {
        Player storage p = _player(player);
        p.premiumUntil = uint40(until);
        emit IGameEvents.PremiumGranted(player, uint40(until));
    }

    /// Give the whole account to another address that controls no player.
    function transfer(address caller, address to) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.active(s, caller);
        if (to == address(0) || s.playerOf[to] != 0) revert ControllerTaken();
        delete s.playerOf[caller];
        s.playerOf[to] = pid;
        p.controller = to;
        emit IGameEvents.PlayerTransferred(pid, caller, to);
    }

    function _player(uint64 id) private view returns (Player storage p) {
        p = GameStorage.core().players[id];
        if (p.controller == address(0)) revert NotRegistered();
    }
}
