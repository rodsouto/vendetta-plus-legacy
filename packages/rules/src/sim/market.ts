// Market (09-social.md#market, D-19, B-11): private offers at fixed exchange rates, delivered with
// ordinary transport missions that name the trade. No escrow: a party that does not deliver owes
// restitution plus a penalty once the window closes, which the creditor claims on-chain.
// Mirrors contracts/src/core/Market.sol.
import { active, atomic, onVacation, suspended } from "./common.js";
import { drain } from "./missions.js";
import { fail } from "./errors.js";
import { capacities, credit, pay, settle } from "./settle.js";
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

/** When the 10-day delivery window of an accepted trade closes. */
export const tradeWindow = (w: World, t: Trade) => t.acceptedAt + w.rs.config.marketWindowSeconds;
const complete = (t: Trade) =>
  t.delivered === t.quantity && t.paid.every((p, i) => p === t.price[i]);

/** Pending, or accepted, inside the 10-day window and not complete: counts against the cap. */
export const tradeOpen = (w: World, t: Trade, now: bigint) =>
  !t.accepted || (now <= tradeWindow(w, t) && !complete(t));

/** Registered debts `debtor` still owes `creditor` (B-11): O(1), like the contract's mapping. */
export const owesKey = (debtor: bigint, creditor: bigint) => `${debtor}:${creditor}`;
export const owes = (w: World, debtor: bigint, creditor: bigint) =>
  w.owes.get(owesKey(debtor, creditor)) ?? 0;

/**
 * B-11: a player with a registered debt only transports to its own buildings and its creditors':
 * those registered, or the creditor of the defaulted trade the transport names, registered or
 * not. `targetOwner` is undefined for an empty slot, which is not allowed either. `at`: the time
 * of the check (the send, or the arrival).
 */
export function transportAllowed(
  w: World,
  p: Player,
  targetOwner: bigint | undefined,
  trade: bigint,
  at: bigint,
): boolean {
  if (p.debts === 0) return true;
  if (targetOwner === undefined) return false;
  if (targetOwner === p.id || owes(w, p.id, targetOwner) > 0) return true;
  if (trade === 0n) return false;
  const t = w.trades.get(trade);
  if (!t || !t.accepted || at <= tradeWindow(w, t)) return false;
  const d = tradeDebt(w, t);
  return inDefault(d) && d.debtor === p.id && d.creditor === targetOwner;
}

export interface TradeDebt {
  debtor: bigint; // 0 = no debt
  creditor: bigint;
  owed: bigint[]; // per resource, penalty included
  remaining: bigint[]; // owed − returned
}

const noDebt = (w: World): TradeDebt => ({
  debtor: 0n,
  creditor: 0n,
  owed: w.rs.resources.map(() => 0n),
  remaining: w.rs.resources.map(() => 0n),
});

/**
 * The debt of a trade (D-19, Default): a pure function of `delivered`, `paid`, the rate the price
 * matched and the penalty, minus `returned`. Values are in dollars × Π rate (the common
 * denominator), so every comparison is exact. Meaningful once the window has closed, when
 * `delivered` and `paid` no longer change; the caller checks that.
 */
export function tradeDebt(w: World, t: Trade): TradeDebt {
  const rate = w.rs.config.marketRates[t.rate]!;
  const den = rate.reduce((d, x) => (x > 0n ? d * x : d), 1n);
  const unit = rate.map((x) => (x > 0n ? den / x : 0n)); // value of one unit of each resource
  const priceValue = t.price.reduce((s, x, r) => s + x * unit[r]!, 0n);
  const paidValue = t.paid.reduce((s, x, r) => s + x * unit[r]!, 0n);
  // Progress compared over the common denominator: delivered / quantity vs paidValue / priceValue.
  const sellerSide = t.delivered * priceValue;
  const buyerSide = paidValue * t.quantity;
  if (sellerSide === buyerSide) return noDebt(w);
  const d = noDebt(w);
  if (sellerSide > buyerSide) {
    // The buyer paid for less than it received: it gives back the rest of the sold resource.
    d.debtor = t.buyer;
    d.creditor = t.seller;
    d.owed[t.sold] = t.delivered - (t.quantity * paidValue) / priceValue;
  } else {
    // The seller delivered less than it was paid for: the excess value goes back in proportion
    // to what was paid, rounded up.
    d.debtor = t.seller;
    d.creditor = t.buyer;
    const excess = buyerSide - sellerSide;
    d.owed = t.paid.map((x) => (x > 0n ? ceilDiv(x * excess, buyerSide) : 0n));
  }
  const p = w.rs.config.marketPenaltyPercent;
  d.owed = d.owed.map((x) => ceilDiv(x * (100n + p), 100n));
  d.remaining = d.owed.map((x, r) => x - t.returned[r]!);
  return d;
}

/** Something is still owed. */
export const inDefault = (d: TradeDebt) => d.debtor !== 0n && d.remaining.some((x) => x > 0n);

/**
 * Can `player` send a transport naming this trade to a building of `targetOwner` now? Inside the
 * window, each party to the other; after it, the debtor to the creditor while something remains
 * (voluntary payment). The counterparty is checked here, at send (D-26).
 */
export function tradeOpenFor(
  w: World,
  id: bigint,
  player: bigint,
  targetOwner: bigint | undefined,
  now: bigint,
): boolean {
  const t = w.trades.get(id);
  if (!t || !t.accepted) return false;
  if (now <= tradeWindow(w, t)) {
    return (
      (player === t.seller && targetOwner === t.buyer) ||
      (player === t.buyer && targetOwner === t.seller)
    );
  }
  const d = tradeDebt(w, t);
  return inDefault(d) && player === d.debtor && targetOwner === d.creditor;
}

/** The counterparty `player` would ship to for this trade now, or undefined (for the client). */
export function tradeCounterparty(w: World, id: bigint, player: bigint, now: bigint) {
  const t = w.trades.get(id);
  if (!t || !t.accepted) return undefined;
  if (now <= tradeWindow(w, t)) return player === t.seller ? t.buyer : t.seller;
  const d = tradeDebt(w, t);
  return inDefault(d) && player === d.debtor ? d.creditor : undefined;
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

export const offerTrade = atomic(function offerTrade(
  w: World,
  controller: string,
  buyer: bigint,
  sold: number,
  quantity: bigint,
  price: bigint[],
  now: bigint,
): bigint {
  drain(w, now);
  const p = active(w, controller, now);
  if (p.debts > 0) fail("InDebt");
  const alc = converted(w);
  if (!w.players.has(buyer) || buyer === p.id) fail("InvalidOffer");
  if (sold < 0 || sold >= w.rs.resources.length || sold === alc) fail("InvalidOffer");
  if (quantity < 1n || quantity > UINT64_MAX || price.length !== w.rs.resources.length)
    fail("InvalidOffer");
  if (price.some((x) => x < 0n) || price[alc]! !== 0n || price[sold]! !== 0n) fail("InvalidOffer");
  if (price.some((x) => x > UINT64_MAX)) fail("InvalidOffer"); // stored as uint64
  const rate = matchRate(w, sold, quantity, price);
  if (rate < 0) fail("InvalidOffer");
  p.offers = p.offers.filter((id) => tradeOpen(w, w.trades.get(id)!, now));
  if (p.offers.length >= w.rs.config.maxOpenOffers) fail("TooManyOffers");
  const t: Trade = {
    id: w.nextTrade++,
    seller: p.id,
    buyer,
    sold,
    quantity,
    price: [...price],
    delivered: 0n,
    paid: price.map(() => 0n),
    accepted: false,
    acceptedAt: 0n,
    rate,
    registered: false,
    returned: price.map(() => 0n),
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

/**
 * The buyer accepts: the 10-day delivery window starts, and neither party can start a vacation
 * until it closes (D-18). The seller is checked again, as when it offered: active and free of
 * registered debt.
 */
export const acceptTrade = atomic(function acceptTrade(
  w: World,
  controller: string,
  id: bigint,
  now: bigint,
): void {
  drain(w, now);
  const p = active(w, controller, now);
  if (p.debts > 0) fail("InDebt");
  const t = w.trades.get(id);
  if (!t || t.accepted || p.id !== t.buyer) fail("InvalidTrade");
  const seller = w.players.get(t.seller)!;
  if (onVacation(seller, now) || suspended(seller, now) || seller.debts > 0) fail("InvalidTrade");
  t.accepted = true;
  t.acceptedAt = now;
  const lock = tradeWindow(w, t);
  for (const q of [seller, p]) if (lock > q.tradeLockUntil) q.tradeLockUntil = lock;
});

/**
 * `amount` of each resource reaches the creditor as restitution. Once a registered debt is fully
 * returned, it stops counting (B-11). Returns whether anything was added.
 */
function addReturned(w: World, t: Trade, d: TradeDebt, amount: bigint[]): boolean {
  if (amount.every((x) => x === 0n)) return false;
  t.returned = t.returned.map((x, r) => x + amount[r]!);
  if (t.registered && d.remaining.every((x, r) => x === amount[r])) {
    w.players.get(d.debtor)!.debts -= 1;
    const key = owesKey(d.debtor, d.creditor);
    const n = w.owes.get(key)! - 1;
    if (n === 0) w.owes.delete(key);
    else w.owes.set(key, n);
  }
  return true;
}

/** Registers the debt of a defaulted trade (B-11): the debtor's restrictions start. Idempotent. */
function register(w: World, t: Trade, d: TradeDebt): void {
  if (t.registered) return;
  t.registered = true;
  w.players.get(d.debtor)!.debts += 1;
  const key = owesKey(d.debtor, d.creditor);
  w.owes.set(key, (w.owes.get(key) ?? 0) + 1);
}

/**
 * A transport naming a trade reached the coordinate chosen at send, at `at` (D-26): the cargo
 * counts per resource and up to what remains, whatever happened to the building; the rest was a
 * plain transport. Inside the window: the seller's adds to `delivered`, the buyer's to `paid`.
 * After it: the debtor's adds to `returned`.
 */
export function settleTrade(w: World, m: Mission, at: bigint): void {
  const t = w.trades.get(m.trade);
  if (!t || !t.accepted) return;
  if (at <= tradeWindow(w, t)) {
    if (m.owner === t.seller) {
      t.delivered += min(m.cargo[t.sold]!, t.quantity - t.delivered);
    } else if (m.owner === t.buyer) {
      t.paid = t.paid.map((p, r) => p + min(m.cargo[r]!, t.price[r]! - p));
    }
    return;
  }
  const d = tradeDebt(w, t);
  if (!inDefault(d) || m.owner !== d.debtor) return;
  addReturned(
    w,
    t,
    d,
    d.remaining.map((x, r) => min(x, m.cargo[r]!)),
  );
}

/**
 * The most a creditor can claim from `from` into `to`, per resource: what remains of the debt,
 * the debtor's stock and the creditor's free capacity, over the buildings as given (settled by the
 * caller: the action does it itself, the client projects the world first). All zeros when there is
 * nothing to claim or the buildings are not the debtor's and the creditor's.
 */
export function claimable(w: World, t: Trade, from: Building, to: Building): bigint[] {
  const d = tradeDebt(w, t);
  if (!inDefault(d) || from.owner !== d.debtor || to.owner !== d.creditor) {
    return d.remaining.map(() => 0n);
  }
  const scale = stockScale(w.rs);
  const cap = capacities(w, to);
  return d.remaining.map((x, r) => {
    const free = cap[r]! > to.stock[r]! ? (cap[r]! - to.stock[r]!) / scale : 0n;
    return min(min(x, from.stock[r]! / scale), free);
  });
}

/**
 * The creditor registers the debt of a defaulted trade without collecting anything (B-11), so
 * the debtor's restrictions start even while nothing can be claimed. Idempotent.
 */
export const registerDebt = atomic(function registerDebt(
  w: World,
  controller: string,
  id: bigint,
  now: bigint,
): void {
  drain(w, now);
  const p = active(w, controller, now);
  const t = w.trades.get(id);
  if (!t || !t.accepted || now <= tradeWindow(w, t)) fail("InvalidTrade");
  const d = tradeDebt(w, t);
  if (!inDefault(d) || d.creditor !== p.id) fail("InvalidTrade");
  register(w, t, d);
});

/**
 * The creditor collects part of a debt directly from a building of the debtor into one of its
 * own, both settled first (B-06); works whether the debtor is active, suspended or on vacation.
 * Each amount must fit in what remains, in the debtor's stock and in the creditor's free
 * capacity, and at least one must be > 0. The first claim registers the debt (B-11).
 */
export const claimTrade = atomic(function claimTrade(
  w: World,
  controller: string,
  id: bigint,
  fromId: bigint,
  toId: bigint,
  amount: bigint[],
  now: bigint,
): void {
  drain(w, now);
  const p = active(w, controller, now);
  const t = w.trades.get(id);
  if (!t || !t.accepted || now <= tradeWindow(w, t)) fail("InvalidTrade");
  const d = tradeDebt(w, t);
  if (!inDefault(d) || d.creditor !== p.id) fail("InvalidTrade");
  const from = w.buildings.get(fromId);
  const to = w.buildings.get(toId);
  if (!from || from.owner !== d.debtor || !to || to.owner !== p.id) fail("NotOwner");
  settle(w, from, now);
  settle(w, to, now);
  if (amount.length !== w.rs.resources.length || amount.some((x) => x < 0n)) fail("InvalidClaim");
  const max = claimable(w, t, from, to);
  if (amount.some((x, r) => x > max[r]!) || amount.every((x) => x === 0n)) fail("InvalidClaim");
  const moved = Object.fromEntries(w.rs.resources.map((r, i) => [r, amount[i]!]));
  pay(w, from, moved);
  credit(w, to, moved);
  register(w, t, d);
  addReturned(w, t, d, amount);
});
