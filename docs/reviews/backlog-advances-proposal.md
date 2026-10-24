# Backlog: compute the advances instead of retrying blindly (B-08) — proposal

Client-only change, agreed in principle by the owner, asking for a second opinion before it is
implemented. Nothing in `contracts/` or `packages/rules/src/sim` changes.

## Today

`sendBehindQueue` (`apps/web/src/state/backlog.ts`) sends `[advance(4) × k, reveals, calls]` and
guesses `k`: it starts at 0 and, on each `Backlog`, adds one `advance(MAX_MISSIONS_PER_TX)`, up to
`MAX_BACKLOG_RETRIES = 3`; then it sends up to `MAX_SINGLE_ADVANCES = 8` operations of `advance(1)`
and makes one last try. With more than ~28 due missions the action fails with `Backlog`.

Most of those retries fail at **gas estimation** (`estimateUserOperationGas` with a stub signature,
or `eth_estimateGas` for dev accounts): no transaction, no passkey prompt, one RPC round trip each.
The case that costs a reverted operation on chain is a mission coming due between the estimate and
inclusion: the estimate did not include the 7M `MISSION_GAS_RESERVE` (nothing was due then) and the
limit (`estimate × 1.5 + 100k`, `apps/web/src/account/stack.ts`) cannot cover it.

## Proposal

1. **Count.** `n` = number of missions `sim.processDue(clone, T + δ, ∞)` takes out of the queue,
   on the working copy, with `T` = `clock()` (a fresh block on a live chain). It is exact for the
   snapshot: same state machine as the contract (differential scenarios), it includes the returns
   that come due while arrivals are processed and the hidden missions that get parked (one each).
   What the snapshot cannot see only adds missions (a keeper reveal of a parked mission since the
   load, missions coming due before inclusion), hence `δ` (proposed: 10 s, the hidden-send margin).
   Over-counting is harmless: `advance(n)` processes only what is due, and on an empty queue it only
   reads the heap head.
2. **One operation.** `[advance(n), reveals, calls]`, a single `advance(n)` instead of `k` copies of
   `advance(4)`. The reveals are planned with `revealPlan(..., { budget: n })`, so each reveal's own
   drain finds the queue caught up.
3. **Gas fallback.** If that operation reverts with `Backlog` at estimation, the missions do not fit
   in one operation's gas (the simulator has no gas, so this is the only thing it cannot predict).
   The client sends `⌈n / 4⌉` operations of `advance(4)` (B-08's invariant: 4 × 7M fits Arbitrum's
   32M transaction limit, so one `advance(4)` always fits; `advance(1)` is no longer needed), then
   counts again and sends the operation of step 2.
4. **Race.** A `Backlog` on chain (a mission came due between estimate and inclusion) gets **one**
   retry from step 1 with a fresh `T`. Rejected alternative: raise the gas limit to
   `estimate + 7M` when the simulator sees a mission coming due within `δ` (ERC-4337 charges 10% of
   the unused limit, ~700k gas, only then); more code (a gas floor through the `Signer`) for a rare
   case.
5. `MAX_BACKLOG_RETRIES` and `MAX_SINGLE_ADVANCES` go away; so does the ~28-mission ceiling.
6. **Keeper unchanged** (`apps/web/scripts/keeper.ts`: `advance(4)`, then `advance(1)` on failure):
   it does not load the world, it only reads the queue head.
7. **Spec:** the B-08 sentence on the client's retries is rewritten to match.

## A bug found while reading (dev accounts only)

`sendPlain` (`apps/web/src/account/signer.ts`) sends the calls one by one with `writeContract`,
which estimates gas first. A call that reverts **at estimation** throws viem's error, not a
`RevertedError` with `failed = i`, so `sendBehindQueue` takes `landed = 0` although calls `0..i-1`
were mined. If a `Backlog` hits a call after the action, the action is sent again. The unit tests
do not catch it because their `submit` mock always reports `failed`. Fix: wrap the error with the
index in `sendPlain`; add a test that reproduces it first.

## Questions

1. Is the count really exact against the contract, and is anything missing from "only adds
   missions" (recalls, forfeits, reveals by others, missions sent by others since the load)?
2. Is `δ = 10 s` reasonable on Arbitrum with a passkey + bundler, and on a local anvil with time
   travel (`clock()` is the device clock there)?
3. Does a single `advance(n)` behave the same as `k × advance(4)` in gas and in the revert rule
   (`_processDue` reverts with `Backlog` when `gasleft() < MISSION_GAS_RESERVE` with a mission due)?
4. Is "one `advance(4)` always fits" safe for a 4337 operation (bundler or paymaster caps on
   `callGasLimit` below 32M, Kernel overhead, the session-key path)?
5. Is one retry enough for the on-chain race, or does anything make it repeat (a busy queue that
   keeps coming due)?
6. The reveal at arrival calls `send([], "actor")`: does anything change for it, in particular the
   current rule "an empty plan for a backlog counts as that revert"?
7. Anything else that should change before implementing.
