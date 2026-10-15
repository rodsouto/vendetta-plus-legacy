// Market (09-social.md#market, D-19, B-11): private offers at fixed exchange rates, delivered with
// ordinary transport missions that name the trade. No escrow. Mirrors contracts/src/core/Market.sol.
import { active, atomic } from "./common.js";
import { drain } from "./missions.js";
import { fail } from "./errors.js";
import type { Mission, Building, Player, Trade, World } from "./state.js";

const converted = (w: World) =>
  w.rs.resources.indexOf(w.rs.buildings.find((b) => b.production?.consumes)!.production!.consumes!);

const window = (w: World, t: Trade) => t.acceptedAt + w.rs.config.marketWindowSeconds;
const complete = (t: Trade) =>
  t.delivered === t.quantity && t.paid.every((p, i) => p === t.price[i]);

/** Pending, or accepted, inside the 10-day window and not complete: counts against the cap. */
export const tradeOpen = (w: World, t: Trade, now: bigint) =>
  !t.accepted || (now <= window(w, t) && !complete(t));

/** Can `player` send a transport for this trade now? */
export function tradeOpenFor(w: World, id: bigint, player: bigint, now: bigint): boolean {
  const t = w.trades.get(id);
  return !!t && t.accepted && now <= window(w, t) && (player === t.seller || player === t.buyer);
}

/**
 * The price must match one of the fixed rates exactly (value of 1 dollar in each resource):
 * quantity / rate[sold] = Σ price[r] / rate[r], compared over the common denominator Π rate.
 */
function fairPrice(w: World, sold: number, quantity: bigint, price: bigint[]): boolean {
  return w.rs.config.marketRates.some((rate) => {
    if (rate[sold] === 0n) return false;
    const den = rate.reduce((d, x) => (x > 0n ? d * x : d), 1n);
    let value = 0n;
    for (let r = 0; r < price.length; r++) {
      if (price[r] === 0n) continue;
      if (rate[r] === 0n) return false;
      value += (price[r]! * den) / rate[r]!;
    }
    return (quantity * den) / rate[sold]! === value;
  });
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
  const alc = converted(w);
  if (!w.players.has(buyer) || buyer === p.id) fail("InvalidOffer");
  if (sold < 0 || sold >= w.rs.resources.length || sold === alc) fail("InvalidOffer");
  if (quantity < 1n || price.length !== w.rs.resources.length) fail("InvalidOffer");
  if (price.some((x) => x < 0n) || price[alc]! !== 0n || price[sold]! !== 0n) fail("InvalidOffer");
  if (!fairPrice(w, sold, quantity, price)) fail("InvalidOffer");
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

/** The buyer accepts: the 10-day delivery window starts. */
export const acceptTrade = atomic(function acceptTrade(
  w: World,
  controller: string,
  id: bigint,
  now: bigint,
): void {
  drain(w, now);
  const p = active(w, controller, now);
  const t = w.trades.get(id);
  if (!t || t.accepted || p.id !== t.buyer) fail("InvalidTrade");
  t.accepted = true;
  t.acceptedAt = now;
});

/**
 * A transport naming a trade arrived at `target` at `t` (resources already credited). Seller to
 * buyer: exactly one resource, the one sold, not over what remains. Buyer to seller: no resource
 * over what remains of the price. Otherwise it was just a transport. The converted resource is ignored.
 */
export function settleTrade(w: World, m: Mission, target: Building, at: bigint): void {
  const tr = w.trades.get(m.trade);
  if (!tr || !tr.accepted || at > window(w, tr)) return;
  const alc = converted(w);
  const owner: Player["id"] = m.owner;
  const to = target.owner;
  const sent = m.cargo.map((x, i) => (i === alc ? 0n : x));
  if (owner === tr.seller && to === tr.buyer) {
    const kinds = sent.filter((x) => x > 0n).length;
    if (kinds === 1 && sent[tr.sold]! > 0n && sent[tr.sold]! <= tr.quantity - tr.delivered)
      tr.delivered += sent[tr.sold]!;
  } else if (owner === tr.buyer && to === tr.seller) {
    if (sent.every((x, i) => x <= tr.price[i]! - tr.paid[i]!))
      tr.paid = tr.paid.map((p, i) => p + sent[i]!);
  }
}
