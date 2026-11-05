// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
// Game is imported for its public ABI struct only; this library never calls Game.
import {Game} from "../Game.sol";
import {CoreState, Player, ControllerInfo, GameStorage} from "./GameStorage.sol";

/// Linked raw-state encoding keeps the Game facade within EIP-170 without changing its ABI.
library GameViews {
    function playerData(uint64 id) external view returns (bytes memory) {
        Game.PlayerView memory v;
        CoreState storage s = GameStorage.core();
        Player storage p = s.players[id];
        v.controllers = p.controllers;
        v.researchBuilding = p.researchBuilding;
        v.buildings = p.buildings;
        v.centipoints = p.centipoints;
        v.missions = p.missions;
        v.research = p.research;
        v.researchQueue = p.researchQueue;
        v.vacationUntil = p.vacationUntil;
        v.suspendedUntil = p.suspendedUntil;
        v.premiumUntil = p.premiumUntil;
        v.family = p.family;
        v.rank = p.rank;
        v.applications = p.applications;
        v.offers = p.offers;
        v.sessionEpoch = p.sessionEpoch;
        v.vacationStart = p.vacationStart;
        v.tradeLockUntil = p.tradeLockUntil;
        v.removalAt = new uint40[](p.controllers.length);
        v.recovery = new bool[](p.controllers.length);
        for (uint256 i; i < p.controllers.length; ++i) {
            ControllerInfo storage info = s.controllerInfo[p.controllers[i]];
            v.removalAt[i] = info.removalAt;
            v.recovery[i] = info.recovery;
        }
        v.transferTo = p.transferTo;
        v.transferAt = p.transferAt;
        v.vacationSeq = p.vacationSeq;
        v.purchases = p.purchases;
        return abi.encode(v);
    }
}
