// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {VendettaRuleset as Ruleset} from "../generated/VendettaRuleset.sol";
import {
    Player,
    Family,
    War,
    CoreState,
    GameStorage,
    CAPO,
    SUBCAPO,
    MEMBER,
    OFFER_NONE,
    OFFER_SURRENDER,
    OFFER_DRAW
} from "./GameStorage.sol";
import {Access} from "./Access.sol";
import {
    InFamily,
    InvalidName,
    NameTaken,
    UnknownFamily,
    AlreadyApplied,
    TooManyApplications,
    NoApplication,
    NotAllowed,
    AlreadyAtWar,
    NoOffer,
    IGameEvents
} from "./GameErrors.sol";

/// Family and war reads shared with Battle (war score). Mirrors packages/rules/src/sim/families.ts.
library FamilyRules {
    /// The player's family, or 0 if none or dissolved.
    function familyOf(CoreState storage s, Player storage p) internal view returns (uint64) {
        uint64 f = p.family;
        return f != 0 && s.families[f].alive ? f : 0;
    }

    function pairKey(uint64 a, uint64 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    /// The running war between two families, or 0. A war with a dissolved family is over.
    function warBetween(CoreState storage s, uint64 a, uint64 b) internal view returns (uint64) {
        uint64 id = s.activeWar[pairKey(a, b)];
        if (id == 0) return 0;
        return !s.wars[id].ended && s.families[a].alive && s.families[b].alive ? id : 0;
    }

    /// Battle hook: lost troop points go to each side's losses if their families are at war.
    function warScore(
        CoreState storage s,
        Player storage attacker,
        Player storage defender,
        uint256 lostA,
        uint256 lostD
    ) internal {
        uint64 fa = familyOf(s, attacker);
        uint64 fd = familyOf(s, defender);
        if (fa == 0 || fd == 0 || fa == fd) return;
        uint64 id = warBetween(s, fa, fd);
        if (id == 0) return;
        War storage war = s.wars[id];
        if (war.a == fa) {
            (war.lostA, war.lostB) = (war.lostA + uint128(lostA), war.lostB + uint128(lostD));
        } else {
            (war.lostA, war.lostB) = (war.lostA + uint128(lostD), war.lostB + uint128(lostA));
        }
    }
}

/// Families and wars (09-social.md, D-20, B-31). On-chain: membership, the three fixed ranks and war
/// bookkeeping; the board and circulars are off-chain messaging (B-10). Linked external library.
library Families {
    function _leads(CoreState storage s, Player storage p) private view returns (bool) {
        return FamilyRules.familyOf(s, p) != 0 && (p.rank == CAPO || p.rank == SUBCAPO);
    }

    /// Printable ASCII within [min, max]; returns the key for uniqueness, ignoring ASCII case.
    function _nameKey(string memory text, uint256 min, uint256 max, bytes1 kind)
        private
        pure
        returns (bytes32)
    {
        bytes memory b = bytes(text);
        if (b.length < min || b.length > max) revert InvalidName();
        bytes memory lower = new bytes(b.length);
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            if (c < 0x20 || c > 0x7e) revert InvalidName();
            lower[i] = c >= 0x41 && c <= 0x5a ? bytes1(uint8(c) + 32) : c;
        }
        return keccak256(abi.encodePacked(kind, lower));
    }

    function _member(CoreState storage s, uint64 id, uint64 family)
        private
        view
        returns (Player storage p)
    {
        p = s.players[id];
        if (p.controller == address(0) || FamilyRules.familyOf(s, p) != family) {
            revert NotAllowed();
        }
    }

    function _hasApplication(Player storage p, uint64 family) private view returns (bool) {
        for (uint256 i; i < p.applications.length; ++i) {
            if (p.applications[i] == family) return true;
        }
        return false;
    }

    function _removeApplication(Player storage p, uint64 family) private {
        uint64[] storage a = p.applications;
        for (uint256 i; i < a.length; ++i) {
            if (a[i] != family) continue;
            for (uint256 j = i; j + 1 < a.length; ++j) {
                a[j] = a[j + 1];
            }
            a.pop();
            return;
        }
    }

    function create(address caller, string memory tag, string memory name)
        external
        returns (uint64 id)
    {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.active(s, caller);
        if (FamilyRules.familyOf(s, p) != 0) revert InFamily();
        bytes32 tagKey = _nameKey(tag, Ruleset.TAG_MIN, Ruleset.TAG_MAX, "t");
        bytes32 nameKey = _nameKey(name, Ruleset.NAME_MIN, Ruleset.NAME_MAX, "n");
        if (s.familyNames[tagKey] != 0 || s.familyNames[nameKey] != 0) revert NameTaken();
        id = ++s.nextFamily;
        Family storage f = s.families[id];
        (f.alive, f.members, f.tag, f.name) = (true, 1, tag, name);
        (s.familyNames[tagKey], s.familyNames[nameKey]) = (id, id);
        (p.family, p.rank) = (id, CAPO);
        delete p.applications;
        emit IGameEvents.FamilyCreated(id, pid, tag, name);
    }

    function applyTo(address caller, uint64 family) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.active(s, caller);
        if (FamilyRules.familyOf(s, p) != 0) revert InFamily();
        if (!s.families[family].alive) revert UnknownFamily();
        // Drop applications to dissolved families, keeping the order.
        uint64[] storage a = p.applications;
        uint256 k;
        for (uint256 i; i < a.length; ++i) {
            if (s.families[a[i]].alive) a[k++] = a[i];
        }
        while (a.length > k) a.pop();
        if (_hasApplication(p, family)) revert AlreadyApplied();
        if (a.length >= Ruleset.MAX_APPLICATIONS) revert TooManyApplications();
        a.push(family);
        emit IGameEvents.ApplicationChanged(family, pid, true);
    }

    function withdraw(address caller, uint64 family) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.active(s, caller);
        if (!_hasApplication(p, family)) revert NoApplication();
        _removeApplication(p, family);
        emit IGameEvents.ApplicationChanged(family, pid, false);
    }

    function answer(address caller, uint64 applicant, bool accept) external {
        CoreState storage s = GameStorage.core();
        (, Player storage p) = Access.active(s, caller);
        if (!_leads(s, p)) revert NotAllowed();
        uint64 f = FamilyRules.familyOf(s, p);
        Player storage a = s.players[applicant];
        if (!_hasApplication(a, f)) revert NoApplication();
        if (!accept) {
            _removeApplication(a, f);
            emit IGameEvents.ApplicationChanged(f, applicant, false);
            return;
        }
        if (FamilyRules.familyOf(s, a) != 0) revert InFamily();
        (a.family, a.rank) = (f, MEMBER);
        delete a.applications;
        s.families[f].members += 1;
        emit IGameEvents.FamilyChanged(f, applicant, MEMBER);
    }

    function leave(address caller) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.active(s, caller);
        uint64 f = FamilyRules.familyOf(s, p);
        if (f == 0 || p.rank == CAPO) revert NotAllowed();
        (p.family, p.rank) = (0, 0);
        s.families[f].members -= 1;
        emit IGameEvents.FamilyChanged(f, pid, 0);
    }

    function kick(address caller, uint64 target) external {
        CoreState storage s = GameStorage.core();
        (, Player storage p) = Access.active(s, caller);
        if (!_leads(s, p)) revert NotAllowed();
        uint64 f = FamilyRules.familyOf(s, p);
        Player storage t = _member(s, target, f);
        if (t.rank == CAPO) revert NotAllowed(); // the Capo cannot be kicked (D-20)
        (t.family, t.rank) = (0, 0);
        s.families[f].members -= 1;
        emit IGameEvents.FamilyChanged(f, target, 0);
    }

    function setRank(address caller, uint64 target, uint8 rank) external {
        CoreState storage s = GameStorage.core();
        (, Player storage p) = Access.active(s, caller);
        if (!_leads(s, p) || (rank != SUBCAPO && rank != MEMBER)) revert NotAllowed();
        uint64 f = FamilyRules.familyOf(s, p);
        Player storage t = _member(s, target, f);
        if (t.rank == CAPO) revert NotAllowed();
        t.rank = rank;
        emit IGameEvents.FamilyChanged(f, target, rank);
    }

    function handOver(address caller, uint64 target) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.active(s, caller);
        uint64 f = FamilyRules.familyOf(s, p);
        if (f == 0 || p.rank != CAPO) revert NotAllowed();
        Player storage t = _member(s, target, f);
        if (target == pid) revert NotAllowed();
        (t.rank, p.rank) = (CAPO, SUBCAPO);
        emit IGameEvents.FamilyChanged(f, target, CAPO);
        emit IGameEvents.FamilyChanged(f, pid, SUBCAPO);
    }

    /// The Capo dissolves the family; its running wars count as lost (read lazily, see warBetween).
    function dissolve(address caller) external {
        CoreState storage s = GameStorage.core();
        (, Player storage p) = Access.active(s, caller);
        uint64 f = FamilyRules.familyOf(s, p);
        if (f == 0 || p.rank != CAPO) revert NotAllowed();
        Family storage fam = s.families[f];
        fam.alive = false;
        delete s.familyNames[_nameKey(fam.tag, 0, type(uint256).max, "t")];
        delete s.familyNames[_nameKey(fam.name, 0, type(uint256).max, "n")];
        (p.family, p.rank) = (0, 0);
        emit IGameEvents.FamilyDissolved(f);
    }

    function declareWar(address caller, uint64 other) external returns (uint64 id) {
        CoreState storage s = GameStorage.core();
        (, Player storage p) = Access.active(s, caller);
        if (!_leads(s, p)) revert NotAllowed();
        uint64 f = FamilyRules.familyOf(s, p);
        if (other == f || !s.families[other].alive) revert UnknownFamily();
        if (FamilyRules.warBetween(s, f, other) != 0) revert AlreadyAtWar();
        id = ++s.nextWar;
        (s.wars[id].a, s.wars[id].b) = (f, other);
        s.activeWar[FamilyRules.pairKey(f, other)] = id;
        emit IGameEvents.WarDeclared(id, f, other);
    }

    /// The side of `p` in a running war, or NotAllowed.
    function _side(CoreState storage s, Player storage p, uint64 warId)
        private
        view
        returns (War storage war, uint64 f)
    {
        war = s.wars[warId];
        f = FamilyRules.familyOf(s, p);
        if (
            f == 0 || (war.a != f && war.b != f) || FamilyRules.warBetween(s, war.a, war.b) != warId
        ) revert NotAllowed();
    }

    /// The Capo offers to surrender (the other family wins) or a draw.
    function offerPeace(address caller, uint64 warId, uint8 kind) external {
        CoreState storage s = GameStorage.core();
        (, Player storage p) = Access.active(s, caller);
        (War storage war, uint64 f) = _side(s, p, warId);
        if (p.rank != CAPO || (kind != OFFER_SURRENDER && kind != OFFER_DRAW)) revert NotAllowed();
        (war.offer, war.offerBy) = (kind, f);
        emit IGameEvents.PeaceOffered(warId, f, kind);
    }

    /// The other family's Capo or SubCapo answers the pending offer; accepting ends the war.
    function answerPeace(address caller, uint64 warId, bool accept) external {
        CoreState storage s = GameStorage.core();
        (, Player storage p) = Access.active(s, caller);
        (War storage war, uint64 f) = _side(s, p, warId);
        if (!_leads(s, p)) revert NotAllowed();
        if (war.offer == OFFER_NONE || war.offerBy == f) revert NoOffer();
        if (accept) {
            war.ended = true;
            war.winner = war.offer == OFFER_SURRENDER ? f : 0;
            delete s.activeWar[FamilyRules.pairKey(war.a, war.b)];
            emit IGameEvents.WarEnded(warId, war.winner);
        }
        (war.offer, war.offerBy) = (OFFER_NONE, 0);
    }
}
