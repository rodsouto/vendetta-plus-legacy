// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {VendettaRuleset as Ruleset} from "../generated/VendettaRuleset.sol";
import {Player, Session, ControllerInfo, CoreState, GameStorage} from "./GameStorage.sol";
import {Access} from "./Access.sol";
import {
    NotRegistered,
    NotAllowed,
    InvalidSession,
    SessionTooLong,
    MissionsInFlight,
    VacationCooldown,
    InDebt,
    TradeOpen,
    NotOnVacation,
    ControllerTaken,
    TooManyControllers,
    LastController,
    RemovalPending,
    NoRemoval,
    TransferPending,
    NoTransfer,
    IGameEvents
} from "./GameErrors.sol";

/// Vacation (D-18), sanctions (B-14), premium (B-25), account transfer and controllers (B-26).
/// Linked external library. Mirrors packages/rules/src/sim/account.ts.
library Account {
    /// 15 days; needs no own missions in flight, 7 days since the last vacation ended, no
    /// registered trade debt and no accepted trade whose window is still open (D-19, B-11).
    function startVacation(address caller) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.active(s, caller);
        if (p.missions > 0) revert MissionsInFlight();
        if (
            p.vacationUntil > 0
                && block.timestamp < p.vacationUntil + Ruleset.VACATION_COOLDOWN_SECONDS
        ) revert VacationCooldown();
        if (p.debts > 0) revert InDebt();
        if (block.timestamp <= p.tradeLockUntil) revert TradeOpen();
        p.vacationUntil = uint40(block.timestamp + Ruleset.VACATION_SECONDS);
        p.vacationStart = uint40(block.timestamp);
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

    /// Give the whole account to another address that controls no player, in two steps (B-26): the
    /// first call schedules it, the same call once due executes it and `to` becomes the only
    /// controller; a different `to` re-schedules. Any controller cancels meanwhile.
    function transfer(address caller, address to) external {
        CoreState storage s = GameStorage.core();
        Access.controllerOnly(s, caller);
        (uint64 pid, Player storage p) = Access.active(s, caller);
        _free(s, to); // when scheduled and again when executed
        if (p.transferTo != to) {
            p.transferTo = to;
            p.transferAt = uint40(block.timestamp + Ruleset.CONTROLLER_REMOVAL_DELAY);
            emit IGameEvents.PlayerTransferScheduled(pid, to, p.transferAt);
            return;
        }
        if (block.timestamp < p.transferAt) revert TransferPending();
        address[] storage cs = p.controllers;
        for (uint256 i; i < cs.length; ++i) {
            delete s.playerOf[cs[i]];
            delete s.controllerInfo[cs[i]];
        }
        delete p.controllers;
        cs.push(to);
        s.playerOf[to] = pid;
        delete p.transferTo;
        delete p.transferAt;
        p.sessionEpoch++; // sessions authorized by the previous owners stop working
        emit IGameEvents.PlayerTransferred(pid, caller, to);
    }

    /// Any controller drops the pending transfer. Works while locked.
    function cancelTransfer(address caller) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.controllerOnly(s, caller);
        if (p.transferTo == address(0)) revert NoTransfer();
        delete p.transferTo;
        delete p.transferAt;
        emit IGameEvents.PlayerTransferCancelled(pid);
    }

    /// A controller adds another one (B-26): a new device's passkey account or a recovery code
    /// (`recovery`, kept so every device labels it right). All controllers are equal. Allowed while
    /// locked, like sessions.
    function addController(address caller, address added, bool recovery) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.controllerOnly(s, caller);
        _free(s, added);
        if (p.controllers.length >= Ruleset.MAX_CONTROLLERS) revert TooManyControllers();
        p.controllers.push(added);
        s.playerOf[added] = pid;
        s.controllerInfo[added] = ControllerInfo(recovery, 0);
        emit IGameEvents.ControllerAdded(pid, added, recovery);
    }

    /// A controller removes itself at once, never the last. Removing another one takes two steps
    /// (B-26): the first call schedules it after the delay and kills every session (a lost device's
    /// too; the remaining devices authorize theirs again); the same call once due executes it,
    /// killing the sessions again. Before that it reverts RemovalPending. The targeted controller
    /// keeps every right meanwhile, cancelling included.
    function removeController(address caller, address removed) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.controllerOnly(s, caller);
        if (s.playerOf[removed] != pid) revert NotAllowed();
        address[] storage cs = p.controllers;
        if (cs.length == 1) revert LastController(); // only reachable removing oneself
        if (removed != caller) {
            ControllerInfo storage info = s.controllerInfo[removed];
            if (info.removalAt == 0) {
                info.removalAt = uint40(block.timestamp + Ruleset.CONTROLLER_REMOVAL_DELAY);
                p.sessionEpoch++;
                emit IGameEvents.ControllerRemovalScheduled(pid, removed, info.removalAt);
                return;
            }
            if (block.timestamp < info.removalAt) revert RemovalPending();
        }
        uint256 i;
        while (cs[i] != removed) ++i;
        cs[i] = cs[cs.length - 1];
        cs.pop();
        delete s.playerOf[removed];
        delete s.controllerInfo[removed];
        p.sessionEpoch++;
        emit IGameEvents.ControllerRemoved(pid, removed);
    }

    /// Any controller (the targeted one included) drops a scheduled removal. Works while locked.
    function cancelRemoval(address caller, address removed) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid,) = Access.controllerOnly(s, caller);
        ControllerInfo storage info = s.controllerInfo[removed];
        if (s.playerOf[removed] != pid || info.removalAt == 0) revert NoRemoval();
        info.removalAt = 0;
        emit IGameEvents.ControllerRemovalCancelled(pid, removed);
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
