# Proposal: seller escrow and buyer deposit for the market (D-19, B-11)

Date: 2026-10-22
Author: Claude, with decisions taken by the project owner
Status: agreed between the owner and Claude; asking Codex for a second opinion before the spec is written
Scope: a design change to the market. No code or spec has been changed yet.

Please challenge this design: exploits it opens, rules that contradict other parts of the spec
(B-07 queue, B-09 caps, B-14 sanctions, B-22 hidden missions, B-26 account transfer, D-10, D-18,
D-26), rounding, bounded-gas concerns, and whether it really simplifies `contracts/src/core/Market.sol`
and `packages/rules/src/sim/market.ts`. Say where a simpler rule exists. Points marked
**decided** were chosen by the owner; challenge them only with a concrete problem.

## Today (D-19, B-11)

No escrow. Both parties deliver by transport during a 10-day window. When it closes, the party
further behind is a debtor: restitution in kind plus a 10 % penalty (`default_penalty_percent`),
claimed by the creditor from the debtor's buildings; a registered debt restricts offers,
acceptances, vacation and transports (bounces at arrival). See `docs/spec/decisions.md#default`
and `docs/spec/blockchain.md#b-11--market--keep`.

This is the part of the code with most audit findings (`.solidity-auditor/memory.tsv`, rows
`market*`): `double-restitution-race`, `last-mover-default-penalty`, `unregistrable-debt`,
`creditor-alt-escape`, `unregistered-creditor-blocked`, `debt-registration-blocks-open-trade`,
`recomputed-owed-underflow`, `trade-transport-arrives-after-window`.

## Proposal

### Seller side: escrow (decided)

- `offerTrade(buyer, fromBuilding, sold, quantity, price)`: as today, plus the seller's building
  the goods will come from (owned by the seller at offer). Nothing is held while pending; cancel
  is unchanged.
- `acceptTrade(trade, depositBuilding)`: settles both buildings (B-06), then takes the whole
  `quantity` of `sold` from `fromBuilding` into the trade. It reverts if `fromBuilding` no longer
  belongs to the seller or lacks the stock. Seller rechecks as today (active, not on vacation nor
  suspended).
- The seller never sends a transport for a trade.

### Buyer side: payment by transport (decided)

- The buyer pays with ordinary public transports naming the trade, to any building of the seller,
  as today; each counts per resource up to what remains, the rest is a plain transport (D-26 and
  D-10 unchanged: the seller's buildings receive the cargo directly).
- Window: **5 days** after acceptance (`delivery_window_days: 10 → 5`) **(decided)**.
- New, to fix `trade-transport-arrives-after-window`: `sendMission` naming a trade reverts
  (`InvalidTrade`) if its arrival is after the window closes. Trade transports are public (B-22),
  so the arrival is known at send. With this, `paid` is final when the window closes.

### Buyer deposit (decided: X = 10 %)

- At acceptance, `deposit[r] = ⌈price[r] × p / 100⌉` (p = `default_penalty_percent`, kept with this
  new meaning) is taken from `depositBuilding` (owned by the buyer) into the trade, after settling
  it. Reverts if the stock is missing.
- It does not count as payment.
- When the trade is final (window closed, or fully paid earlier):
  - fully paid: the buyer gets the whole deposit back;
  - otherwise the seller gets `⌈deposit[r] × (priceValue − paidValue) / priceValue⌉` and the buyer the
    rest. Values as today: `Σ amount[r] / rate[r]` at the matched rate, over the common denominator.
  So the penalty is "p % of what the buyer left unpaid", always collectible, no debt.

### Withdrawals: manual, no expiry (decided)

`withdrawTrade(trade, toBuilding, amount[RESOURCES])`, caller is the seller or the buyer,
`toBuilding` is its own and is settled first. Each `amount[r]` ≤ what that party can still take
and ≤ the free capacity of `toBuilding`; at least one > 0. Resources move directly (no mission),
as many times as needed, and **never expire**.

- Buyer, at any time after acceptance: goods earned so far,
  `earned = ⌊quantity × paidValue / priceValue⌋` (full payment → exactly `quantity`), minus what it
  already took; once final, also its share of the deposit.
- Seller, once final: the unsold rest `quantity − earned` and its share of the deposit.
- Rounding favours the seller (the party that put everything up front).

The owner's argument for no expiry: honest players withdraw anyway, and an expiry does not stop a
rolling vault (withdraw and re-escrow with an ally). Claude's objection was unbounded accumulation
outside the storage cap (D-10). Resolved by the next rule.

### No new trades with something left in a final trade (decided)

A player cannot `offerTrade` nor `acceptTrade` while it has anything left to withdraw from a
**final** trade (its own part only: the seller is never blocked by a buyer who does not withdraw,
and vice versa). This bounds what can sit in escrow per player.

To check it in bounded gas (B-09), each player keeps:
- as seller, the existing `offers` list (cap 10): a trade stays in it while pending, open, or final
  with something left for the seller;
- as buyer, a new list of accepted trades (cap 10, checked at `acceptTrade`), kept while open or
  final with something left for the buyer. Today a buyer can accept any number of trades.

Both lists are pruned on `offerTrade` / `acceptTrade` like `offers` is today, and both actions
scan both lists of the caller. Since a list cannot grow while it holds a final trade with
something left, each stays ≤ 10.

### Unchanged / kept

- Vacation lock (D-18) for **both** parties until the window closes **(decided)**: a seller on
  vacation could not be targeted by the buyer's payments.
- Offers name the buyer; fixed rates; integer rate matching; `InvalidOffer` rules.
- B-26: trades, escrow and deposits move with the account.

### Removed

`Debt`, `debt()`, `inDefault`, `register`, `addReturned`, `registerDebt`, `claimTrade`,
`transportAllowed` and its two checks in `Missions.sol` (send and the arrival bounce),
`Player.debts`, `owes`, `Trade.delivered/registered/returned`, `InDebt`, the debt check in
`Account.sol`, the post-window branches of `openFor` and `settle`, seller trade transports,
events `TradeClaimed`, `DebtRegistered`, `DebtPaid` (new: `TradeWithdrawn(trade, player, amount)`),
the B-23 "dodge restitution" pushing case, indexer debt entities, web debt screens.

## Accepted costs (decided, not findings)

- Escrowed goods and deposits are in no building, so they cannot be looted (a vault). Accepted:
  bounded by the rule above, comparable to a fleet save.
- A buyer who accepts and never pays freezes the seller's goods for 5 days; the deposit
  compensates part of it.
- The seller's goods move by "teleport" (no transport on the map).

## Questions for Codex

1. Does any sequence let a party take more than its share, or block the other party's withdrawal?
2. Is the "nothing left in a final trade" rule enough to bound accumulation, or is there a way
   around it (several accounts, account transfer B-26, trades with oneself via a second account)?
3. Is rejecting a trade transport whose arrival is after the window correct given recall,
   B-07 processing order and B-22 (hidden missions cannot name a trade)?
4. Settling another player's buildings at `acceptTrade` (the seller's `fromBuilding`): any
   problem with B-06 or the mission queue drain (B-07)?
5. Anything in the current code or the audit ledger that this makes worse.
