# Design Decisions (legacy → target)

The rest of the spec documents **legacy behavior** exactly as the PHP code implements it. This file
records, for every point where the new implementation must differ (or where we explicitly chose to
keep a legacy quirk), the decision and the **target rule**. When a chapter and this file disagree,
**this file wins for the new implementation**.

Status: **Keep** = replicate legacy exactly · **Fix** = legacy is a bug, target rule replaces it ·
**New** = rule did not exist in legacy · **Open** = not decided yet.

For the fully on-chain EVM implementation, [blockchain.md](blockchain.md) adds B-xx decisions on top
of these; when they disagree, blockchain.md wins for that implementation.

| ID | Topic | Status | Summary |
|----|-------|--------|---------|
| D-01 | Spec structure | — | Legacy in chapters, target rules here |
| D-02 | Combat engine | Keep | Modificadores only; Mercenarios → appendix |
| D-03 | Defense ×10 | Keep | All troops, per ruleset (10 Vendetta, 1 Space4k) |
| D-04 | Target selection | Fix | Best modifier, then largest stack, then canonical order |
| D-05 | Tactical Expert bonuses | Fix | Duplicate `firearms_training` counted once |
| D-06 | Loot apportionment | Fix | Never exceed capacity; largest-remainder rounding |
| D-07 | Alcohol → dollar economy | Fix | Continuous flow model; no negative dollars |
| D-08 | Time model | New | Event-driven simulation with exact timestamps |
| D-09 | Spring Gun / Hidden Mines | Keep | No gameplay effect; they only give points |
| D-10 | Storage overflow | Keep | Excess above capacity is lost |
| D-11 | Deferred queue payment | Keep | Items 2..n paid at start; dropped if unaffordable |
| D-12 | Resource accumulation | Fix | Exact accumulator instead of `ceil` per tick |
| D-13 | Requirement validation | New | Server validates against current (completed) levels |
| D-14 | Level-0 timing rooms | New | Training/research require the timing room ≥ 1 |
| D-15 | Loss ratio precision | Keep | Rounded to 3 decimals |
| D-16 | Double fight per round | Keep | Each pairing fights in both phases |
| D-17 | Honor > 100 buildings | Fix | Cap honor at 8 before every branch |
| D-18 | Vacation | Keep + Fix | Legacy rules; cooldown enforced server-side |
| D-19 | Market | Keep + Fix + New | Legacy offers with bugs fixed; the seller's goods and a buyer deposit held from acceptance, shares withdrawn |
| D-20 | Families & wars | Keep + Fix | Legacy mechanics with authorization fixed |
| D-21 | Space4k | — | Second ruleset: same mechanics, own data |
| D-22 | Server-side validation | Fix | Every action validated on the server |
| D-23 | Queue re-timing on level-up | Fix | Re-time with the NEW level |
| D-24 | Points | Fix | Derived from state, never drift |
| D-25 | Zero-power fight | New | No casualties instead of division by zero |
| D-26 | Delivery at the door | New | What the receiver cannot store or no longer owns is its loss; the shipment counts |
| D-27 | Honor power floor | Fix | Never below 1 % of power, however many buildings |

---

## D-01 — Spec structure

Chapters describe legacy behavior with source citations, so that the legacy game can be reproduced
and verified with [data/test_vectors.yaml](data/test_vectors.yaml). Target rules live here.

## D-02 — Combat engine

Only **Modificadores** (legacy server `s1`) is specified for the new game. The Mercenarios engine
(servers `old`, `test`) is kept for reference in [appendix/mercenarios-engine.md](appendix/mercenarios-engine.md).

## D-03 — Defense ×10 for every troop — Keep

Legacy multiplies `_defensa` by 10 for **all** troops (attack and defense) when the game is Vendetta
and the engine is Modificadores (`Mob_Tropa_Abstract::__construct`). This is what s1 was balanced
around. Data keeps the raw class value; the multiplier is `rules.troop_defense_multiplier` in the
ruleset file: **10** in `vendetta.yaml`, **1** in `space4k.yaml` (Space4k classes already carry
large defense values and the legacy constructor skips them).

## D-04 — Target selection — Fix

Legacy `_getRival` returns the **last** enemy type (in iteration order) whose modifier is > 1, else
the enemy type with the most units (first one on ties).

**Target rule:** among enemy types with units remaining, pick the one with the **highest modifier**
for the acting troop if any modifier is > 1; ties → most remaining units; ties → earliest in canonical
troop order ([04-troops.md](04-troops.md)). Otherwise pick the type with the most remaining units;
ties → earliest in canonical order.

## D-05 — Tactical Expert duplicate bonus — Fix

Legacy `Tactico` lists `Tiro` twice in both bonus arrays, so `firearms_training` counts double in the
sum. **Target:** count each research once (`close_combat`, `firearms_training`,
`psychological_training`). `vendetta.yaml` already contains the deduplicated list.

## D-06 — Loot apportionment — Fix

Legacy loot is `min(round(U[r] / T × capacity), U[r])` per resource. Because the shares are
proportional, no resource caps out unless capacity ≥ T; the only real defect is that the **sum of
rounded shares can exceed capacity** (e.g. 51 looted with capacity 50). The intended redistribution
code in `getRobo` is dead.

**Target rule:**
1. If the defender has any surviving troop → no loot.
2. `capacity` = Σ surviving attacker units × effective capacity. If `capacity ≥ T`, loot all `U`.
3. Otherwise apportion `capacity` proportionally to `U[r]` using the **largest-remainder method**:
   `base[r] = floor(capacity × U[r] / T)`; distribute the remaining units one at a time to the
   resources with the largest fractional remainders; ties in order weapons, ammunition, dollar, alcohol.
4. Clamp each to `U[r]`; if clamping frees capacity, repeat step 3 over the resources still below
   `U[r]` until capacity or stock is exhausted.

The result never exceeds capacity. Reference implementation: `lootTarget()` in
`scripts/generate_test_vectors.php`; expected values: `loot.cases[].loot_target`.

## D-07 — Alcohol → dollar economy — Fix

Legacy computes hourly rates once per update from `alcohol stock + brewery rate` and has three defects:
the Bar can produce **negative** dollars when available alcohol is < 3; when the Bar is starved the
alcohol stock is not consumed at all; and the starved Smuggle uses the remaining *hourly production*
instead of the remaining alcohol ([01-resources.md](01-resources.md#legacy-algorithm)).

**Target rule (continuous flow):** let `P` = brewery rate, `Cb`/`Cs` = full consumption and `Rb`/`Rs` =
full dollar rate of Bar/Smuggle (all per hour).

- **Stock S > 0, or P ≥ Cb + Cs:** both run at full rate. `dS/dt = P − Cb − Cs`; dollars `Rb + Rs`.
- **S = 0 and P < Cb + Cs:** only the brewery flow is available, `A = P`. The Bar takes
  `ab = min(Cb, A)` and makes `Rb` if `ab = Cb`, else `max(0, (ab − 3) / 7)`. The Smuggle takes
  `as = A − ab` and makes `Rs` if `as ≥ Cs`, else `max(0, (as − 1) / 4)`. S stays 0.
- The moment S reaches 0 (`S / (Cb + Cs − P)` hours) is a scheduled event (D-08).
- Alcohol and dollar are capped by storage as usual (D-10).

At full consumption the partial formulas give exactly `Rb`/`Rs`, so the rate is continuous.

## D-08 — Time model — New

Legacy advances state lazily on page load / cron, in a fixed order (resources → research → rooms →
missions → troops), which causes artifacts: production ignores when a production room finished, a
mission can resolve before a building upgrade that finished earlier, and so on.

**Target rule:** the world is a deterministic **discrete-event simulation**. Events (queue item
start/finish, mission arrival/return, alcohol stock depletion, storage cap reached) are processed
in timestamp order; ties → by event creation order. Between events, resource stocks are
integrated with the constant rates in effect (D-07, D-10, D-12). Any read of the state at time `t` must
give the same answer no matter when or how often it is computed.

## D-09 — Spring Gun & Hidden Mines — Keep

Legacy: both are buildable, cost resources and give points, but have **no effect** anywhere. Keep
them exactly like that: no gameplay effect, only points. The same applies to their Space4k
counterparts (`planetary_shield`, `fusion_powerplant`).

## D-10 — Storage overflow — Keep

Any addition (production, transport arrival, loot on return, market delivery) is clamped to the
storage capacity of that resource; the excess is lost.

## D-11 — Deferred payment for room/research queues — Keep

The first item is paid when queued. Items 2..n are paid **when they start**; if the building cannot
afford one at that moment it is **removed** from the queue (the player gets a notice) and the next one
is tried. Troop batches are paid in full when queued.

## D-12 — Resource accumulation — Fix

Legacy adds `ceil(rate / 3600 × Δt)` on every update, so frequent page loads inflate production.

**Target rule:** stocks are kept as exact fixed-point values (at least 6 decimal places, or rational
units of 1/3600 per hour). Integration between events is exact. The visible stock and every
affordability check use `floor(stock)`; spending subtracts exact integers.

## D-13 — Requirement validation — New

Legacy never checks requirements on the server (only the UI hides locked items).

**Target rule:** when queuing a room upgrade, research or troop batch, the requirements must be met by
**current completed levels** (not counting queued items). Because levels never decrease, they are not
re-checked when the item starts.

## D-14 — Level-0 timing rooms — New

Legacy divides by the level of `boot_camp`/`security`/`mob_school`, which is a division by zero at 0
(`boss_office` uses `max(1, level)`).

**Target rule:** attack troops require `boot_camp ≥ 1`, defense troops `security ≥ 1`, and research
`mob_school ≥ 1` in the building where they are queued. `boss_office` is always ≥ 1 (new buildings start
at 1).

## D-15 — Loss ratio precision — Keep

`PPA` and `PPD` are rounded to 3 decimals (PHP `number_format`) before multiplying by the unit count.

## D-16 — Double fight per round — Keep

In each round every attacker stack fights its chosen target (attacker phase) and then every defender
stack fights its chosen target (defender phase). A pairing can therefore fight twice per round, and
both sides take casualties in every fight. This is core s1 balance.

## D-17 — Honor above 100 buildings — Fix

Legacy caps honor at 8 only after the `> 100 buildings` branch, so honor ≥ 9 with more than 100
buildings reads an undefined table cell. **Target:** `honor = min(honor, 8)` first.

## D-18 — Vacation — Keep + Fix

Keep the legacy rules ([09-social.md](09-social.md#vacation-mode)): 15 days, account locked, cannot
be targeted by new missions, production and queues keep running, missions already travelling resolve.
**Fix:** enforce the 7-day cooldown on the server, and compute it from the actual end time even if the
player never logged in after an automatic expiry.

## D-19 — Market — Keep + Fix + New

Keep the legacy offers: fixed exchange rates, an offer names its buyer, the buyer pays with
transport missions, only pending offers can be cancelled (by either party). **Fixes:**
- The transport mission stores the **trade id** chosen by the player, and settlement applies to that trade only.
- Validate quantities > 0, compare rates with integer arithmetic, and reject trading a resource for itself.
- Neither party can delete an accepted trade.
- A payment counts for its trade **up to what remains** of each resource; the rest of the cargo
  (other resources, the excess) is a plain transport the recipient keeps. Legacy ignored the whole
  shipment if any part did not fit, which loses shipments to a race when several are in flight.

**New: escrow for the seller, deposit for the buyer** (legacy: no escrow, both parties deliver by
transport, and a party that does not deliver faces nothing).

- **The seller's goods.** The offer names the seller's building the goods come from. Acceptance
  takes the whole quantity from that building into the trade, and fails if the building is no
  longer the seller's or lacks the stock. Nothing is held while the offer is pending. The seller
  never sends a transport.
- **The buyer's deposit.** Acceptance also takes `deposit[r] = ⌈price[r] × p / 100⌉` from a
  building of the buyer chosen at acceptance (`market.deposit_percent`, 10 %,
  [game_config.yaml](data/game_config.yaml)), and fails if the stock is missing. The deposit is not
  payment.
- **Payment.** The buyer pays with transports to any building of the seller, which must arrive
  within the **5-day window** after acceptance (`market.delivery_window_days`). A transport that
  would arrive later cannot be sent.
- **Final.** The trade is final when the window closes, or earlier when the price is fully paid.
- **Shares.** A value is `Σ amount[r] / rate[r]` at the rate the price matched; `P` is the value of
  the price and `V` the value paid so far.
  - Goods: the buyer earns `E = ⌊quantity × V / P⌋` as it pays; once final, the seller gets
    `quantity − E` back.
  - Deposit, once final: the seller gets `⌈deposit[r] × (P − V) / P⌉` and the buyer the rest. Full
    payment returns it all to the buyer; no payment gives it all to the seller.

  Shares are computed on the totals, and roundings favour the seller. The seller's deposit share is
  the unpaid fraction of the rounded deposit, so on a tiny trade it can be worth more than p % of
  what was left unpaid; at usual sizes (thousands of units and more) the difference is negligible.
- **Withdrawal.** Each party moves its shares into a building of its own, directly (no mission), up
  to that building's free capacity, as many times as needed. The buyer withdraws goods as soon as
  it earns them, everything else once final. Shares never expire.
- **No new trades with a share left in a final trade.** A player cannot offer or accept while it
  has anything left to withdraw from a final trade. Only its own shares count: a party that does
  not withdraw never blocks the other.
- **Terms never change once set:** the rate the price matched (at the offer), the window end and
  the deposit (at acceptance). A later change of the configuration or the contract (B-17) does not
  change a trade.
- **Vacation:** nobody can start a vacation while party to an accepted trade whose window has not
  closed (D-18): a buyer on vacation could not pay, a seller on vacation could not be paid.

Nobody can owe anything: the seller's goods are in the trade, the buyer only gets what it paid for,
and what not paying costs is already held.

Why the seller's side only: the buyer's payment often needs several transports from different
buildings (cargo depends on the troops sent, [07-missions.md](07-missions.md#salary-and-cargo)), while
the seller's goods are one resource from one building. Holding the seller's side rules out default;
the deposit makes not paying cost something. Before this, both sides delivered by transport and a
defaulter owed restitution plus a penalty that the creditor collected: a debt between two parties
that had both received resources, with registration, claims and restrictions on the debtor.

Accepted: goods and deposits in a trade are in no building, so they cannot be looted and count
against no storage capacity. The rule above bounds this per player (B-11: 10 trades as seller, 10 as
buyer); several accounts get several bounds, as with any per-account limit (B-13). Why shares never
expire: honest players withdraw anyway, and an expiry would not stop a rolling vault (withdraw and
put the goods in a new trade with an ally); the accumulation it would bound, the rule above bounds
too.

## D-20 — Families & wars — Keep + Fix

Keep the legacy mechanics (no member limit, war is bookkeeping only). **Fixes:** every permission is
enforced on the server; a player belongs to at most one family (founding or accepting checks it); the
Capo cannot be kicked; a surrender or draw can only be accepted if one exists for that war; a war can
only be declared on another existing family not already at war with ours; ending a war only affects
that war.

## D-21 — Space4k — Second ruleset

Space4k shares every **mechanic** with Vendetta but has its **own balance**: every cost, duration,
stat, point value and requirement differs, and the brewery-equivalent (`drilling_rig`) has a
production factor of 10 instead of 50. It is therefore a separate **ruleset**
([data/space4k.yaml](data/space4k.yaml)), not a reskin. The engine never names entities directly; it
reads the ruleset's `roles` (build-speed room, research-speed room, training rooms, cargo research,
honor research, occupation troop, spy troop) and the `production`/`storage` blocks of each room.
Each server loads one ruleset (`game_config.ruleset`). See [10-space4k-variant.md](10-space4k-variant.md).

## D-22 — Server-side validation — Fix

Legacy relies on the UI for many checks. The target validates on the server, at minimum: ownership of
the acting building, requirements (D-13), affordability, queue limits, troop availability for
missions, cargo ≤ capacity − salary, vacation status of the target, and all family/market permissions.

## D-23 — Queue re-timing on level-up — Fix

When `boot_camp` or `security` finishes, legacy re-times that troop queue **before** incrementing the
level, so it uses the old level (a no-op). It intended to recompute every batch's duration, starting
from the start time of the batch in progress. **Target:** when a timing room (`boss_office`,
`mob_school`, `boot_camp`, `security`) levels up, items that **have not started** are re-timed with the
new level; the item in progress keeps its finish time.

## D-24 — Points derived from state — Fix

Legacy maintains points incrementally and they drift (e.g. the consumed `occupation_troop` and troops lost
when returning to a lost building are never subtracted until a full recompute).

**Target:** points are a pure function of the current state, using the definition in
[08-progression.md](08-progression.md#points): rooms and research by level, troops at home and on
missions by unit count.

## D-25 — Loss ratios with zero power — New

Legacy `_getPorcentPerdidas` divides by zero when both stacks of a fight have zero total power
(`PAA + PDA = PAD + PDD = 0`). **Target:** `PPA = PPD = 0` (no casualties). Unreachable with current
data (every troop has attack > 0 or defense > 0), but it defines the rule for future rulesets.

## D-26 — Delivery at the door — New

A transport delivers at the coordinate chosen when it left. Having room and keeping the building
is the **receiver's responsibility**: what does not fit is lost (D-10), and so is cargo that lands
on an abandoned slot or on a building that changed hands. A transport that names a market trade
(D-19) **counts in full** for that trade when it reaches the coordinate, per resource and up to
what remains, whatever happened to the building meanwhile; the counterparty check moves to the
moment of sending (the target must belong to the seller). Trade transports are always public (B-22: hidden missions cannot name a trade), so the
receiver sees the arrival time and can make room; the client warns the sender when the target has
no room and the receiver when an incoming payment exceeds its free capacity.

Why not "cargo that does not fit comes back": it moves the risk to the sender, who would leave the
trade unpaid and lose part of its deposit whenever the receiver keeps its warehouse full, and it
needs partial cargo accounting in every delivery. The legacy rule is simpler, and the receiver
controls it.

## D-27 — Honor power floor — Fix

`calcPoderAtaque` rounds to zero above 200 buildings at honor 0 and 1 (`round(100 × table[100][h]
/ B)`), so one unit beats any garrison. **Target:** the power percentage is never below
`honor.min_power_percent` (1): `max(1, round(…))`. D-25 (no casualties when both sides have zero
power) is about troops with zero stats and is unaffected.
