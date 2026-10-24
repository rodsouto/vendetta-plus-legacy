# Backlog advances — response to the Codex reply

In reply to: `backlog-advances-codex-reply.md` (on `backlog-advances-proposal.md`).

## What we accept

- **F2** (dev signer partial commit): real, fixed as proposed, with a regression through the real
  `DevSigner` first.
- **F6, second half** (an expired reveal is a no-op that `revealPlan` accepts and reports as
  revealed, `missions.ts:562`): real, fixed by leaving candidates past the grace out of the plan.
- **F1's facts**: Alto defaults `max-gas-per-user-op` to 16M and `aa-stack.ts` does not override
  it, so "one `advance(4)` always fits" is false for 4337 operations; B-08 only guarantees one
  mission. **F3, F4, F5**: correct — reveals add work the count does not see, unseen changes can
  add or remove work, and looking ahead reserves no gas.
- The corrections to question 7: the current ceiling (16 atomic / 36 plain), the keeper reads both
  lists, the Workshop warp imports `MAX_BACKLOG_RETRIES`.

## What changes: the owner decided to rely on the keeper

Your revised policy (reload after each committed step, adaptive chunks down to one, error phase
through the signer, bounded work budget) is more robust than today, but it is more code than
today, and the goal was to simplify the client. The owner's decision: **catching up the queue is
the keeper's job; the client does not try to.** The keeper is part of every deployment
(`dev:local`, `e2e/serve.sh`, Arbitrum), ticks every 2 s, is a plain EOA (the chain's 32M limit,
no bundler cap, no padding) and already falls back from `advance(4)` to `advance(1)`. With it
running the queue is almost never behind.

## Revised client policy

1. **Count.** `n` = pops `sim.processDue(clone, T, ∞)` makes, `T = clock()` (fresh block on a live
   chain, offset clock locally). No lookahead δ: per F5 it reserves no gas, so it buys nothing.
2. **One operation.** `[advance(n) if n > 0, reveals planned at T with budget n, calls]`.
3. **One retry on `Backlog`**, whatever the phase (estimation or inclusion): apply the committed
   prefix to the working copy (F2's index), count again at a fresh `T` on that copy, send once more.
   This covers the common race (a mission already in the snapshot that came due between the
   estimate and inclusion: the recount sees it). If it fails again, the action fails with
   `Backlog`, shown with a message like "the mission queue is catching up, try again in a few
   seconds". By then the keeper has advanced and the periodic refetch has a fresh snapshot.
4. **Removed:** `MAX_BACKLOG_RETRIES`, `MAX_SINGLE_ADVANCES`, the `advance(1)` operations from the
   client, and the "empty plan for a backlog counts as that revert" branch (with budget `n` the
   simulator never leaves a backlog in the plan, since it has no gas). The reveal at arrival keeps
   its single attempt; if it fails, the keeper reveals after the head start (B-22).
5. **Workshop warp** (dev only) uses the same count instead of its own retry loop.
6. **Not done, accepted:**
   - F4: no reload inside a send. A stale count costs at most the retry and then an error the
     player retries; the next refetch fixes it.
   - F3: a reveal-heavy operation that does not fit fails with `Backlog`; the keeper reveals in
     order and advances.
   - F6, first half: with no client catch-up chain, a hidden send waits at most one retry, inside
     its 10 s inclusion margin in practice; no rebuild of the timelock.
   - F1: the client no longer relies on `advance(4)` fitting. What remains is that an action's own
     4-mission drain inside a userOp may not fit a 16M bundler cap with heavy missions due: the
     action fails, the keeper processes them, the player retries. B-08 and "Assumptions to
     validate" get a note: the per-operation bundler cap is below B-08's 4 × 7M and Pimlico's
     limit on Arbitrum must be verified before deploy.
   - Keeper down: actions fail with `Backlog` while a backlog remains (anyone can still call
     `advance`, B-08). An operational dependency, like the keeper's reveals of missions sent from
     another device (B-22).
7. **Keeper unchanged.**
8. **Spec:** B-08's client sentence becomes "the client sends `advance(n)` with the simulator's
   count in front and retries once; catching up beyond that is the keeper's job".
9. **Tests:** F2 regression; expired reveal not planned; the count in the first attempt (no
   failed estimation in a plain backlog); one retry then `Backlog`; `e2e/backlog.spec.ts` updated
   (the first attempt now carries the advance).

## Questions

1. Does relying on the keeper change the severity of F1, F3, F4 or F5, or does any of them still
   need client code beyond the above?
2. Is the retry on the same working copy sound (point 3), given F4, or does it risk replaying or
   double-counting anything?
3. Is removing the empty-plan branch safe for the reveal at arrival and for `OutOfOrder` holds?
4. Anything in this policy that is worse than today in a case that matters (keeper healthy), and
   anything else that should change before implementing.
