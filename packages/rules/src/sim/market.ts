// Market (09-social.md#market, D-19, B-11): private offers at fixed exchange rates. From acceptance
// the trade holds the seller's goods and the buyer's deposit; the buyer pays with ordinary transport
// missions that name the trade, and each party withdraws its shares. Nobody can owe anything.
// Mirrors contracts/src/core/Market.sol.
import { active, atomic, onVacation, owned, suspended } from "./common.js";
import { drain } from "./missions.js";
import { fail } from "./errors.js";
import { affordable, capacities, credit, pay, settle } from "./settle.js";
import {
  stockScale,
  type Mission,
  type Building,
  type Player,
  type Trade,
  type World,
} from "./state.js";

const converted = (w: World) =>
  w.rs.resources.indexOf(w.rs.buildings.find((b) => b.production?.consumes)!.production!.consumes!);

const min = (a: bigint, b: bigint) => (a < b ? a : b);
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
const UINT64_MAX = 2n ** 64n - 1n;
const amounts = (w: World, v: bigint[]) =>
  Object.fromEntries(w.rs.resources.map((r, i) => [r, v[i]!]));

/**
 * The value of the price and of what was paid, in dollars × Π rate (the common denominator of the
 * trade's rate), so every comparison is exact.
 */
export function tradeValues(t: Trade): { price: bigint; paid: bigint } {
  const den = t.rate.reduce((d, x) => (x > 0n ? d * x : d), 1n);
  const unit = t.rate.map((x) => (x > 0n ? den / x : 0n)); // value of one unit of each resource
  return {
    price: t.price.reduce((s, x, r) => s + x * unit[r]!, 0n),
    paid: t.paid.reduce((s, x, r) => s + x * unit[r]!, 0n),
  };
}

const fullyPaid = (t: Trade) => t.paid.every((x, r) => x === t.price[r]);

/** Final: the window closed, or the price is fully paid (D-19). Shares no longer change. */
export const tradeFinal = (t: Trade, now: bigint) =>
  t.accepted && (now > t.closesAt || fullyPaid(t));

/**
 * What each party is entitled to in total (D-19), before subtracting what it already took. The
 * buyer earns `E = ⌊quantity × V / P⌋` of the goods as it pays; once final, the seller gets the rest
 * of the goods and `⌈deposit × (P − V) / P⌉` of the deposit, the buyer the rest of the deposit.
 * Roundings favour the seller.
 */
export function tradeShares(t: Trade, now: bigint): { buyer: bigint[]; seller: bigint[] } {
  const buyer = t.price.map(() => 0n);
  const seller = t.price.map(() => 0n);
  if (!t.accepted) return { buyer, seller };
  const v = tradeValues(t);
  const earned = (t.quantity * v.paid) / v.price;
  buyer[t.sold] = earned;
  if (!tradeFinal(t, now)) return { buyer, seller };
  seller[t.sold] = t.quantity - earned;
  t.deposit.forEach((d, r) => {
    if (d === 0n) return;
    seller[r] = ceilDiv(d * (v.price - v.paid), v.price);
    buyer[r] = d - seller[r]!;
  });
  return { buyer, seller };
}

/** What `player` can still withdraw from the trade, per resource (all zeros for a third party). */
export function shareLeft(t: Trade, player: bigint, now: bigint): bigint[] {
  const s = tradeShares(t, now);
  if (player === t.buyer) return s.buyer.map((x, r) => x - t.buyerTook[r]!);
  if (player === t.seller) return s.seller.map((x, r) => x - t.sellerTook[r]!);
  return t.price.map(() => 0n);
}

/**
 * Whether a trade stays in the seller's list (`Player.offers`): pending, not final, or final with a
 * seller share left. In the buyer's (`Player.purchases`): not final, or final with a buyer share
 * left (B-11).
 */
const keeps = (t: Trade, player: bigint, now: bigint) =>
  !tradeFinal(t, now) || shareLeft(t, player, now).some((x) => x > 0n);

/**
 * Prunes both trade lists of `p` and fails `SharesLeft` if one of them still holds a final trade:
 * a player cannot offer or accept with a share left in a final trade (D-19).
 */
function gate(w: World, p: Player, now: bigint): void {
  const kept = (list: bigint[]) => list.filter((id) => keeps(w.trades.get(id)!, p.id, now));
  p.offers = kept(p.offers);
  p.purchases = kept(p.purchases);
  for (const id of [...p.offers, ...p.purchases]) {
    if (tradeFinal(w.trades.get(id)!, now)) fail("SharesLeft");
  }
}

/**
 * Can `player` send a payment for this trade to a building of `targetOwner` now (D-26: checked at
 * send)? Only the buyer, to the seller, while the trade is not final. The arrival must also be
 * within the window: `sendMission` checks it once the duration is known.
 */
export function tradePayable(
  w: World,
  id: bigint,
  player: bigint,
  targetOwner: bigint | undefined,
  now: bigint,
): boolean {
  const t = w.trades.get(id);
  return !!t && t.accepted && player === t.buyer && targetOwner === t.seller && !tradeFinal(t, now);
}

/**
 * The price must match exactly one of the fixed rates (value of 1 dollar in each resource):
 * quantity / rate[sold] = Σ price[r] / rate[r], compared over the common denominator Π rate.
 * Returns the index of the rate matched, or -1 when none or more than one match (B-11).
 */
function matchRate(w: World, sold: number, quantity: bigint, price: bigint[]): number {
  let found = -1;
  w.rs.config.marketRates.forEach((rate, k) => {
    if (rate[sold] === 0n) return;
    const den = rate.reduce((d, x) => (x > 0n ? d * x : d), 1n);
    let value = 0n;
    for (let r = 0; r < price.length; r++) {
      if (price[r] === 0n) continue;
      if (rate[r] === 0n) return;
      value += (price[r]! * den) / rate[r]!;
    }
    if ((quantity * den) / rate[sold]! !== value) return;
    found = found === -1 ? k : -2; // a second match makes it ambiguous
  });
  return found < 0 ? -1 : found;
}

/** The seller offers `quantity` of `sold` from its building `from`; nothing is held yet. */
export const offerTrade = atomic(function offerTrade(
  w: World,
  controller: string,
  buyer: bigint,
  from: bigint,
  sold: number,
  quantity: bigint,
  price: bigint[],
  now: bigint,
): bigint {
  drain(w, now);
  const p = active(w, controller, now);
  const alc = converted(w);
  if (!w.players.has(buyer) || buyer === p.id) fail("InvalidOffer");
  if (sold < 0 || sold >= w.rs.resources.length || sold === alc) fail("InvalidOffer");
  if (quantity < 1n || quantity > UINT64_MAX || price.length !== w.rs.resources.length)
    fail("InvalidOffer");
  if (price.some((x) => x < 0n) || price[alc]! !== 0n || price[sold]! !== 0n) fail("InvalidOffer");
  if (price.some((x) => x > UINT64_MAX)) fail("InvalidOffer"); // stored as uint64
  const rate = matchRate(w, sold, quantity, price);
  if (rate < 0) fail("InvalidOffer");
  if (w.buildings.get(from)?.owner !== p.id) fail("NotOwner");
  gate(w, p, now);
  if (p.offers.length >= w.rs.config.maxOpenOffers) fail("TooManyOffers");
  const zero = price.map(() => 0n);
  const t: Trade = {
    id: w.nextTrade++,
    seller: p.id,
    buyer,
    from,
    sold,
    quantity,
    price: [...price],
    rate: [...w.rs.config.marketRates[rate]!],
    accepted: false,
    closesAt: 0n,
    deposit: [...zero],
    paid: [...zero],
    sellerTook: [...zero],
    buyerTook: [...zero],
  };
  w.trades.set(t.id, t);
  p.offers.push(t.id);
  return t.id;
});

/** Only a pending offer can be cancelled, by either party (D-19). */
export const cancelTrade = atomic(function cancelTrade(
  w: World,
  controller: string,
  id: bigint,
  now: bigint,
): void {
  drain(w, now);
  const p = active(w, controller, now);
  const t = w.trades.get(id);
  if (!t || t.accepted || (p.id !== t.seller && p.id !== t.buyer)) fail("InvalidTrade");
  const seller = w.players.get(t.seller)!;
  seller.offers = seller.offers.filter((x) => x !== id);
  w.trades.delete(id);
});

/** The buyer's deposit for a trade: ⌈price × p / 100⌉ per resource (D-19). */
export const tradeDeposit = (w: World, t: Trade) =>
  t.price.map((x) => ceilDiv(x * w.rs.config.marketDepositPercent, 100n));

/**
 * The buyer accepts, naming its building the deposit leaves (D-19). The seller is checked again
 * (active); both buildings are settled (B-06), then the goods leave the offer's building and the
 * deposit the buyer's. The window starts, and neither party can start a vacation until it closes
 * (D-18).
 */
export const acceptTrade = atomic(function acceptTrade(
  w: World,
  controller: string,
  id: bigint,
  depositBuilding: bigint,
  now: bigint,
): void {
  drain(w, now);
  const p = active(w, controller, now);
  const t = w.trades.get(id);
  if (!t || t.accepted || p.id !== t.buyer) fail("InvalidTrade");
  const seller = w.players.get(t.seller)!;
  if (onVacation(seller, now) || suspended(seller, now)) fail("InvalidTrade");
  gate(w, p, now);
  if (p.purchases.length >= w.rs.config.maxPurchases) fail("TooManyTrades");
  const from = w.buildings.get(t.from);
  const dep = w.buildings.get(depositBuilding);
  if (!from || from.owner !== t.seller || !dep || dep.owner !== p.id) fail("NotOwner");
  settle(w, from, now);
  settle(w, dep, now);
  const goods = t.price.map((_, r) => (r === t.sold ? t.quantity : 0n));
  const deposit = tradeDeposit(w, t);
  if (!affordable(w, from, amounts(w, goods)) || !affordable(w, dep, amounts(w, deposit)))
    fail("CannotAfford");
  pay(w, from, amounts(w, goods));
  pay(w, dep, amounts(w, deposit));
  t.accepted = true;
  t.closesAt = now + w.rs.config.marketWindowSeconds;
  t.deposit = deposit;
  p.purchases.push(t.id);
  for (const q of [seller, p]) if (t.closesAt > q.tradeLockUntil) q.tradeLockUntil = t.closesAt;
});

/**
 * A transport naming a trade reached the coordinate chosen at send, at `at` (D-26): the buyer's
 * cargo counts per resource and up to what remains unpaid, whatever happened to the building; the
 * rest was a plain transport. A send arrives within the window (sendMission checks it).
 */
export function settleTrade(w: World, m: Mission, at: bigint): void {
  const t = w.trades.get(m.trade);
  if (!t || !t.accepted || m.owner !== t.buyer || at > t.closesAt) return;
  t.paid = t.paid.map((p, r) => p + min(m.cargo[r]!, t.price[r]! - p));
}

/**
 * The most `player` can withdraw into `to`, per resource: its share left and the building's free
 * capacity, over the building as given (settled by the caller: the action does it itself, the
 * client projects the world first).
 */
export function withdrawable(w: World, t: Trade, player: bigint, to: Building, now: bigint) {
  const scale = stockScale(w.rs);
  const cap = capacities(w, to);
  return shareLeft(t, player, now).map((x, r) => {
    const free = cap[r]! > to.stock[r]! ? (cap[r]! - to.stock[r]!) / scale : 0n;
    return min(x, free);
  });
}

/**
 * A party moves part of its shares into a building of its own, settled first (B-06). Each amount
 * must fit in its share left and in the building's free capacity, and at least one must be > 0.
 * The counterparty's state does not matter.
 */
export const withdrawTrade = atomic(function withdrawTrade(
  w: World,
  controller: string,
  id: bigint,
  toId: bigint,
  amount: bigint[],
  now: bigint,
): void {
  drain(w, now);
  const [p, to] = owned(w, controller, toId, now);
  const t = w.trades.get(id);
  if (!t || !t.accepted || (p.id !== t.seller && p.id !== t.buyer)) fail("InvalidTrade");
  settle(w, to, now);
  if (amount.length !== w.rs.resources.length || amount.some((x) => x < 0n))
    fail("InvalidWithdrawal");
  const max = withdrawable(w, t, p.id, to, now);
  if (amount.some((x, r) => x > max[r]!) || amount.every((x) => x === 0n))
    fail("InvalidWithdrawal");
  credit(w, to, amounts(w, amount));
  if (p.id === t.buyer) t.buyerTook = t.buyerTook.map((x, r) => x + amount[r]!);
  else t.sellerTook = t.sellerTook.map((x, r) => x + amount[r]!);
});
