# Codex reply to the market escrow proposal

**Verdict: agree with changes.**

Date: 2026-10-22  
In reply to: [market-escrow-proposal.md](market-escrow-proposal.md)  
Scope: design review against the current tree at `0f2dd74`; no game code or specification changed.

The asymmetric escrow removes the hardest part of the current market: deciding and collecting a changing obligation between two parties that have already received resources. I found no unconditional P1 exploit in the proposed allocation formulas. Before implementation, make accepted terms immutable for existing trades, state the withdrawal authorization explicitly, and correct the description of the rounded penalty.

I accept the owner's decisions on seller escrow, payment transports, five days, the 10% deposit parameter, manual withdrawals without expiry, the vacation lock, and the accepted vault and teleport effects. The accumulation limit is valid **per `playerId`**, not per person or coalition. That distinction matters under B-13.

## Findings, ranked by severity

### F1 — P2, conditional: live configuration must not reprice already withdrawn goods

The proposal values progress at the matched rate "as today." Today, `MarketRules.debt` and `tradeDebt` read the current rate vector using the stored rate index; `window` also reads the current window constant. The ledger's `recomputed-owed-underflow` warning therefore has an analogue in the new design. B-17 permits upgrades before freezing, and an escrow without expiry can survive several upgrades.

**Failing sequence, if an upgrade changes the meaning of an existing rate index:**

1. Offer 9 weapons for 10 ammunition and 1 dollar. This uniquely matches 3:5:1.
2. The buyer pays 1 dollar. `earned = floor(9 × 1 / 3) = 3`; it withdraws 3 weapons.
3. An upgrade replaces that rate entry with 2:4:1. Recomputing the old trade now gives `earned = floor(9 × 1 / 3.5) = 2`.
4. Subtracting the buyer's previous withdrawal underflows. At finalization, the seller's recomputed allocation becomes 7 weapons, although only 6 remain in escrow. An implementation either blocks withdrawals or credits more goods than were deposited.

Changing the live window can likewise turn a final trade back into an open one after the seller has withdrawn its remainder. Recomputing the deposit from a changed percentage can create unfunded claims.

**Proposed fix:** preserve the accepted deadline, the actual deposit amounts, and an immutable interpretation of the matched rate. Store the needed valuation weights, or reference an immutable version of the rate table. Never reuse an old version/index for different terms. A stored deposit must mean the original deposited amount; withdrawal counters are separate. Any upgrade affecting these terms must preserve existing entitlements or migrate them explicitly.

This is conditional upgrade safety, not evidence of a present exploit or a claim that a populated proxy is currently deployed. An explicit promise that upgrades preserve old trade terms also resolves it; snapshots/versioning make that promise enforceable in the representation.

### F2 — P2, specification gap: withdrawals must retain the caller's activity checks

The withdrawal section lists party membership, building ownership, entitlement and capacity checks, but does not explicitly require the caller to be active. B-14 and D-18 still apply. Existing `Market.claim` uses `Access.active` for the acting creditor; it deliberately does not require the debtor to be active.

**Failing sequence if the listed checks are treated as exhaustive:**

1. A buyer earns goods in escrow and is subsequently suspended.
2. While suspended, it calls `withdrawTrade` into a distant building it owns.
3. The listed checks pass, allowing resource relocation through a market action during the suspension. The same omission permits withdrawals during vacation after the trade lock expires.

**Proposed fix:** resolve the acting party through `Access.active`/`Access.owned`, mirrored by the simulator's `active`/`owned`, and put the new entry point behind the normal B-07 drain. Check only the caller's activity at withdrawal. A suspended or vacationing counterparty must not prevent an active player from taking its own allocation.

If the normal action convention was already intended, this is a clarification, not a new exception to negotiate. A suspended player's entitlement remains reserved until it can act again; "always collectible" means funded, not exempt from sanctions.

### F3 — P3: the penalty can substantially exceed "10% of what was left unpaid"

The formula conserves the deposit, but its two ceilings make that economic description inaccurate for small trades. Favoring the seller does not establish a percentage bound on the unpaid value.

**Failing sequence:**

1. Use the valid 9-weapons offer for 10 ammunition and 1 dollar above.
2. At 10%, the deposit is 1 ammunition plus 1 dollar, worth 1.2 dollars at 3:5:1.
3. The buyer pays 9 ammunition and 1 dollar, leaving just 1 ammunition unpaid, worth 0.2 dollars.
4. At expiry, each nonzero deposit component is multiplied by `0.2 / 3` and rounded up. The seller gets the entire deposit: a penalty worth 1.2 dollars, **600% of the unpaid value**. The buyer earned 8 weapons; the seller also recovers the remaining weapon.

**Proposed fix:** keep the decided parameter and seller-favoring rounding, but describe the rule as "the unpaid fraction of the rounded deposit, rounded up per resource." Show the exact deposit and projected forfeiture in the UI, and include this case in the vectors. Do not advertise an exact 10% charge on the unpaid balance.

This does not let the seller take more than the agreed deposit. It is a disclosure/rounding issue, not an inflation exploit. Changing the formula is unnecessary if this integer behavior is accepted.

## Answers to the five questions

### 1. Can either party take more than its share or block the other party's withdrawal?

Under fixed accepted terms and the stated checks, I found no such sequence. The useful accounting invariant is cumulative entitlement, separate from remaining escrow and previous withdrawals:

```text
P = exact price value; V = exact credited payment value
E = floor(quantity × V / P)

buyer goods available = E − buyer goods already withdrawn
seller goods available, once final = quantity − E − seller goods already withdrawn

seller deposit allocation[r] = ceil(originalDeposit[r] × (P − V) / P)
buyer deposit allocation[r]  = originalDeposit[r] − seller deposit allocation[r]
deposit available           = party allocation − that party's previous withdrawals
```

For a valid offer, `P > 0`. Per-resource payment caps give `0 ≤ V ≤ P`, so `E` is monotone and never exceeds `quantity`. Goods allocations sum to `quantity`; deposit allocations sum to the original deposit. Full payment gives exactly all goods and all deposit to the buyer. With no payment, all goods and all deposit belong to the seller at expiry.

Compute ceilings on **total allocations**, then subtract cumulative withdrawals. Never apply the ceiling separately to each withdrawal or recompute a party's share from the shrinking escrow balance. Keep `E` as total earned goods, not goods still available after withdrawal. Use `uint256` intermediates before multiplying stored `uint64` amounts.

Withdrawals must depend on neither the other party's withdrawal nor its building capacity, activity or willingness to act. Apply the final-balance prohibition only to offering/accepting; applying it to withdrawal would prevent the very action needed to clear it. Capacity checks must use the exact B-27 stock: `floor((capacity − stock) / STOCK_SCALE)`, rather than subtracting separately rounded visible stocks.

An active player's full buildings can delay its own withdrawal and hence its next trade. That is the decided capacity rule, not counterparty control. Abandonment of the original source/deposit building must not destroy the accepted escrow; withdrawal chooses any currently owned destination.

### 2. Does the final-balance rule bound accumulation? What about alts and B-26?

**It bounds retained records per player: up to 10 seller entries and 10 buyer entries.** Each trade has fixed quantities, so escrow does not itself accumulate production. It does not enforce a building storage cap on the aggregate escrow value, nor a bound on a person's accounts.

The cap proof needs the retention rule as written: an accepted trade stays indexed while nonfinal even if a party currently has nothing withdrawable, and a final trade stays until that party's entire remaining allocation is zero. In particular, a buyer who withdraws all earned goods before expiry still needs its index entry because its deposit allocation is unresolved. Check the buyer cap before inserting; scan both caller lists on both actions. These are bounded scans of at most 20 entries.

There is a concrete coalition accumulation sequence:

1. Seller S sells 300 weapons to fresh allied player A for 100 dollars; A deposits 10 dollars and pays the full 100.
2. A leaves its 300 weapons and refunded 10-dollar entitlement in escrow indefinitely.
3. S has no final entitlement left in that trade, so S can repeat with fresh allied player B, then C, and so on.

Only each buyer is blocked. S continues trading, while the coalition retains more completed trades without withdrawing the old goods. This is allowed by B-13 and the owner's chosen mechanics; it is not a breach of the per-player cap. The proposal should describe that scope accurately. No rule keyed only by `playerId` can impose a per-person bound while unrestricted additional players remain allowed.

B-26 does not reset the limit: transferring the account changes controllers, not `playerId`, and does not merge accounts. Both lists, withdrawal counters and escrow rights must remain attached to the player. Cycling controllers/accounts can accumulate a coalition of funded players, but that is the same multi-account case. Direct self-trades remain rejected; trades with an alt use a different player and are permitted.

One nuance: the gate blocks the caller's `offerTrade`/`acceptTrade`, not acceptance by someone else of its previously pending offers. Those acceptances do not grow the seller list, so they do not invalidate the cap proof. Do not describe the gate as forbidding all new trade participation while blocked.

### 3. Is the arrival deadline check correct with recall, processing order and hidden missions?

**Yes.** Keep the existing inclusive delivery boundary: a transport may arrive at `deadline`, but not after it. For consistency with current B-11 and `Account.startVacation`, expiry means `now > deadline`; full payment may finalize earlier. Check arrival using the inclusion timestamp and actual computed duration, not the client's estimate.

In current `Missions.send`, `_checkSend` runs before `_charge`, which computes `plan.duration`. The new deadline check therefore needs to run once the duration is known. Reverting after charging still rolls the whole transaction back, though validation before charging is also possible with a small refactor.

Retain these behaviors:

- Only the accepted trade's buyer can name it, on a public transport to a building owned by its seller at send. Remove the current seller branch of `openFor`, as well as its post-window debt branch.
- A recalled outbound shipment earns no payment. Its returning mission may retain the trade ID, but `_arriveHome` must continue to bypass trade settlement. Recall itself drains first, so it cannot undo an already due delivery.
- Queue catch-up credits a transport at its scheduled arrival time even if processed days later. Every action that reads final allocations or scans final balances must drain first; otherwise a due payment could be omitted and the seller's remainder released too early. `Backlog` must revert the action until separate advances catch up.
- Hidden missions cannot acquire a trade ID through reveal, so parking/reveal delays cannot move a named payment past its deadline.
- Preserve D-26: count the original cargo up to the unpaid price, even if storage overflow destroys it or the target was abandoned/reoccupied. Do not add a new counterparty check at arrival.

Full payment can finalize while surplus shipments remain in flight. Those shipments still deliver normally; their counted payment is zero because the price is already paid. Pruning an index entry must not mean deleting an accepted trade needed by those shipments. The present code already distinguishes pruning a list from deleting a cancelled pending offer.

### 4. Is settling the seller's building at acceptance safe?

**Yes.** B-06 expressly allows settlement on touch; current `Market._collect` already settles another player's building. It is not an action by that player or a way to choose a different production result.

The order should be: normal global drain; validate the trade, parties and current building ownership; settle the two designated buildings to `now`; check both stocks; atomically debit goods and deposit and record acceptance/locks. Room/research queue payments that start during local settlement take precedence over the escrow debit. Missing stock must revert everything, including settlement, in Solidity and in the simulator's `atomic` wrapper.

Use the building's actual owner during local settlement. Do not call the caller-owned helper on the seller's building. No extra global drain is needed between the two local settlements. A hidden attack still parked at acceptance resolves later under B-22's existing rules; the possibility of escrowing goods before that attack resolves is part of the accepted vault effect.

Two designated buildings have bounded local queues. Keep list scans limited to trade accounting; do not settle the source buildings of every indexed trade. Acceptance becomes more expensive than today's timestamp-only acceptance, so measure it with full premium queues and a worst-case drain. Nothing here inherently requires an unbounded loop or a building-count scan.

### 5. Does this worsen anything in the code or audit ledger? Does it simplify the market?

**It simplifies the settlement state machine substantially**, while adding withdrawal accounting and a second bounded index. I would take that tradeoff. It removes cross-player debt collection and transport permissions, rather than merely moving those checks elsewhere.

The ledger records an older scan at `3117f70`, with both findings and leads; it is not a list of bugs all still present in this tree. For example, current acceptance already checks seller activity/debt, offer quantities already have width checks, and D-26 deliberately defines how lost cargo counts.

| Ledger item                                                                                                         | Effect of this proposal                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `double-restitution-race`                                                                                           | Removes the competing claim/repayment paths. Surplus ordinary payments can still arrive, as the retained delivery rule permits.                                                              |
| `last-mover-default-penalty`                                                                                        | Removes the comparison of two independently delivered sides that changes which party owes restitution. Goods release follows credited payment instead.                                       |
| `unregistrable-debt`, `creditor-alt-escape`, `unregistered-creditor-blocked`, `debt-registration-blocks-open-trade` | Removes the debt registration and creditor permission machinery responsible for these cases.                                                                                                 |
| `trade-transport-arrives-after-window`                                                                              | Addressed by the arrival check, with the boundary and queue qualifications in answer 3.                                                                                                      |
| `recomputed-owed-underflow`                                                                                         | Not automatically eliminated as a class: changing accepted valuation terms can invalidate withdrawals already made. See F1.                                                                  |
| `clamped-credit-counted`, `trade-shipment-lost-on-abandon`, `delivery-intercept-by-reoccupation`                    | Preserve D-26 intentionally. These must not be “fixed” by counting only received stock or bouncing the payment.                                                                              |
| `stale-offer-penalty`                                                                                               | Pending offers still have no expiry. They now authorize an eventual stock debit, rather than just a delivery obligation. Preserve cancellation, source ownership and seller activity checks. |

A pending offer can be accepted after its source restocks, without another seller action. That follows from the chosen pending-offer semantics; make the source and outstanding authorization visible. I am not proposing an expiry as a prerequisite for this design.

Keep the vacation timestamp lock unchanged, including after early completion, as decided. Remove only the debt restriction from `startVacation`; retain mission and cooldown checks. Neither suspension nor vacation should change final allocations or extend the payment deadline.

The implementation also reaches beyond the two market files: `Game` entry points/views, storage, the loader that reconstructs the simulator world, differential scenarios, and indexer event consumers currently depend on `delivered`, `registered`, `returned` or debt state. `TradeSettled` currently carries removed fields. Replacing debt screens alone is insufficient; preserve payment/completion history and expose the new deposit and withdrawal accounting consistently with B-18/B-20.

For a simpler implementation, use one shared pure entitlement calculation and one retention predicate per role. Finality can remain derived from payment totals and the fixed deadline; it needs no expiry worker or mandatory `finalizeTrade` transaction. Neither accepted trade history nor the other party's unwithdrawn balance belongs in a player's retention decision once its own allocation is empty.

## Validation for this reply

I checked all requested sources and used exact arithmetic loaded from `game_config.yaml` to enumerate 411 uniquely matched offers and 20,173 payment states, with allowed price components from 0 through 12. The checks covered goods/deposit conservation, monotonic earned goods, full-payment identities, and cumulative withdrawal decomposition. They also reproduced F1's repricing example and F3's rounding example.

Those are formula checks, not tests of an escrow implementation that does not yet exist. Implementation regressions should cover partial withdrawals followed by more payment; independent party withdrawals; both role caps and final-balance gates; caller/counterparty sanctions; exact-deadline delivery and delayed queue catch-up; recall; D-26 overflow/abandonment; and B-26 transfer with retained balances. This reply adds only this review file.
