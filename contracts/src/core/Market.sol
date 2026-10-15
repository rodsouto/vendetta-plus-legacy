// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    RESOURCES,
    MARKET_RATES,
    VendettaRuleset as Ruleset
} from "../generated/VendettaRuleset.sol";
import {Player, Trade, Mission, CoreState, GameStorage} from "./GameStorage.sol";
import {Access} from "./Access.sol";
import {InvalidOffer, TooManyOffers, InvalidTrade, IGameEvents} from "./GameErrors.sol";

/// Market rules shared with Missions. Mirrors packages/rules/src/sim/market.ts.
library MarketRules {
    function window(Trade storage t) internal view returns (uint256) {
        return uint256(t.acceptedAt) + Ruleset.MARKET_WINDOW_SECONDS;
    }

    function complete(Trade storage t) internal view returns (bool) {
        if (t.delivered != t.quantity) return false;
        for (uint256 r; r < RESOURCES; ++r) {
            if (t.paid[r] != t.price[r]) return false;
        }
        return true;
    }

    /// Pending, or accepted, inside the window and not complete: counts against the cap.
    function open(Trade storage t, uint256 now_) internal view returns (bool) {
        return !t.accepted || (now_ <= window(t) && !complete(t));
    }

    /// Can `player` send a transport for this trade now?
    function openFor(CoreState storage s, uint64 id, uint64 player) internal view returns (bool) {
        Trade storage t = s.trades[id];
        return
            t.accepted && block.timestamp <= window(t) && (player == t.seller || player == t.buyer);
    }

    /// Transport naming a trade arrived at a building of `to` at `at` (resources already credited).
    function settle(CoreState storage s, Mission storage m, uint64 to, uint256 at) internal {
        Trade storage t = s.trades[m.trade];
        if (!t.accepted || at > window(t)) return;
        uint256 alc = Ruleset.CONVERTED_RESOURCE;
        if (m.owner == t.seller && to == t.buyer) {
            uint256 kinds;
            for (uint256 r; r < RESOURCES; ++r) {
                if (r != alc && m.cargo[r] > 0) ++kinds;
            }
            uint64 sent = m.cargo[t.sold];
            if (kinds == 1 && sent > 0 && sent <= t.quantity - t.delivered) t.delivered += sent;
        } else if (m.owner == t.buyer && to == t.seller) {
            for (uint256 r; r < RESOURCES; ++r) {
                if (r != alc && m.cargo[r] > t.price[r] - t.paid[r]) return;
            }
            for (uint256 r; r < RESOURCES; ++r) {
                if (r != alc) t.paid[r] += m.cargo[r];
            }
        } else {
            return;
        }
        emit IGameEvents.TradeSettled(m.trade, t.delivered, t.paid);
    }
}

/// Market (09-social.md#market, D-19, B-11): private offers at fixed exchange rates, delivered with
/// transport missions that name the trade. No escrow. Linked external library.
library Market {
    /// quantity / rate[sold] = Σ price[r] / rate[r], over the common denominator Π rate.
    function _fair(uint256 sold, uint256 quantity, uint256[RESOURCES] memory price)
        private
        pure
        returns (bool)
    {
        uint256[RESOURCES][MARKET_RATES] memory rates = Ruleset.marketRates();
        for (uint256 k; k < MARKET_RATES; ++k) {
            uint256[RESOURCES] memory rate = rates[k];
            if (rate[sold] == 0) continue;
            uint256 den = 1;
            for (uint256 r; r < RESOURCES; ++r) {
                if (rate[r] > 0) den *= rate[r];
            }
            uint256 value;
            bool ok = true;
            for (uint256 r; r < RESOURCES; ++r) {
                if (price[r] == 0) continue;
                if (rate[r] == 0) {
                    ok = false;
                    break;
                }
                value += price[r] * den / rate[r];
            }
            if (ok && quantity * den / rate[sold] == value) return true;
        }
        return false;
    }

    function offer(
        address caller,
        uint64 buyer,
        uint256 sold,
        uint256 quantity,
        uint256[RESOURCES] memory price
    ) external returns (uint64 id) {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.active(s, caller);
        uint256 alc = Ruleset.CONVERTED_RESOURCE;
        if (s.players[buyer].controller == address(0) || buyer == pid) revert InvalidOffer();
        if (sold >= RESOURCES || sold == alc) revert InvalidOffer();
        if (quantity < 1) revert InvalidOffer();
        if (price[alc] != 0 || price[sold] != 0) revert InvalidOffer();
        if (!_fair(sold, quantity, price)) revert InvalidOffer();
        // Drop offers that are no longer open, keeping the order.
        uint64[] storage list = p.offers;
        uint256 k;
        for (uint256 i; i < list.length; ++i) {
            if (MarketRules.open(s.trades[list[i]], block.timestamp)) list[k++] = list[i];
        }
        while (list.length > k) list.pop();
        if (list.length >= Ruleset.MAX_OPEN_OFFERS) revert TooManyOffers();

        id = ++s.nextTrade;
        Trade storage t = s.trades[id];
        (t.seller, t.buyer, t.sold, t.quantity) = (pid, buyer, uint8(sold), uint64(quantity));
        for (uint256 r; r < RESOURCES; ++r) {
            t.price[r] = uint64(price[r]);
        }
        list.push(id);
        emit IGameEvents.TradeOffered(id, pid, buyer);
    }

    /// Only a pending offer can be cancelled, by either party (D-19).
    function cancel(address caller, uint64 id) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid,) = Access.active(s, caller);
        Trade storage t = s.trades[id];
        if (t.seller == 0 || t.accepted || (pid != t.seller && pid != t.buyer)) {
            revert InvalidTrade();
        }
        uint64[] storage list = s.players[t.seller].offers;
        for (uint256 i; i < list.length; ++i) {
            if (list[i] != id) continue;
            for (uint256 j = i; j + 1 < list.length; ++j) {
                list[j] = list[j + 1];
            }
            list.pop();
            break;
        }
        delete s.trades[id];
        emit IGameEvents.TradeCancelled(id);
    }

    /// The buyer accepts: the 10-day delivery window starts.
    function accept(address caller, uint64 id) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid,) = Access.active(s, caller);
        Trade storage t = s.trades[id];
        if (t.seller == 0 || t.accepted || pid != t.buyer) revert InvalidTrade();
        (t.accepted, t.acceptedAt) = (true, uint40(block.timestamp));
        emit IGameEvents.TradeAccepted(id);
    }
}
