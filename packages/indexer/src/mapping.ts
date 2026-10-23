// Market history (B-11, B-18): every trade with its terms, payments and withdrawals.
import { BigInt } from "@graphprotocol/graph-ts";
import {
  TradeAccepted,
  TradeCancelled,
  TradeOffered,
  TradePaid,
  TradeWithdrawn,
} from "../generated/Game/IGameEvents";
import { Payment, Player, Trade, Withdrawal } from "../generated/schema";

function player(id: BigInt): Player {
  let p = Player.load(id.toString());
  if (p == null) {
    p = new Player(id.toString());
    p.completedTrades = 0;
  }
  return p;
}

// ------------------------------------------------------------------ market (D-19, B-11)

function zeros(n: i32): BigInt[] {
  const out = new Array<BigInt>(n);
  for (let i = 0; i < n; i++) out[i] = BigInt.zero();
  return out;
}

/** Fully paid. */
function complete(t: Trade): boolean {
  const price = t.price;
  const paid = t.paid;
  for (let i = 0; i < price.length; i++) {
    if (!paid[i].equals(price[i])) return false;
  }
  return true;
}

export function handleTradeOffered(e: TradeOffered): void {
  // Trade.seller and Trade.buyer are required relations: both players must exist from the offer on.
  player(e.params.seller).save();
  player(e.params.buyer).save();
  const t = new Trade(e.params.trade.toString());
  t.seller = e.params.seller.toString();
  t.buyer = e.params.buyer.toString();
  t.status = "PENDING";
  t.from = e.params.from;
  t.sold = e.params.sold;
  t.quantity = e.params.quantity;
  t.price = e.params.price;
  t.rate = e.params.rate;
  t.offeredAt = e.block.timestamp;
  t.deposit = zeros(e.params.price.length);
  t.paid = zeros(e.params.price.length);
  t.complete = false;
  t.save();
}

export function handleTradeAccepted(e: TradeAccepted): void {
  const t = Trade.load(e.params.trade.toString())!;
  t.status = "ACCEPTED";
  t.acceptedAt = e.block.timestamp;
  t.closesAt = e.params.closesAt;
  t.deposit = e.params.deposit;
  t.save();
}

/** The contract deletes a cancelled offer; the history keeps it. */
export function handleTradeCancelled(e: TradeCancelled): void {
  const t = Trade.load(e.params.trade.toString())!;
  t.status = "CANCELLED";
  t.save();
}

/** A payment naming the trade counted: the event carries the new totals; each one is kept. */
export function handleTradePaid(e: TradePaid): void {
  const t = Trade.load(e.params.trade.toString())!;
  const before = t.paid;
  const after = e.params.paid;
  const amount = new Array<BigInt>(after.length);
  for (let i = 0; i < after.length; i++) amount[i] = after[i].minus(before[i]);
  const x = new Payment(e.transaction.hash.toHexString() + "-" + e.logIndex.toString());
  x.trade = t.id;
  x.amount = amount;
  x.paid = after;
  x.timestamp = e.block.timestamp;
  x.block = e.block.number;
  x.save();
  t.paid = after;
  if (!t.complete && complete(t)) {
    t.complete = true;
    const seller = player(BigInt.fromString(t.seller));
    seller.completedTrades = seller.completedTrades + 1;
    seller.save();
    const buyer = player(BigInt.fromString(t.buyer));
    buyer.completedTrades = buyer.completedTrades + 1;
    buyer.save();
  }
  t.save();
}

/** A party moved part of its shares into one of its buildings. */
export function handleTradeWithdrawn(e: TradeWithdrawn): void {
  const x = new Withdrawal(e.transaction.hash.toHexString() + "-" + e.logIndex.toString());
  x.trade = e.params.trade.toString();
  x.player = e.params.player.toString();
  x.amount = e.params.amount;
  x.timestamp = e.block.timestamp;
  x.block = e.block.number;
  x.save();
}
