// Market history (B-11, B-18): every trade with its terms, progress, claims and debt.
import { BigInt } from "@graphprotocol/graph-ts";
import {
  DebtPaid,
  DebtRegistered,
  TradeAccepted,
  TradeCancelled,
  TradeClaimed,
  TradeOffered,
  TradeSettled,
} from "../generated/Game/IGameEvents";
import { Claim, Player, Trade } from "../generated/schema";

function player(id: BigInt): Player {
  let p = Player.load(id.toString());
  if (p == null) {
    p = new Player(id.toString());
    p.completedTrades = 0;
    p.defaults = 0;
    p.openDebts = 0;
  }
  return p;
}

// ------------------------------------------------------------------ market (D-19, B-11)

function zeros(n: i32): BigInt[] {
  const out = new Array<BigInt>(n);
  for (let i = 0; i < n; i++) out[i] = BigInt.zero();
  return out;
}

/** Fully delivered and fully paid. */
function complete(t: Trade): boolean {
  if (!t.delivered.equals(t.quantity)) return false;
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
  t.sold = e.params.sold;
  t.quantity = e.params.quantity;
  t.price = e.params.price;
  t.rate = e.params.rate;
  t.offeredAt = e.block.timestamp;
  t.delivered = BigInt.zero();
  t.paid = zeros(e.params.price.length);
  t.returned = zeros(e.params.price.length);
  t.complete = false;
  t.registered = false;
  t.debtPaid = false;
  t.save();
}

export function handleTradeAccepted(e: TradeAccepted): void {
  const t = Trade.load(e.params.trade.toString())!;
  t.status = "ACCEPTED";
  t.acceptedAt = e.block.timestamp;
  t.save();
}

/** The contract deletes a cancelled offer; the history keeps it. */
export function handleTradeCancelled(e: TradeCancelled): void {
  const t = Trade.load(e.params.trade.toString())!;
  t.status = "CANCELLED";
  t.save();
}

/** A transport naming the trade counted: the event carries the new totals. */
export function handleTradeSettled(e: TradeSettled): void {
  const t = Trade.load(e.params.trade.toString())!;
  t.delivered = e.params.delivered;
  t.paid = e.params.paid;
  t.returned = e.params.returned;
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

/** The creditor collected `amount` directly from a building of the debtor. */
export function handleTradeClaimed(e: TradeClaimed): void {
  const t = Trade.load(e.params.trade.toString())!;
  const c = new Claim(e.transaction.hash.toHexString() + "-" + e.logIndex.toString());
  c.trade = t.id;
  c.amount = e.params.amount;
  c.timestamp = e.block.timestamp;
  c.block = e.block.number;
  c.save();
  const returned = t.returned;
  const amount = e.params.amount;
  for (let i = 0; i < returned.length; i++) {
    returned[i] = returned[i].plus(amount[i]);
  }
  t.returned = returned;
  t.save();
}

/** First claim on a defaulted trade: the debt now restricts the debtor (B-11). */
export function handleDebtRegistered(e: DebtRegistered): void {
  const t = Trade.load(e.params.trade.toString())!;
  t.registered = true;
  t.debtor = e.params.debtor.toString();
  t.creditor = e.params.creditor.toString();
  t.save();
  const debtor = player(e.params.debtor);
  debtor.defaults = debtor.defaults + 1;
  debtor.openDebts = debtor.openDebts + 1;
  debtor.save();
}

export function handleDebtPaid(e: DebtPaid): void {
  const t = Trade.load(e.params.trade.toString())!;
  t.debtPaid = true;
  t.save();
  const debtor = player(BigInt.fromString(t.debtor!));
  debtor.openDebts = debtor.openDebts - 1;
  debtor.save();
}
