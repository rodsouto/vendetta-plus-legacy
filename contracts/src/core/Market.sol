// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    RESOURCES,
    MARKET_RATES,
    VendettaRuleset as Ruleset
} from "../generated/VendettaRuleset.sol";
import {Economy} from "../rules/Economy.sol";
import {Player, Building, Trade, Mission, CoreState, GameStorage} from "./GameStorage.sol";
import {Access} from "./Access.sol";
import {Settlement, SettleLib} from "./Settlement.sol";
import {
    InvalidOffer,
    TooManyOffers,
    InvalidTrade,
    InDebt,
    InvalidClaim,
    NotOwner,
    IGameEvents
} from "./GameErrors.sol";

/// Market rules shared with Missions and Account. Mirrors packages/rules/src/sim/market.ts.
library MarketRules {
    /// The debt of a trade (D-19, Default).
    struct Debt {
        uint64 debtor; // 0 = no debt
        uint64 creditor;
        uint256[RESOURCES] owed; // per resource, penalty included
        uint256[RESOURCES] remaining; // owed − returned
    }

    /// When the 10-day delivery window of an accepted trade closes.
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

    /// B-11: a player with a registered debt only transports to its own buildings and its
    /// creditors': those registered, or the creditor of the defaulted trade the transport names,
    /// registered or not. An empty slot (`targetOwner` 0) is not allowed either.
    function transportAllowed(
        CoreState storage s,
        uint64 pid,
        Player storage p,
        uint64 targetOwner,
        uint64 trade,
        uint256 at
    ) internal view returns (bool) {
        if (p.debts == 0) return true;
        if (targetOwner == 0) return false;
        if (targetOwner == pid || s.owes[pid][targetOwner] > 0) return true;
        if (trade == 0) return false;
        Trade storage t = s.trades[trade];
        if (!t.accepted || at <= window(t)) return false;
        Debt memory d = debt(t);
        return inDefault(d) && d.debtor == pid && d.creditor == targetOwner;
    }

    /// A pure function of `delivered`, `paid`, the rate the price matched and the penalty, minus
    /// `returned`. Values are in dollars × Π rate (the common denominator), so every comparison is
    /// exact. Meaningful once the window has closed, when `delivered` and `paid` no longer change.
    function debt(Trade storage t) internal view returns (Debt memory d) {
        uint256[RESOURCES] memory rate = Ruleset.marketRates()[t.rate];
        uint256 den = 1;
        for (uint256 r; r < RESOURCES; ++r) {
            if (rate[r] > 0) den *= rate[r];
        }
        uint256 priceValue;
        uint256 paidValue;
        for (uint256 r; r < RESOURCES; ++r) {
            if (rate[r] == 0) continue;
            uint256 unit = den / rate[r]; // value of one unit of the resource
            priceValue += uint256(t.price[r]) * unit;
            paidValue += uint256(t.paid[r]) * unit;
        }
        // Progress compared over the common denominator: delivered / quantity vs paidValue / priceValue.
        uint256 sellerSide = uint256(t.delivered) * priceValue;
        uint256 buyerSide = paidValue * t.quantity;
        if (sellerSide == buyerSide) return d;
        if (sellerSide > buyerSide) {
            // The buyer paid for less than it received: it gives back the rest of the sold resource.
            (d.debtor, d.creditor) = (t.buyer, t.seller);
            d.owed[t.sold] = t.delivered - uint256(t.quantity) * paidValue / priceValue;
        } else {
            // The seller delivered less than it was paid for: the excess value goes back in
            // proportion to what was paid, rounded up.
            (d.debtor, d.creditor) = (t.seller, t.buyer);
            uint256 excess = buyerSide - sellerSide;
            for (uint256 r; r < RESOURCES; ++r) {
                if (t.paid[r] > 0) d.owed[r] = _ceilDiv(uint256(t.paid[r]) * excess, buyerSide);
            }
        }
        for (uint256 r; r < RESOURCES; ++r) {
            d.owed[r] = _ceilDiv(d.owed[r] * (100 + Ruleset.DEFAULT_PENALTY_PERCENT), 100);
            d.remaining[r] = d.owed[r] - t.returned[r];
        }
    }

    /// Something is still owed.
    function inDefault(Debt memory d) internal pure returns (bool) {
        if (d.debtor == 0) return false;
        for (uint256 r; r < RESOURCES; ++r) {
            if (d.remaining[r] > 0) return true;
        }
        return false;
    }

    /// Can `player` send a transport naming this trade to a building of `targetOwner` now? Inside
    /// the window, each party to the other; after it, the debtor to the creditor while something
    /// remains (voluntary payment). The counterparty is checked here, at send (D-26).
    function openFor(CoreState storage s, uint64 id, uint64 player, uint64 targetOwner)
        internal
        view
        returns (bool)
    {
        Trade storage t = s.trades[id];
        if (!t.accepted) return false;
        if (block.timestamp <= window(t)) {
            return (player == t.seller && targetOwner == t.buyer)
                || (player == t.buyer && targetOwner == t.seller);
        }
        Debt memory d = debt(t);
        return inDefault(d) && player == d.debtor && targetOwner == d.creditor;
    }

    /// A transport naming a trade reached the coordinate chosen at send, at `at` (D-26): the cargo
    /// counts per resource and up to what remains, whatever happened to the building; the rest was
    /// a plain transport. Inside the window: the seller's adds to `delivered`, the buyer's to `paid`.
    /// After it: the debtor's adds to `returned`.
    function settle(CoreState storage s, Mission storage m, uint256 at) internal {
        Trade storage t = s.trades[m.trade];
        if (!t.accepted) return;
        if (at <= window(t)) {
            bool any;
            if (m.owner == t.seller) {
                uint64 x = _min(m.cargo[t.sold], t.quantity - t.delivered);
                t.delivered += x;
                any = x > 0;
            } else if (m.owner == t.buyer) {
                for (uint256 r; r < RESOURCES; ++r) {
                    uint64 x = _min(m.cargo[r], t.price[r] - t.paid[r]);
                    t.paid[r] += x;
                    if (x > 0) any = true;
                }
            }
            if (any) emit IGameEvents.TradeSettled(m.trade, t.delivered, t.paid, t.returned);
            return;
        }
        Debt memory d = debt(t);
        if (!inDefault(d) || m.owner != d.debtor) return;
        uint256[RESOURCES] memory amount;
        for (uint256 r; r < RESOURCES; ++r) {
            amount[r] = d.remaining[r] < m.cargo[r] ? d.remaining[r] : m.cargo[r];
        }
        if (addReturned(s, m.trade, t, d, amount)) {
            emit IGameEvents.TradeSettled(m.trade, t.delivered, t.paid, t.returned);
        }
    }

    /// `amount` of each resource reached the creditor as restitution. Once a registered debt is
    /// fully returned, it stops counting (B-11). Returns whether anything was added.
    function addReturned(
        CoreState storage s,
        uint64 id,
        Trade storage t,
        Debt memory d,
        uint256[RESOURCES] memory amount
    ) internal returns (bool any) {
        bool paid = t.registered;
        for (uint256 r; r < RESOURCES; ++r) {
            if (amount[r] > 0) any = true;
            if (d.remaining[r] != amount[r]) paid = false;
            t.returned[r] += uint64(amount[r]);
        }
        if (!any) return false;
        if (paid) {
            s.players[d.debtor].debts -= 1;
            s.owes[d.debtor][d.creditor] -= 1;
            emit IGameEvents.DebtPaid(id);
        }
    }

    /// Registers the debt of a defaulted trade (B-11): the debtor's restrictions start. Idempotent.
    function register(CoreState storage s, uint64 id, Trade storage t, Debt memory d) internal {
        if (t.registered) return;
        t.registered = true;
        s.players[d.debtor].debts += 1;
        s.owes[d.debtor][d.creditor] += 1;
        emit IGameEvents.DebtRegistered(id, d.debtor, d.creditor);
    }

    function _min(uint64 a, uint64 b) private pure returns (uint64) {
        return a < b ? a : b;
    }

    function _ceilDiv(uint256 a, uint256 b) private pure returns (uint256) {
        return (a + b - 1) / b;
    }
}

/// Market (09-social.md#market, D-19, B-11): private offers at fixed exchange rates, delivered with
/// transport missions that name the trade. No escrow: a default owes restitution plus a penalty,
/// claimed by the creditor. Linked external library.
library Market {
    /// quantity / rate[sold] = Σ price[r] / rate[r], over the common denominator Π rate. Returns
    /// the index of the single rate matched; MARKET_RATES when none or more than one match (B-11).
    function _match(uint256 sold, uint256 quantity, uint256[RESOURCES] memory price)
        private
        pure
        returns (uint256 found)
    {
        found = MARKET_RATES;
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
            if (ok && quantity * den / rate[sold] == value) {
                if (found != MARKET_RATES) return MARKET_RATES; // ambiguous
                found = k;
            }
        }
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
        if (p.debts > 0) revert InDebt();
        uint256 alc = Ruleset.CONVERTED_RESOURCE;
        if (s.players[buyer].controllers.length == 0 || buyer == pid) revert InvalidOffer();
        if (sold >= RESOURCES || sold == alc) revert InvalidOffer();
        if (quantity < 1 || quantity > type(uint64).max) revert InvalidOffer();
        if (price[alc] != 0 || price[sold] != 0) revert InvalidOffer();
        for (uint256 r; r < RESOURCES; ++r) {
            if (price[r] > type(uint64).max) revert InvalidOffer(); // stored as uint64
        }
        uint256 rate = _match(sold, quantity, price);
        if (rate == MARKET_RATES) revert InvalidOffer();
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
        (t.seller, t.buyer, t.sold, t.quantity, t.rate) =
        (pid, buyer, uint8(sold), uint64(quantity), uint8(rate));
        for (uint256 r; r < RESOURCES; ++r) {
            t.price[r] = uint64(price[r]);
        }
        list.push(id);
        emit IGameEvents.TradeOffered(id, pid, buyer, t.sold, t.quantity, t.price, t.rate);
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

    /// The buyer accepts: the 10-day delivery window starts, and neither party can start a
    /// vacation until it closes (D-18). The seller is checked again, as when it offered: active
    /// and free of registered debt.
    function accept(address caller, uint64 id) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.active(s, caller);
        if (p.debts > 0) revert InDebt();
        Trade storage t = s.trades[id];
        if (t.seller == 0 || t.accepted || pid != t.buyer) revert InvalidTrade();
        Player storage seller = s.players[t.seller];
        if (
            seller.vacationUntil > block.timestamp || seller.suspendedUntil > block.timestamp
                || seller.debts > 0
        ) revert InvalidTrade();
        (t.accepted, t.acceptedAt) = (true, uint40(block.timestamp));
        uint40 lock = uint40(MarketRules.window(t));
        if (lock > seller.tradeLockUntil) seller.tradeLockUntil = lock;
        if (lock > p.tradeLockUntil) p.tradeLockUntil = lock;
        emit IGameEvents.TradeAccepted(id);
    }

    /// The creditor registers the debt of a defaulted trade without collecting anything (B-11),
    /// so the debtor's restrictions start even while nothing can be claimed. Idempotent.
    function registerDebt(address caller, uint64 id) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid,) = Access.active(s, caller);
        Trade storage t = s.trades[id];
        if (t.seller == 0 || !t.accepted || block.timestamp <= MarketRules.window(t)) {
            revert InvalidTrade();
        }
        MarketRules.Debt memory d = MarketRules.debt(t);
        if (!MarketRules.inDefault(d) || d.creditor != pid) revert InvalidTrade();
        MarketRules.register(s, id, t, d);
    }

    /// The creditor collects part of a debt directly from a building of the debtor into one of
    /// its own, both settled first (B-06); works whether the debtor is active, suspended or on
    /// vacation. Each amount must fit in what remains, in the debtor's stock and in the creditor's
    /// free capacity, and at least one must be > 0. The first claim registers the debt (B-11).
    function claim(
        address caller,
        uint64 id,
        uint64 fromId,
        uint64 toId,
        uint256[RESOURCES] memory amount
    ) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid,) = Access.active(s, caller);
        Trade storage t = s.trades[id];
        if (t.seller == 0 || !t.accepted || block.timestamp <= MarketRules.window(t)) {
            revert InvalidTrade();
        }
        MarketRules.Debt memory d = MarketRules.debt(t);
        if (!MarketRules.inDefault(d) || d.creditor != pid) revert InvalidTrade();
        _collect(s, d, fromId, toId, amount);
        MarketRules.register(s, id, t, d);
        MarketRules.addReturned(s, id, t, d, amount);
        uint64[RESOURCES] memory moved;
        for (uint256 r; r < RESOURCES; ++r) {
            moved[r] = uint64(amount[r]);
        }
        emit IGameEvents.TradeClaimed(id, moved);
    }

    /// Moves `amount` from the debtor's building to the creditor's, checking it fits.
    function _collect(
        CoreState storage s,
        MarketRules.Debt memory d,
        uint64 fromId,
        uint64 toId,
        uint256[RESOURCES] memory amount
    ) private {
        Building storage from = s.buildings[fromId];
        Building storage to = s.buildings[toId];
        if (from.owner != d.debtor || to.owner != d.creditor) revert NotOwner();
        SettleLib.settle(fromId, block.timestamp);
        SettleLib.settle(toId, block.timestamp);
        uint256[RESOURCES] memory cap = Economy.capacities(to.levels);
        bool any;
        for (uint256 r; r < RESOURCES; ++r) {
            uint256 a = amount[r];
            if (a == 0) continue;
            uint256 free = cap[r] > to.stock[r] ? (cap[r] - to.stock[r]) / Ruleset.STOCK_SCALE : 0;
            if (a > d.remaining[r] || a > from.stock[r] / Ruleset.STOCK_SCALE || a > free) {
                revert InvalidClaim();
            }
            any = true;
        }
        if (!any) revert InvalidClaim();
        Settlement.pay(from, amount);
        Settlement.credit(to, amount);
    }
}
