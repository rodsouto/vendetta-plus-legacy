# Blockchain Implementation (EVM)

This file records the decisions needed to implement the target game ([decisions.md](decisions.md))
**fully on-chain** on an EVM network. It sits on top of decisions.md: when a B-xx decision and a
D-xx decision disagree, **this file wins for the on-chain implementation**.

Status: **Adapt** = changes a legacy or target rule so it fits the EVM · **New** = rule that only
exists on-chain · **Open** = not decided yet · **v2** = deliberately out of v1 scope.

## Goals and v1 scope

Why on-chain, all at once:

- **Trustless rules:** the contracts are the server. No operator can cheat, roll back or shut the
  world down (once frozen, B-17).
- **Persistent world:** the game outlives any company or server.
- **Asset ownership:** players own their state. Tokenization is postponed (B-04), but the design
  must not block it.
- **Technical experiment.**

v1 = the complete target game (resources, rooms, research, troops, missions, combat, market,
families, wars, vacation) with **all state and logic on-chain**, playable without the user knowing
which network it runs on. Messaging, chat and moderation are off-chain (B-10).

## Summary

| ID | Topic | Status | Summary |
|----|-------|--------|---------|
| B-01 | Network | New | Arbitrum One public L2, no own chain; code network-agnostic |
| B-02 | Language | New | Solidity; combat as an isolated library; no Stylus |
| B-03 | Integer math | Adapt | Every formula in exact integer arithmetic, no fixed point; 0 deviations from the vectors |
| B-04 | No tokens in v1 | New | Resources, troops and buildings live inside the contracts |
| B-05 | Public state | Adapt | All state is visible to everyone; `spy` / `espionage` unchanged |
| B-06 | Lazy settlement | Adapt | D-08 in two levels: local per building on touch, global mission queue; no keepers |
| B-07 | Global mission order | New | All missions resolve in global arrival order (heap); local events stay per building |
| B-08 | Chunked settlement | New | `advance(building, maxEvents)`; one event always fits in a block |
| B-09 | Hard caps | Adapt | Queue, mission and offer limits, configurable |
| B-10 | Off-chain social | Adapt | Messaging, chat, moderation off-chain |
| B-11 | Market | Keep | D-19 as is: no escrow, trust; non-delivery can be taken to Kleros |
| B-12 | Starting coordinate | Keep | Player chooses any free coordinate; no randomness needed |
| B-13 | Multi-accounts and bots | Keep | Everything allowed in v1 |
| B-14 | Sanctions module | New | `suspend(player, until)` by an `arbiter` role |
| B-15 | Accounts | New | Smart account, one passkey per device, recovery, session keys |
| B-16 | Gas | New | Low sponsored allowance; above it the player pays via credits |
| B-17 | Upgradeability | New | Proxy, no timelock, admin in a Safe; later frozen, one immutable deploy per world |
| B-18 | Events and indexer | New | Reports and notices as events; ranking in the indexer |
| B-19 | Points on-chain | Adapt | D-24 points kept incrementally on-chain |
| B-20 | Optimistic client | New | Client runs the same rules engine and projects results |
| B-21 | Parity tests | New | Foundry against the test vectors with explicit tolerances |
| B-22 | Hidden information | v2 | Hidden mission **target**, revealed by timelock encryption; FHE only as research |
| B-23 | Arbitration | v2 | Kleros v2 as `arbiter`, under a written rulebook |
| B-24 | Tokenization | v2 | One ERC-721 per **account** wrapping B-26; no per-building or per-troop tokens |
| B-25 | Premium | New | Longer queues for 30 days, paid with credits; admin can grant it to everyone |
| B-26 | Player identity | New | State keyed by `playerId`; controller address can change; accounts can be given away |
| B-27 | Exact stocks | New | Resources stored in 1/100800 units: per-hour rate ×28 = per-second increment (D-12) |
| B-28 | Alcohol depletion | New | Regime change (D-07) at the whole second `t0 + ⌈stock / net consumption⌉` |
| B-29 | Duration at start | New | Queue items compute their duration when they start (implements D-23) |

---

## B-01 — Network — New

**Arbitrum One.** No own chain or app-chain. Reasons:

- Sub-cent cost for a typical action (estimated, see [assumptions](#assumptions-to-validate)).
- Kleros v2 runs on Arbitrum One, so the future arbiter (B-23) is a direct contract call, with no
  bridge.
- The RIP-7212 P-256 precompile exists, so passkeys are cheap to verify (B-15).

Gnosis Chain was evaluated (stable gas priced in xDAI). It was rejected because Kleros there needs a
cross-chain bridge and P-256 support is unconfirmed. It stays as plan B.

The contracts must not depend on Arbitrum-specific features (no Stylus, no ArbOS precompiles in game
logic), so the world can be deployed on another EVM network. The **network is invisible to the
player**: no network names, no bridging, no "get ETH" steps in the UI.

## B-02 — Language — New

Solidity. Combat (rounds, targeting, fights, loot) is a **pure library** with no storage access:
it takes the two armies and research levels and returns casualties and loot. This keeps it testable
in isolation and replaceable (e.g. by a Stylus port) if gas measurements ever show combat dominates
cost. Today's estimate is that storage writes, not combat, dominate, and Stylus does not make
storage cheaper.

## B-03 — Integer math — Adapt

The EVM has no floating point. Formulas that use `sqrt`, fractional powers or PHP `round()`
([05-formulas.md](05-formulas.md)):

| Formula | Non-integer operation | On-chain |
|---------|-----------------------|----------|
| Troop effective stats | `sqrt(levels)`, `floor`, `round` | **Exact** integer formula (below) |
| Loss ratio | division, rounded to 3 decimals (D-15) | **Exact** integer formula (below) |
| Combat power | modifiers with one decimal, honor % | **Exact**: modifiers ×10, integer % |
| Honor % | interpolation, `round` | **Exact** (the interpolated value is a multiple of 1/5, never a tie) |
| Loot (D-06) | proportional split | **Exact** (integer by design) |
| Distance | `sqrt(dx² + dy²)`, `round` | **Exact**: `s = isqrt(N)`, plus one if `N ≥ s² + s + 1` |
| Travel time | `(…)^0.2`, `round` | **Exact** rational root (below) |
| Salary | `distance^0.8`, `floor` | **Exact** rational root (below) |
| Room / research time | division, `round` (research: twice) | **Exact**: `round(n/d) = (2n + d) / 2d` |
| Troop training time | `duration / level × quantity` (float, truncated by legacy) | **Exact**: `⌊duration × quantity / level⌋` |
| Production | `round(f × ((L+1)/2)²)`; D-07 partial flows `/7`, `/4` | **Exact**: rates kept ×28 (lcm of the converters' consumption per unit) |
| Points | per-level values with up to 2 decimals | **Exact**: centipoints (×100) |

**Exact formulas** (implemented in `contracts/src/combat/`, measured in the combat spike):

- Stats: `floor((1 + √L/10) × base) = base + ⌊isqrt(base² × L) / 10⌋` and
  `round((1 + √L/10) × base) = base + ⌊(isqrt(base² × L) + 5) / 10⌋`. Both identities are exact for
  integers, so no precision is lost.
- Power: `units × (attack + defense) × modifier×10 × pct`, an integer. Loss ratios only depend on
  the ratio of the two sides' power, so the common scale (×1000 vs legacy) does not matter.
- Loss ratios, with `A`, `D` the two sides' power: wipe branches as legacy; otherwise, if `A > D`,
  `PPA = (21D − A) / (20(D + 2A))` and `PPD = A / (A + 2D)`; else `PPA = D / (D + 2A)` and
  `PPD = (21A − D) / (20(A + 2D))`. This is the legacy formula simplified to one fraction. Rounded
  half up to thousandths: `(2000 × num + den) / (2 × den)`.

- **Rational powers:** `⌊s × (a/b)^(p/q)⌋` is the largest `k` with `kᵠ·bᵖ ≤ sᵠ·aᵖ`, found with an
  integer root and an exact check. Decimal constants in `game_config.yaml` are read as exact
  fractions (`3.3479 = 33479/10000`, `0.2 = 1/5`, `0.8 = 4/5`).
  - Travel time `round(3600·(d·3.3479/v)^(1/5))`: `⌊2x⌋` with `s = 7200`, then `(⌊2x⌋ + 1) / 2`.
  - Salary `⌊d^(4/5) × S / 2512⌋`: `⌊S·d^(4/5)⌋` with `s = S`, then integer division by 2512.
  - Solidity: `S` up to ~10¹⁰ keeps `S⁵·d⁴` inside `uint256`; larger salaries need a 512-bit check.
- Rounding is half away from zero, as PHP. All rounded values here are non-negative.
- Every vector that does not match exactly is listed here with its tolerance (`exact` or `±1`), and
  the on-chain implementation becomes the reference for that value (B-21).

Reference implementation: `packages/rules` (TypeScript, `bigint`). Solidity so far: combat, stats,
loot, honor (`contracts/src/combat/`); the other formulas move to Solidity with their modules.

**Deviation list: none.** Every vector matches exactly, in both TypeScript and Solidity where both
exist: 309 target combat vectors (every round and troop type), `troop_stats`, `loot`, `honor`,
`building_upgrade` (180), `research_upgrade` (192), `troop_training` (84), `storage`,
`distance_mission` (10 + 200 random, with travel time and salary) and the 22 `production` cases
where legacy and D-07 agree. Legacy PHP uses doubles, so a value exactly on a rounding tie could
still differ; none appears in the vectors.

## B-04 — No tokens in v1 — New

Resources, troops, research and buildings are **contract state**, not ERC-20 or NFT. They cannot be
transferred except through game mechanics (transport, market, loot). Tokenization is B-24.

## B-05 — Public state — Adapt

All on-chain state is readable by anyone: room levels, resources, troops, queues, missions in
transit. Consequences:

- The espionage side effect of attacks ([06-combat.md](06-combat.md#espionage)) gives no new
  information, since anyone can read the defender's rooms and resources.
- `spy` and `espionage` are **kept unchanged**. `espionage` still matters: it boosts the attack and
  defense of `spy` and `mercenary`. The report keeps the legacy spy rule, even though the information
  is public.

Hidden information is B-22 (v2).

## B-06 — Lazy settlement — Adapt

D-08 says the state at time `t` does not depend on when or how often it is computed. On-chain this
is implemented in two levels:

- **Local, per building, on touch.** Each building stores `lastUpdate`. Any transaction that reads or
  writes a building first brings it up to the needed time, processing its **own** events in order:
  room queue items finishing and starting (D-11), research items if it is the building where its
  owner researches, troop batches, and the alcohol regime change (B-28). Between events, stocks are
  integrated exactly (B-27). This is bounded by the queue sizes, so it always fits in one transaction.
- **Global, for missions (B-07).** Missions are the only events that connect buildings (attacks,
  returns with loot, transports, occupations that change the building count used by honor).
- **No keepers are required for correctness.** If nobody touches a building, its events wait. The
  result is the same whenever they are processed. Keepers (or the client) may advance state for
  convenience only.

## B-07 — Global mission order — New

Every mission in the world resolves in **global arrival order**, ties broken by creation order
(D-08), from an on-chain priority queue (heap) keyed by `(arrival, sequence)`.

- Before any action, missions with arrival ≤ now are processed, up to `maxEvents` per transaction
  (B-08). Each one first settles its target building **locally** up to the arrival time, then
  resolves (combat, delivery, occupation, return). If a backlog remains, the action reverts and the
  client calls `advance` until the queue is caught up.
- Why global and not per target: a mission's return depends on a battle in another building, and
  honor depends on occupations still in flight. With per-target order, settling one building would
  need a recursive resolution across buildings and players, with a work stack stored on-chain and
  unpredictable gas. The global order makes every step local and bounded. Construction, research and
  training are **not** in the global queue.
- Cost: the queue adds ~50–150k gas per mission (insert + pop) against ~1.2M for a combat. The total
  work is the same in any design; what changes is who pays: whoever acts first after a burst of
  arrivals processes them. The paymaster (B-16) and our keeper cover it.
- Possible later optimization: let a player act without draining the queue when no pending mission
  involves them.

## B-08 — Chunked settlement — New

Settling a building may involve many events (up to the B-09 caps), which could exceed the block gas
limit and lock the building forever. So:

- `advance(building, maxEvents)` processes up to `maxEvents` pending events in order and stores the
  progress.
- A player action on a building that is not fully settled **reverts**. The client calls `advance`
  until it is settled, then retries.
- **Invariant:** one single event (the worst case is one combat) always fits in a block with room to
  spare. Target: **< 3M gas per combat**. Measured: **~1.24M** for the worst case found (B-03
  spike), so the invariant holds with a 2.4× margin before storage reads and writes.

## B-09 — Hard caps — Adapt

Legacy has unlimited troop queues and open offers ([05-formulas.md](05-formulas.md#queues),
[09-social.md](09-social.md#market)). On-chain every loop must be bounded. The starting values below
are to be tuned with gas measurements and live in the `onchain` section of
[data/game_config.yaml](data/game_config.yaml):

| Limit | Start value | Why |
|-------|-------------|-----|
| Troop batches queued per building (`boot_camp` / `security`) | 1, or 5 with premium (B-25) | Bounded settle |
| Pending missions **to** one building | 32 | Bounded settle; stops griefing a victim with cheap missions |
| Outgoing missions per player | 20 | Bounded state |
| Open market offers per player | 10 | Bounded state |

Room and research queue limits from legacy are kept. The number of buildings per player stays
unlimited: each building is settled separately, so it does not affect gas per transaction.

## B-10 — Off-chain social — Adapt

Off-chain: **messaging, chat and moderation** ([09-social.md](09-social.md#messaging)), with a
separate service or a messaging protocol (e.g. XMTP), identified by account address.

On-chain because they affect rules: **families, wars, vacation and market.**

On-chain moderation does not exist: no one can ban an account. The only sanction is B-14.

## B-11 — Market — Keep

D-19 unchanged: offers at fixed rates, delivery by ordinary transport missions, **partial deliveries**
from any number of buildings, **10-day window** after acceptance, **no escrow**. Each shipment is
credited on arrival, so a party that does not deliver keeps what it received.

Why no escrow: one payment often needs several transports from different buildings (cargo depends on
the troops sent, [07-missions.md](07-missions.md#salary-and-cargo)), so a trade cannot be settled in
one step, and an escrow that holds partial deliveries would work as an unlootable vault.

Counterparty risk is part of the game, and has two answers:

- **Reputation:** every offer, acceptance and delivery emits an event. The indexer (B-18) shows each
  player's trade history (completed and not delivered).
- **Arbitration:** not delivering an accepted trade is a rule violation that anyone can take to
  Kleros (B-23). The sanction is a suspension (B-14).

## B-12 — Starting coordinate — Keep

The player picks any free coordinate, as in legacy ([08-progression.md](08-progression.md#account-lifecycle)).
Being near the centre makes attacks and transports faster and cheaper, so a land rush at launch is
expected and accepted. The map size is a per-world parameter.

There is no "random free coordinate" option, so combat and placement need **no on-chain
randomness** (no VRF).

## B-13 — Multi-accounts and bots — Keep

Everything is allowed in v1:

- The contracts are a public API, and automation is legitimate.
- Multiple accounts are not prevented, even though each new account gets the `new_player` starting
  resources ([game_config.yaml](data/game_config.yaml)) and can send them to another account.

A written rulebook (pushing and similar abuse) and arbitration come later (B-23).

## B-14 — Sanctions module — New

A `Sanctions` module exposes `suspend(player, until)` and `lift(player)`, callable only by the
`arbiter` role. In v1 the arbiter is the admin Safe (B-17); later it is a Kleros arbitrable contract
(B-23).

A suspended player:

- **cannot act:** build, research, train, send missions, trade, change family;
- **keeps producing**, and queues and missions already running complete;
- **can be attacked.** Otherwise suspension would work as free vacation, which is a reward.

## B-15 — Accounts — New

- **Smart account** per player (provider chosen in the prototype: e.g. ZeroDev, Safe, Coinbase
  Smart Wallet).
- **Passkeys as signers**, one per device. Synced passkeys (iCloud, Google) cover one ecosystem;
  adding a device from another ecosystem adds its own passkey as an extra signer. Verified with the
  P-256 precompile.
- **Recovery** by a backup signer or email-based method.
- **Session keys:** a short-lived key, limited to the game contracts, signs gameplay actions, so the
  player does not confirm every action. The passkey signs only to open a session or manage devices.

## B-16 — Gas — New

- A game **paymaster** (ERC-4337 / EIP-7702) sponsors a **low** allowance per account and day.
- Above it the player pays. The payment path is **credits bought by card** (on-ramp into the smart
  account, or a paymaster that charges credits), never "get ETH on Arbitrum".
- Credits pay for gas only. **Premium** is separate (B-25).

## B-17 — Upgradeability — New

- **v1:** contracts behind upgradeable proxies, **with no timelock**, so bugs can be fixed quickly
  while the game matures.
- **Admin = a Safe multisig** (e.g. 2-of-3), never a single key.
- **Later:** the contracts are frozen, then each world is an **immutable deploy**. A ruleset
  (`vendetta.yaml`, `space4k.yaml`) maps to one world.

Until the freeze, the "trustless rules" goal (Goals) is only partly met. This is accepted.

## B-18 — Events and indexer — New

- Battle reports, notices (delivery, occupation, trade, family) and history are **events** (logs),
  not storage.
- An **indexer** serves reports, notices and the **ranking**. Sorting players on-chain is too
  expensive. The indexer is a **Goldsky Subgraph** (The Graph format), queried by the client over
  GraphQL. Because the format is The Graph's and the events are on-chain, anyone can deploy the same
  subgraph elsewhere.
- The client reads live state from the contracts and history from the indexer.

## B-19 — Points on-chain — Adapt

Points (D-24) are kept on-chain because they drive rules (honor, [06-combat.md](06-combat.md#honor)).
They are updated **incrementally** on every change that affects them, and must always equal the value
derived from state. A view function recomputes them from scratch, used by tests to check this
invariant.

## B-20 — Optimistic client — New

The client runs **the same rules engine** as the contracts, compiled from the same spec and checked
against the same vectors. It shows the projected result of an action immediately and reconciles
when the transaction confirms. This is possible because the simulation is deterministic (D-08) and
has no randomness (B-12).

## B-21 — Parity tests — New

- Contracts are tested with **Foundry** against [data/test_vectors.yaml](data/test_vectors.yaml) and
  [data/test_vectors_target.yaml](data/test_vectors_target.yaml), converted to JSON.
- Each vector passes exactly, or is listed in B-03 with its tolerance.
- The client rules engine (B-20) runs the same vectors.

## B-22 — Hidden information — v2

Constraints:

- **The defender is usually offline.** If the defender's state is hidden, only something that knows
  it can compute the battle when an attack arrives.
- **Building troops are public** (B-05). When a mission leaves, the drop in the origin building's
  troops shows exactly what it carries. So hiding a mission's **composition** hides nothing unless
  building state is hidden too.

Options considered:

| Option | Hides | Notes |
|--------|-------|-------|
| **Hidden target + timelock encryption** | Where a mission goes | **Chosen for v2.** Details below. |
| **Private keeper** (operator holds the secrets) | Where a mission goes | Rejected: the operator sees every target first, and a leaked key leaks them all. |
| **Client-side ZK** (Noir, Circom) | Own actions (e.g. "I can afford this") | Verifier ~250–400k gas. Does not solve battles against an offline defender. |
| **FHE** (Zama fhEVM, Fhenix CoFHE) | Full state | Fully homomorphic encryption: the contract computes on encrypted troops and resources and only the report is decrypted. The only fit for hiding an offline defender's state. Costly, combat (divisions, comparisons) is heavy on encrypted values, and depends on a third-party coprocessor and decryption network. **Research only.** |
| **TEE / confidential EVM** (Oasis Sapphire) | Full state | Another network; trust in enclave hardware. |
| **ZK for scaling** (RISC Zero, SP1) | Nothing | Off-chain simulation with an on-chain proof. Fallback if full on-chain proves too expensive. |

**Hidden target (v2):**

- Everyone sees that a mission left, its troops and its arrival time. Nobody sees **its target**
  until it arrives.
- At send time the mission stores `hash(target, salt)` and the pair `(target, salt)` encrypted with
  **drand timelock encryption** (tlock) for the drand round at the arrival time. Before that round
  nobody can decrypt it, including the game operator.
- **Reveal:** after arrival, anyone (the attacker, our keeper, any player) decrypts and submits
  `(target, salt)`. The contract checks it against the hash. The attacker may also reveal earlier.
- **Forfeit:** if not revealed by `arrival + grace` (e.g. 5 minutes), for example because the
  attacker encrypted garbage, anyone can call `forfeit(id)`. The mission is dropped and **its troops
  are lost**.
- **Salary** is charged at send time, as today. It reveals the distance (a ring of possible
  targets), not the target. Accepted.
- **Ordering:** the global mission order (B-07) already resolves missions one after another by
  arrival, so a hidden target only adds one condition: a mission is resolved after it is revealed or
  forfeited. With tlock anyone can reveal, so the queue waits at most the grace period.
- Station, transport and occupy missions are hidden the same way, so an attack does not stand out.

To validate in v2: a tlock library usable from the browser, and the gas cost of the reveal.

## B-23 — Arbitration — v2

A written rulebook (pushing, multi-account abuse, etc.). Anyone can open a case on **Kleros v2**
(Arbitrum One, B-01) by paying the arbitration cost. Not delivering an accepted market trade
(B-11) is one of the violations. The ruling calls B-14 (`suspend` for X days).
Open: the exact rules and the list of sanctions.

## B-24 — Tokenization — v2

The only token with value is the **account**: one ERC-721 per player, wrapping B-26. Transferring
the NFT transfers the account (`transferPlayer`), with the same rules. Buildings, troops and
resources are **not** tokenized individually (B-04 stays).

## B-25 — Premium — New

The premium module in the legacy code is an empty stub. In the original game premium unlocked
longer queues. Target:

| Queue | Without premium | With premium |
|-------|-----------------|--------------|
| Rooms, per building | 1 | 6 (legacy value, [05-formulas.md](05-formulas.md#queues)) |
| Research, per player | 1 | 6 (legacy value) |
| Troop batches, per training room | 1 | 5 (B-09) |

Values live in the `premium` section of [data/game_config.yaml](data/game_config.yaml). The legacy
`queues` values become the premium limits.

- **Purchase:** 30 days, paid with the same credits as gas (B-16), into the `Treasury`. Buying
  before expiry adds days.
- **State:** `premiumUntil` per player. `isPremium(p) = premiumUntil[p] > now || globalPremiumUntil > now`.
- **Global premium:** the admin (Safe, B-17) can call `setGlobalPremium(until)` to give premium to
  every player for a while (events, launch, compensation).
- **Expiry** (own or global): items already queued finish normally; new items can only be queued
  while the queue is below the limit without premium.

## B-26 — Player identity — New

All game state (buildings, research, points, family, missions, queues, market trades, premium,
sanctions) is keyed by a **`playerId`**, never by an address. Each player has one **controller**
address (the smart account, B-15), which can change.

- `transferPlayer(id, newController)` gives the whole account to someone else. It is in v1. The v2
  NFT (B-24) only wraps it.
- **Not allowed while suspended** (B-14), so a sanction cannot be escaped by moving the account.
- Everything moves with the account: buildings, troops, missions in flight, queues, premium, family
  membership and role, market trades.
- Sanctions and open Kleros cases (B-23) follow the account, not the person.
- A controller address controls at most one player at a time.

## B-27 — Exact stocks — New

Implements D-12. Each stock is an integer in units of **1/100800** of a resource (3600 seconds × 28).
Production rates per hour are kept ×28 so the D-07 partial flows (`/7`, `/4`) are integers (B-03), and
a rate of `r` (×28, per hour) adds exactly `r` units per second. The visible stock and every
affordability check use `⌊stock / 100800⌋`; spending subtracts `cost × 100800`. Storage capacity
(D-10) clamps the same units.

## B-28 — Alcohol depletion at a whole second — New

D-07 changes regime when the alcohol stock reaches 0. With a stock `s` (units) and a net consumption
`c` per second, the change happens at `t0 + ⌈s / c⌉`: until then converters run at full rate, after it
at the starved rate. Compared with the exact continuous moment this over-produces less than one
second of dollars, but it keeps every event on a whole second, identical in TypeScript and Solidity.

## B-29 — Duration computed at start — New

A queue item (room, research, troop batch) computes its duration **when it starts**, with the current
level of its timing room (`boss_office`, `mob_school`, `boot_camp`, `security`). Items that have not
started are therefore always timed with the latest level, and the item in progress keeps its finish
time: exactly D-23, without a separate re-timing step. Ties between events at the same second follow
creation order (D-08), using a global sequence number assigned when the item is queued.

---

## Architecture

```mermaid
flowchart LR
    Client[Client + rules engine] -->|session key| AA[Smart account]
    AA --> PM[Paymaster]
    AA --> World
    subgraph Contracts["Game (one UUPS proxy, linked libraries)"]
        World --> Building
        Building --> Queue
        Building --> Mission
        Mission --> Combat[Combat library]
        World --> Market
        World --> Family
        World --> Player
        World --> Sanctions
        World --> Treasury
    end
    Contracts -->|events| Indexer
    Indexer --> Client
    Safe[Admin Safe] -->|upgrade, arbiter v1| Contracts
```

Modules are storage namespaces and libraries inside the single `Game` proxy, not separate contracts.

| Module | Responsibility |
|--------|----------------|
| `World` | Ruleset parameters, map, player registry, first building (B-12), entry point |
| `Player` | `playerId` and controller (B-26), research levels and queue, points (B-19), family membership, vacation, suspension, `premiumUntil` |
| `Building` | Rooms, resources, troops, `lastUpdate`, local settlement (B-06, B-27, B-28) |
| `Queue` | Room, research and troop queues, deferred payment (D-11), duration at start (B-29) |
| `Mission` | Send, recall, global mission queue (B-07, B-08), arrival rules, salary |
| `Combat` | Pure library: battle, loot, honor (B-02) |
| `Market` | Offers, acceptance, settlement by transport (B-11) |
| `Treasury` | Receives premium payments (B-25); controlled by the admin Safe |
| `Family` | Families, roles, wars (D-20) |
| `Sanctions` | Suspension by `arbiter` (B-14) |


## Implementation stack

| Topic | Choice |
|-------|--------|
| Repository | This repo: `contracts/`, `packages/`, `apps/` at the root, next to `docs/spec` and the legacy PHP |
| Monorepo | pnpm workspaces; Foundry as its own project in `contracts/`; no Turborepo/Nx for now |
| Contracts | Solidity + Foundry. **One** OpenZeppelin UUPS proxy (`Game`, B-17) with storage namespaced per module (ERC-7201) and logic split into linked external libraries to stay under 24 KB. Replaces one proxy per module: settlement touches buildings, players and missions in one flow |
| Rules engine | TypeScript, `packages/rules`: pure, deterministic, `bigint` and the same integer formulas as Solidity (B-03, B-20). `scripts/combat_reference.py` stays as a validation reference |
| Ruleset | Code generation: one script turns `vendetta.yaml` + `game_config.yaml` into a Solidity constants library and an equivalent TS module. Only caps the Safe may tune (`onchain`, `premium`) live in storage |
| First world | Vendetta only. The engine reads `roles`, never entity names (D-21), so Space4k can follow |
| Frontend | SPA: Vite + React + TypeScript, viem + wagmi. Static, so it can be served from anywhere (including IPFS) |
| Indexer | Goldsky Subgraphs (B-18) |
| Languages | Code, comments and identifiers in English. UI with i18n in Spanish and English, texts taken from `application/languages/` |
| CI | GitHub Actions on every push: `forge test`, rules engine tests, frontend build |

## Assumptions to validate

Measured with a prototype before the B-03 deviation list and B-09 caps are fixed:

| Assumption | Current estimate |
|------------|------------------|
| Typical action (build, train, send) | **Measured (core, 3a)**: register ~251k, queue a room ~140k (real transactions on anvil, base cost included). Inside a test: queue that waits ~55k, settling 6 queue items ~326k, settling production only ~33k. `forge test --match-contract CoreGas -vv` |
| Worst-case combat (21 × 21 types, 5 rounds) | **Measured: ~1.24M gas** (16 attack vs 21 defender types, 5 rounds, research 20; stats of both sides + resolution, in memory). Typical raid (3 vs 2 types, 5 rounds): ~0.51M. Storage not included. `forge test --match-contract CombatGas -vv` |
| Storage, not combat, dominates cost | Unmeasured. Decides whether B-02 ever needs Stylus. |
| Precision vs test vectors | **0 deviations** in every formula, including travel time and salary (exact integer math, B-03) |
| Cost of settling one building with 32 pending missions | Sets the 32 cap and `maxEvents` |
| Daily sponsored allowance per account | Set from the measured costs and budget |
| Smart account provider supports multi-passkey + session keys + paymaster | To be chosen |
