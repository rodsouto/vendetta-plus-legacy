// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {VendettaRuleset as Ruleset} from "../generated/VendettaRuleset.sol";
import {
    Player,
    Session,
    Invite,
    ControllerInfo,
    CoreState,
    GameStorage,
    INVITE_SESSION,
    INVITE_CONTROLLER
} from "./GameStorage.sol";
import {Access} from "./Access.sol";
import {
    NotRegistered,
    NotAllowed,
    InvalidSession,
    SessionTooLong,
    MissionsInFlight,
    VacationCooldown,
    TradeOpen,
    NotOnVacation,
    OnVacation,
    Suspended,
    ControllerTaken,
    TooManyControllers,
    LastController,
    RemovalPending,
    NoRemoval,
    TransferPending,
    NoTransfer,
    NoInvite,
    IGameEvents
} from "./GameErrors.sol";

/// Vacation (D-18), sanctions (B-14), premium (B-25), account transfer, controllers and sessions
/// (B-15, B-26). An address joins an account only by accepting an invitation itself: nobody binds
/// an address it does not hold. Linked external library. Mirrors packages/rules/src/sim/account.ts.
library Account {
    /// 15 days; needs no own missions in flight, 7 days since the last vacation ended and no
    /// accepted trade whose window is still open (D-18, D-19).
    function startVacation(address caller) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.active(s, caller);
        if (p.missions > 0) revert MissionsInFlight();
        if (
            p.vacationUntil > 0
                && block.timestamp < p.vacationUntil + Ruleset.VACATION_COOLDOWN_SECONDS
        ) revert VacationCooldown();
        if (block.timestamp <= p.tradeLockUntil) revert TradeOpen();
        p.vacationUntil = uint40(block.timestamp + Ruleset.VACATION_SECONDS);
        p.vacationStart = uint40(block.timestamp);
        p.vacationSeq = s.seq++; // ordered against sends in the same second (B-07, B-22)
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

    /// Schedules giving the whole account to `to`, an address that controls no player (B-26); once
    /// due, `to` accepts with acceptTransfer and becomes the only controller. A different `to`
    /// re-schedules; the same one while pending is a mistake. Any controller cancels meanwhile.
    function transfer(address caller, address to) external {
        CoreState storage s = GameStorage.core();
        Access.controllerOnly(s, caller);
        (uint64 pid, Player storage p) = Access.active(s, caller);
        _free(s, to);
        if (p.transferTo == to) revert TransferPending();
        p.transferTo = to;
        p.transferAt = uint40(block.timestamp + Ruleset.CONTROLLER_REMOVAL_DELAY);
        emit IGameEvents.PlayerTransferScheduled(pid, to, p.transferAt);
    }

    /// The target of a scheduled transfer takes the account once the delay has passed: every
    /// previous controller leaves and every session dies. The player must be active (B-14).
    function acceptTransfer(address caller, uint64 pid) external {
        CoreState storage s = GameStorage.core();
        Player storage p = _player(pid);
        if (p.transferTo != caller) revert NoTransfer();
        if (block.timestamp < p.transferAt) revert TransferPending();
        if (p.vacationUntil > block.timestamp) revert OnVacation();
        if (p.suspendedUntil > block.timestamp) revert Suspended();
        _free(s, caller); // checked again now
        address[] storage cs = p.controllers;
        for (uint256 i; i < cs.length; ++i) {
            delete s.playerOf[cs[i]];
            delete s.controllerInfo[cs[i]];
        }
        delete p.controllers;
        cs.push(caller);
        s.playerOf[caller] = pid;
        delete p.transferTo;
        delete p.transferAt;
        p.sessionEpoch++; // sessions and invitations of the previous owners stop working
        emit IGameEvents.PlayerTransferred(pid, caller);
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

    /// A controller invites another address (B-26): a new device's passkey account or a recovery
    /// code (`recovery`, kept so every device labels it right). The address joins only when it
    /// accepts, within INVITE_TTL and while the player's epoch is the same. Allowed while locked.
    function inviteController(address caller, address added, bool recovery) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.controllerOnly(s, caller);
        _free(s, added);
        uint40 until = uint40(block.timestamp + Ruleset.INVITE_TTL);
        s.invites[added][pid] = Invite(INVITE_CONTROLLER, recovery, until, p.sessionEpoch);
        emit IGameEvents.ControllerInvited(pid, added, recovery, until);
    }

    /// The invited address joins the player as a controller. All controllers are equal.
    function acceptController(address caller, uint64 pid) external {
        CoreState storage s = GameStorage.core();
        Player storage p = _player(pid);
        Invite storage inv = s.invites[caller][pid];
        if (
            inv.kind != INVITE_CONTROLLER || block.timestamp >= inv.until
                || inv.epoch != p.sessionEpoch
        ) revert NoInvite();
        _free(s, caller);
        if (p.controllers.length >= Ruleset.MAX_CONTROLLERS) revert TooManyControllers();
        bool recovery = inv.recovery;
        delete s.invites[caller][pid];
        p.controllers.push(caller);
        s.playerOf[caller] = pid;
        s.controllerInfo[caller] = ControllerInfo(recovery, 0);
        emit IGameEvents.ControllerAdded(pid, caller, recovery);
    }

    /// Any controller drops an invitation (session or controller) it made to `invited`.
    function cancelInvite(address caller, address invited) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid,) = Access.controllerOnly(s, caller);
        if (s.invites[invited][pid].kind == 0) revert NoInvite();
        delete s.invites[invited][pid];
        emit IGameEvents.InviteCancelled(pid, invited);
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

    /// The controller invites `session` to play for it until `until` (B-15): every game action,
    /// but never account management. The session binds when it accepts. Renewing is inviting
    /// again. Allowed while locked, like ending a vacation.
    function authorizeSession(address caller, address session, uint256 until) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.controllerOnly(s, caller);
        uint64 taken = Access.sessionPlayer(s, session);
        if (session == address(0) || s.playerOf[session] != 0 || (taken != 0 && taken != pid)) {
            revert ControllerTaken();
        }
        if (until <= block.timestamp) revert InvalidSession();
        if (until - block.timestamp > Ruleset.MAX_SESSION_SECONDS) revert SessionTooLong();
        s.invites[session][pid] = Invite(INVITE_SESSION, false, uint40(until), p.sessionEpoch);
        emit IGameEvents.SessionInvited(pid, session, uint40(until));
    }

    /// The invited session starts playing for the player, until the invitation's deadline.
    function acceptSession(address caller, uint64 pid) external {
        CoreState storage s = GameStorage.core();
        Player storage p = _player(pid);
        Invite storage inv = s.invites[caller][pid];
        if (
            inv.kind != INVITE_SESSION || block.timestamp >= inv.until
                || inv.epoch != p.sessionEpoch
        ) {
            revert NoInvite();
        }
        uint64 taken = Access.sessionPlayer(s, caller);
        if (s.playerOf[caller] != 0 || (taken != 0 && taken != pid)) revert ControllerTaken();
        uint40 until = inv.until;
        delete s.invites[caller][pid];
        s.sessions[caller] = Session(pid, until, p.sessionEpoch);
        emit IGameEvents.SessionAuthorized(pid, caller, until);
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
