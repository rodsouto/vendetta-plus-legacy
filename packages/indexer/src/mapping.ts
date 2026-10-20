// Ranking (B-18): players' points and buildings, and families with the sum of their members' points.
// Market history (B-11): every trade with its terms, progress, claims and debt.
import { BigInt } from "@graphprotocol/graph-ts";
import {
  BuildingAbandoned,
  BuildingOccupied,
  DebtPaid,
  DebtRegistered,
  FamilyChanged,
  FamilyCreated,
  FamilyDissolved,
  PlayerRegistered,
  PointsChanged,
  TradeAccepted,
  TradeCancelled,
  TradeClaimed,
  TradeOffered,
  TradeSettled,
} from "../generated/Game/IGameEvents";
import { Claim, Family, Player, Trade } from "../generated/schema";

function player(id: BigInt): Player {
  let p = Player.load(id.toString());
  if (p == null) {
    p = new Player(id.toString());
    p.centipoints = BigInt.zero();
    p.buildings = 0;
    p.completedTrades = 0;
    p.defaults = 0;
    p.openDebts = 0;
  }
  return p;
}

/** The player's family while it is alive (a dissolved family keeps no members). */
function familyOf(p: Player): Family | null {
  const id = p.family;
  if (id == null) return null;
  const f = Family.load(id!);
  return f != null && f.alive ? f : null;
}

function join(p: Player, id: string): void {
  if (p.family == id) return;
  leave(p);
  const f = Family.load(id)!;
  f.centipoints = f.centipoints.plus(p.centipoints);
  f.save();
  p.family = id;
}

function leave(p: Player): void {
  const f = familyOf(p);
  if (f != null) {
    f.centipoints = f.centipoints.minus(p.centipoints);
    f.save();
  }
  p.family = null;
}

export function handlePlayerRegistered(e: PlayerRegistered): void {
  const p = player(e.params.player);
  p.buildings = 1;
  p.save();
}

export function handlePointsChanged(e: PointsChanged): void {
  const p = player(e.params.player);
  const f = familyOf(p);
  if (f != null) {
    f.centipoints = f.centipoints.minus(p.centipoints).plus(e.params.centipoints);
    f.save();
  }
  p.centipoints = e.params.centipoints;
  p.save();
}

export function handleBuildingOccupied(e: BuildingOccupied): void {
  const p = player(e.params.player);
  p.buildings = p.buildings + 1;
  p.save();
}

export function handleBuildingAbandoned(e: BuildingAbandoned): void {
  const p = player(e.params.player);
  p.buildings = p.buildings - 1;
  p.save();
}

export function handleFamilyCreated(e: FamilyCreated): void {
  const f = new Family(e.params.family.toString());
  f.tag = e.params.tag;
  f.name = e.params.name;
  f.alive = true;
  f.members = 1;
  f.centipoints = BigInt.zero();
  f.save();
  const p = player(e.params.capo);
  join(p, f.id);
  p.save();
}

/** rank 0 = left or expelled; otherwise joined or promoted (FamilyChanged in the contract). */
export function handleFamilyChanged(e: FamilyChanged): void {
  const p = player(e.params.player);
  const id = e.params.family.toString();
  if (e.params.rank == 0) {
    if (p.family == id) {
      leave(p);
      const f = Family.load(id)!;
      f.members = f.members - 1;
      f.save();
    }
  } else if (p.family != id) {
    join(p, id);
    const f = Family.load(id)!;
    f.members = f.members + 1;
    f.save();
  }
  p.save();
}

export function handleFamilyDissolved(e: FamilyDissolved): void {
  const f = Family.load(e.params.family.toString())!;
  f.alive = false;
  f.members = 0;
  f.centipoints = BigInt.zero();
  f.save();
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
