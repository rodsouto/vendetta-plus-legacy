// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {VendettaRuleset as Ruleset} from "../generated/VendettaRuleset.sol";
import {Player, Session, CoreState, GameStorage} from "./GameStorage.sol";
import {Access} from "./Access.sol";
import {
    NotRegistered,
    NotAllowed,
    InvalidSession,
    SessionTooLong,
    MissionsInFlight,
    VacationCooldown,
    NotOnVacation,
    ControllerTaken,
    TooManyControllers,
    LastController,
    IGameEvents
} from "./GameErrors.sol";

/// Vacation (D-18), sanctions (B-14), premium (B-25), account transfer and controllers (B-26).
/// Linked external library. Mirrors packages/rules/src/sim/account.ts.
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
        (uint64 pid, Player storage p) = Access.resolve(GameStorage.core(), caller);
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

    /// Give the whole account to another address that controls no player: it becomes the only
    /// controller.
    function transfer(address caller, address to) external {
        CoreState storage s = GameStorage.core();
        Access.controllerOnly(s, caller);
        (uint64 pid, Player storage p) = Access.active(s, caller);
        _free(s, to);
        address[] storage cs = p.controllers;
        for (uint256 i; i < cs.length; ++i) {
            delete s.playerOf[cs[i]];
        }
        delete p.controllers;
        cs.push(to);
        s.playerOf[to] = pid;
        p.sessionEpoch++; // sessions authorized by the previous owners stop working
        emit IGameEvents.PlayerTransferred(pid, caller, to);
    }

    /// A controller adds another one (B-26): a new device's passkey account or a recovery code.
    /// All controllers are equal. Allowed while locked, like sessions.
    function addController(address caller, address added) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.controllerOnly(s, caller);
        _free(s, added);
        if (p.controllers.length >= Ruleset.MAX_CONTROLLERS) revert TooManyControllers();
        p.controllers.push(added);
        s.playerOf[added] = pid;
        emit IGameEvents.ControllerAdded(pid, added);
    }

    /// A controller removes one (itself included), never the last. Every session dies (a lost
    /// device's too); the remaining devices authorize theirs again.
    function removeController(address caller, address removed) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.controllerOnly(s, caller);
        if (s.playerOf[removed] != pid) revert NotAllowed();
        address[] storage cs = p.controllers;
        if (cs.length == 1) revert LastController();
        uint256 i;
        while (cs[i] != removed) ++i;
        cs[i] = cs[cs.length - 1];
        cs.pop();
        delete s.playerOf[removed];
        p.sessionEpoch++;
        emit IGameEvents.ControllerRemoved(pid, removed);
    }

    /// An address that can manage an account: not zero, no player's controller, no live session.
    function _free(CoreState storage s, address a) private view {
        if (a == address(0) || s.playerOf[a] != 0 || Access.sessionPlayer(s, a) != 0) {
            revert ControllerTaken();
        }
    }

    /// The controller lets `session` play for it until `until` (B-15): every game action, but
    /// never account management. Allowed while locked, like ending a vacation.
    function authorizeSession(address caller, address session, uint256 until) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.controllerOnly(s, caller);
        uint64 taken = Access.sessionPlayer(s, session);
        if (session == address(0) || s.playerOf[session] != 0 || (taken != 0 && taken != pid)) {
            revert ControllerTaken();
        }
        if (until <= block.timestamp) revert InvalidSession();
        if (until - block.timestamp > Ruleset.MAX_SESSION_SECONDS) revert SessionTooLong();
        s.sessions[session] = Session(pid, uint40(until), p.sessionEpoch);
        emit IGameEvents.SessionAuthorized(pid, session, uint40(until));
    }

    function revokeSession(address caller, address session) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid,) = Access.controllerOnly(s, caller);
        if (s.sessions[session].player != pid) revert NotAllowed();
        delete s.sessions[session];
        emit IGameEvents.SessionRevoked(pid, session);
    }

    function _player(uint64 id) private view returns (Player storage p) {
        p = GameStorage.core().players[id];
        if (p.controllers.length == 0) revert NotRegistered();
    }
}
