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
    TooManyTrades,
    SharesLeft,
    InvalidTrade,
    InvalidWithdrawal,
    NotOwner,
    CannotAfford,
    IGameEvents
} from "./GameErrors.sol";

/// Market rules shared with Missions. Mirrors packages/rules/src/sim/market.ts.
library MarketRules {
    /// The value of the price and of what was paid, in dollars × Π rate (the common denominator of
    /// the trade's rate), so every comparison is exact.
    function values(Trade storage t) internal view returns (uint256 price, uint256 paid) {
        uint256 den = 1;
        for (uint256 r; r < RESOURCES; ++r) {
            if (t.rate[r] > 0) den *= t.rate[r];
        }
        for (uint256 r; r < RESOURCES; ++r) {
            if (t.rate[r] == 0) continue;
            uint256 unit = den / t.rate[r]; // value of one unit of the resource
            price += uint256(t.price[r]) * unit;
            paid += uint256(t.paid[r]) * unit;
        }
    }

    function fullyPaid(Trade storage t) internal view returns (bool) {
        for (uint256 r; r < RESOURCES; ++r) {
            if (t.paid[r] != t.price[r]) return false;
        }
        return true;
    }

    /// Final: the window closed, or the price is fully paid (D-19). Shares no longer change.
    function final_(Trade storage t, uint256 now_) internal view returns (bool) {
        return t.accepted && (now_ > t.closesAt || fullyPaid(t));
    }

    /// What `player` can still withdraw, per resource (all zeros for a third party). Totals first:
    /// the buyer earns `E = ⌊quantity × V / P⌋` of the goods as it pays; once final, the seller gets
    /// the rest of the goods and `⌈deposit × (P − V) / P⌉` of the deposit, the buyer the rest of the
    /// deposit. Roundings favour the seller. Then what that party already took is subtracted.
    function shareLeft(Trade storage t, uint64 player, uint256 now_)
        internal
        view
        returns (uint256[RESOURCES] memory left)
    {
        if (!t.accepted || (player != t.buyer && player != t.seller)) return left;
        bool buyer = player == t.buyer;
        (uint256 price, uint256 paid) = values(t);
        uint256 earned = uint256(t.quantity) * paid / price;
        bool fin = final_(t, now_);
        for (uint256 r; r < RESOURCES; ++r) {
            uint256 total;
            if (r == t.sold) {
                total = buyer ? earned : (fin ? t.quantity - earned : 0);
            } else if (fin && t.deposit[r] > 0) {
                uint256 sellerShare = _ceilDiv(uint256(t.deposit[r]) * (price - paid), price);
                total = buyer ? t.deposit[r] - sellerShare : sellerShare;
            }
            left[r] = total - (buyer ? t.buyerTook[r] : t.sellerTook[r]);
        }
    }

    /// Whether a trade stays in `player`'s list: not final, or final with a share left (B-11).
    function keeps(Trade storage t, uint64 player, uint256 now_) internal view returns (bool) {
        if (!final_(t, now_)) return true;
        uint256[RESOURCES] memory left = shareLeft(t, player, now_);
        for (uint256 r; r < RESOURCES; ++r) {
            if (left[r] > 0) return true;
        }
        return false;
    }

    /// Can `player` send a payment for this trade to a building of `targetOwner` now (D-26:
    /// checked at send)? Only the buyer, to the seller, while the trade is not final. The arrival
    /// must also be within the window: Missions checks it once the duration is known.
    function payable_(CoreState storage s, uint64 id, uint64 player, uint64 targetOwner)
        internal
        view
        returns (bool)
    {
        Trade storage t = s.trades[id];
        return
            t.accepted && player == t.buyer && targetOwner == t.seller
                && !final_(t, block.timestamp);
    }

    /// A transport naming a trade reached the coordinate chosen at send, at `at` (D-26): the
    /// buyer's cargo counts per resource and up to what remains unpaid, whatever happened to the
    /// building; the rest was a plain transport. A send arrives within the window (Missions checks).
    function settle(CoreState storage s, Mission storage m, uint256 at) internal {
        Trade storage t = s.trades[m.trade];
        if (!t.accepted || m.owner != t.buyer || at > t.closesAt) return;
        bool any;
        for (uint256 r; r < RESOURCES; ++r) {
            uint64 x = _min(m.cargo[r], t.price[r] - t.paid[r]);
            t.paid[r] += x;
            if (x > 0) any = true;
        }
        if (any) emit IGameEvents.TradePaid(m.trade, t.paid);
    }

    function _min(uint64 a, uint64 b) private pure returns (uint64) {
        return a < b ? a : b;
    }

    function _ceilDiv(uint256 a, uint256 b) private pure returns (uint256) {
        return (a + b - 1) / b;
    }
}

/// Market (09-social.md#market, D-19, B-11): private offers at fixed exchange rates. From
/// acceptance the trade holds the seller's goods and the buyer's deposit; the buyer pays with
/// transport missions that name the trade, and each party withdraws its shares. Nobody can owe
/// anything. Linked external library.
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

    /// Prunes both trade lists of `p` and reverts `SharesLeft` if one of them still holds a final
    /// trade: a player cannot offer or accept with a share left in a final trade (D-19).
    function _gate(CoreState storage s, uint64 pid, Player storage p) private {
        _prune(s, pid, p.offers);
        _prune(s, pid, p.purchases);
        for (uint256 i; i < p.offers.length; ++i) {
            if (MarketRules.final_(s.trades[p.offers[i]], block.timestamp)) revert SharesLeft();
        }
        for (uint256 i; i < p.purchases.length; ++i) {
            if (MarketRules.final_(s.trades[p.purchases[i]], block.timestamp)) revert SharesLeft();
        }
    }

    /// Drops the trades `pid` no longer keeps (B-11), keeping the order.
    function _prune(CoreState storage s, uint64 pid, uint64[] storage list) private {
        uint256 k;
        for (uint256 i; i < list.length; ++i) {
            if (MarketRules.keeps(s.trades[list[i]], pid, block.timestamp)) list[k++] = list[i];
        }
        while (list.length > k) list.pop();
    }

    /// The seller offers `quantity` of `sold` from its building `from`; nothing is held yet.
    function offer(
        address caller,
        uint64 buyer,
        uint64 from,
        uint256 sold,
        uint256 quantity,
        uint256[RESOURCES] memory price
    ) external returns (uint64 id) {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.active(s, caller);
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
        if (s.buildings[from].owner != pid) revert NotOwner();
        _gate(s, pid, p);
        if (p.offers.length >= Ruleset.MAX_OPEN_OFFERS) revert TooManyOffers();

        id = ++s.nextTrade;
        Trade storage t = s.trades[id];
        (t.seller, t.buyer, t.from, t.sold, t.quantity) =
        (pid, buyer, from, uint8(sold), uint64(quantity));
        uint256[RESOURCES] memory values = Ruleset.marketRates()[rate];
        for (uint256 r; r < RESOURCES; ++r) {
            t.price[r] = uint64(price[r]);
            t.rate[r] = uint64(values[r]);
        }
        p.offers.push(id);
        emit IGameEvents.TradeOffered(id, pid, buyer, from, t.sold, t.quantity, t.price, t.rate);
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

    /// The buyer accepts, naming its building the deposit leaves (D-19). The seller is checked
    /// again (active); both buildings are settled (B-06), then the goods leave the offer's building
    /// and the deposit the buyer's. The window starts, and neither party can start a vacation
    /// until it closes (D-18).
    function accept(address caller, uint64 id, uint64 depositBuilding) external {
        CoreState storage s = GameStorage.core();
        (uint64 pid, Player storage p) = Access.active(s, caller);
        Trade storage t = s.trades[id];
        if (t.seller == 0 || t.accepted || pid != t.buyer) revert InvalidTrade();
        Player storage seller = s.players[t.seller];
        if (seller.vacationUntil > block.timestamp || seller.suspendedUntil > block.timestamp) {
            revert InvalidTrade();
        }
        _gate(s, pid, p);
        if (p.purchases.length >= Ruleset.MAX_PURCHASES) revert TooManyTrades();
        _hold(s, t, depositBuilding, pid);
        (t.accepted, t.closesAt) = (true, uint40(block.timestamp + Ruleset.MARKET_WINDOW_SECONDS));
        p.purchases.push(id);
        if (t.closesAt > seller.tradeLockUntil) seller.tradeLockUntil = t.closesAt;
        if (t.closesAt > p.tradeLockUntil) p.tradeLockUntil = t.closesAt;
        emit IGameEvents.TradeAccepted(id, t.closesAt, t.deposit);
    }

    /// Takes the goods from the offer's building and the deposit (⌈price × p / 100⌉ per resource)
    /// from the buyer's, both settled first.
    function _hold(CoreState storage s, Trade storage t, uint64 depositBuilding, uint64 pid)
        private
    {
        Building storage from = s.buildings[t.from];
        Building storage dep = s.buildings[depositBuilding];
        if (from.owner != t.seller || dep.owner != pid) revert NotOwner();
        SettleLib.settle(t.from, block.timestamp);
        SettleLib.settle(depositBuilding, block.timestamp);
        uint256[RESOURCES] memory goods;
        uint256[RESOURCES] memory deposit;
        goods[t.sold] = t.quantity;
        for (uint256 r; r < RESOURCES; ++r) {
            deposit[r] = (uint256(t.price[r]) * Ruleset.DEPOSIT_PERCENT + 99) / 100;
            t.deposit[r] = uint64(deposit[r]);
        }
        if (!Settlement.affordable(from, goods) || !Settlement.affordable(dep, deposit)) {
            revert CannotAfford();
        }
        Settlement.pay(from, goods);
        Settlement.pay(dep, deposit);
    }

    /// A party moves part of its shares into a building of its own, settled first (B-06). Each
    /// amount must fit in its share left and in the building's free capacity, and at least one
    /// must be > 0. The counterparty's state does not matter.
    function withdraw(address caller, uint64 id, uint64 toId, uint256[RESOURCES] memory amount)
        external
    {
        CoreState storage s = GameStorage.core();
        (uint64 pid,, Building storage to) = Access.owned(s, caller, toId);
        Trade storage t = s.trades[id];
        if (!t.accepted || (pid != t.seller && pid != t.buyer)) revert InvalidTrade();
        SettleLib.settle(toId, block.timestamp);
        uint256[RESOURCES] memory left = MarketRules.shareLeft(t, pid, block.timestamp);
        uint256[RESOURCES] memory cap = Economy.capacities(to.levels);
        bool any;
        uint64[RESOURCES] memory moved;
        for (uint256 r; r < RESOURCES; ++r) {
            uint256 a = amount[r];
            if (a == 0) continue;
            uint256 free = cap[r] > to.stock[r] ? (cap[r] - to.stock[r]) / Ruleset.STOCK_SCALE : 0;
            if (a > left[r] || a > free) revert InvalidWithdrawal();
            any = true;
            moved[r] = uint64(a);
            if (pid == t.buyer) t.buyerTook[r] += uint64(a);
            else t.sellerTook[r] += uint64(a);
        }
        if (!any) revert InvalidWithdrawal();
        Settlement.credit(to, amount);
        emit IGameEvents.TradeWithdrawn(id, pid, moved);
    }
}
