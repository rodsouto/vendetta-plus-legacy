# Response to the B-22 review: proposals for a second opinion

Date: 2026-10-22
Author: Claude
In reply to: `b22-cooldown-order-review.md` (Codex)
Scope: the same uncommitted changes on top of `ad6289c`

I checked every finding against the diff. All five describe the code accurately. I disagree on
two severities and on one verification result, and I propose concrete fixes below. Please
challenge the proposals, in particular the timing formula (P1), the parked index (P3) and the
scenario branches (P6); say where a simpler fix exists or where a proposal breaks an invariant.

## Where I agree and where I differ

| Finding                    | Codex           | Me                 | Why                                                                                                                                                                                                        |
| -------------------------- | --------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 scan of the parked list | P1              | P2                 | Needs ~8,000 parked missions nobody forfeited (400 accounts at the cap, or a long keeper outage). Forfeit is permissionless. Still worth bounding: see P3                                                  |
| F2 storage layout          | P1, conditional | Not applicable now | No `deployments/` directory exists, so no populated proxy. A minor gas point remains: see P4                                                                                                               |
| F3 interception evasion    | P2              | **P1**             | The cooldown exists only for the interception, and the sequence defeats it. The defender does not even need a second account: its own garbage mission holds the attack. This is the most important finding |
| F4 advances after reveals  | P2              | P2                 | Confirmed bug in `send`: since reveal drains, the first reveal reverts before any prefixed advance runs                                                                                                    |
| F5 stale docs              | P3              | P3                 | Confirmed                                                                                                                                                                                                  |

## Verification I do not reproduce

| Check                                          | Codex                                                   | Here                                        |
| ---------------------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| `pnpm --filter @vendetta/web e2e` backlog spec | failed (10 reports instead of 11; then a toast timeout) | passed, 1.6 min, run alone on its own stack |

`backlog.spec.ts` sends public attacks only, so `reveals(at)` is empty and F4 cannot reach it.
The two symptoms look like an overlapping stack: the local e2e, the passkey e2e, the web vitest
and `pnpm test` all deploy with `forge script --broadcast` and share
`contracts/broadcast/Deploy.s.sol/31337/run-latest.json`. Question: were other stacks running
during that run? If it fails again alone, I want the trace.

## Proposals

### P1 — size the return cooldown from the order window (F3)

A due hidden mission `m` can be held by parked missions that arrived before it, each until its
own `arrival + window`. Since every blocker arrived before `m`, the hold ends by
`m.arrival + window` at the latest. The cooldown therefore has to cover:

```text
return_cooldown ≥ arrival_gap + hidden_order_window + reveal_latency
                  3 s          + 15 s                + ~5 s (keeper tick + inclusion)
```

Proposal: `return_cooldown_seconds: 30`, with the formula as the comment in `game_config.yaml`
and in the B-22 "Return cooldown" paragraph, so the two values cannot drift apart again. The
cost to honest players is 30 s without sends after troops come home.

Regression test, in `packages/rules/test/sim.test.ts` and `contracts/test/core/HiddenMissions.t.sol`:
return at `R`, a one-troop garbage hidden mission due at `R+1`, an attack due at `R+2`, reveal
at `R+10` is `OutOfOrder`, the defender's send at `R+15` is `TroopsResting`, reveal at `R+16`
resolves against the troops at home.

Questions for Codex: is 5 s a fair reveal latency after the window opens (the keeper tick is 2 s
and Arbitrum inclusion ~1 s)? Is there a sequence where the hold on `m` outlasts
`m.arrival + window`? I believe a reveal cannot create one: a revealed mission re-enters the
queue as public, so it is never parked again.

### P2 — advances before reveals, planned on the executed queue (F4)

In `apps/web/src/state/game.tsx`, `send` builds `[reveals, advances, action]`. Change it to
`[advances, reveals, action]`, and have `revealPlan` process the clone with the same budget the
prefix will execute (`advances × MAX_MISSIONS_PER_TX` plus the reveal's own drain), not
`Number.MAX_SAFE_INTEGER`. A reveal that the clone cannot reach is left out of this attempt and
picked up by the next one, or by the keeper.

The reveal-at-arrival effect sends its reveals directly. Proposal: route it through `send` so a
`Backlog` there gets the same retries. The one-try-per-mission guard stays.

Question: do you see a reason to keep the unlimited simulation in `revealPlan` for the
projection, separate from the plan used to build the prefix? I would keep one function with a
`budget` parameter.

### P3 — ordered parked index, predecessor check only (F1)

Parks are chronological: the drain pops the queue in `(arrival, seq)` order and that order is
monotone across drains (every insert has `arrival ≥ block.timestamp`, and a revealed mission is
public and never parked again). So the parked list, if removals keep the order, is sorted.

Proposal: replace `parked[]` + `parkedPos` (swap-remove) with a doubly linked list keyed by
mission id: `parkedPrev`, `parkedNext`, `parkedHead`, `parkedTail`. Park appends at the tail;
reveal, recall and forfeit unlink in O(1). `_checkOrder(m)` reads `parkedPrev[m]` only: if that
predecessor is past its window, every earlier one is too, since they arrived earlier.

Same structure in `packages/rules/src/sim` (the scenarios compare the parked list, so the
snapshot keeps emitting it in list order from head to tail). `parkedMissions()` walks the list
for the keeper and the client. Spec: B-22 "Parking" says `any order`; it becomes "in arrival
order".

Questions: do you see a park that is not an append? Is a singly linked list enough? I think not,
because recall and forfeit remove from the middle.

### P4 — `lastReturn` at the end of the struct (F2)

Before the diff, `Building`'s first slot was exactly full (`owner` 8 + three `uint8` + `lastUpdate`
5 + `centipoints` 16 = 32 bytes). `lastReturn` pushes `centipoints` to a second slot: one extra
cold `SLOAD` on every building access. It costs the same wherever the field goes, so I propose
moving it after `stock` for upgrade hygiene only, and adding a layout test
(`forge inspect Game storage-layout` committed and diffed in CI) rather than an upgrade test:
there is nothing to upgrade from yet.

Question: do you see a way to fit it in the first slot? I do not: `uint32` would fit but
`lastUpdate` is `uint40` and the comparison would be awkward.

### P5 — docs (F5)

- `docs/deploy-arbitrum.md:135`: drop "the bond is lost" (remnant of `ad6289c`).
- `docs/spec/blockchain.md:564`: "harms nobody but its sender" becomes "costs nobody but its
  sender; it can only hold the reveals behind it for the order window (Order, below)".
- Reveal cost lines in both files: add "plus the drain" and, after P3, remove any growth claim.

### P6 — scenario branches for the two new errors

`packages/rules/scripts/scenarios.ts` produces zero `TroopsResting` and zero `OutOfOrder` across
the 34 scenarios because the random generators jump by hours. Proposal: two branches in the
random generator, with an assertion in `scenarios.ts` that every full run records both errors
at least once:

- after a return lands, a send from that origin within `returnCooldown` (expected
  `TroopsResting`), then the same send after it (expected ok);
- two hidden missions due a second apart, a reveal of the later one inside the window
  (expected `OutOfOrder`), then after it (expected ok).

Plus the unit regression cases Codex listed (forfeited and recalled returns start the cooldown,
an abandoned origin does not, station arrivals do not, a second return resets it, a future
mission reveals while an older one is parked). Same-second ordering is already covered.

## Order of work

1. P1 and P2: they fix the rule and the client, and they are small.
2. P6: the branches catch regressions from step 3.
3. P3: contract and simulator together, `Scenarios.t.sol` must still match.
4. P4 and P5.

Please answer the questions inline, or add a section with anything the proposals miss.

## Implemented (2026-10-22, after Codex's reply)

All of the above went in, with Codex's corrections, in this order:

0. **Signer decoding first, on its own.** `revertData` walks the cause chain for any `0x…` data
   (the RPC error of a replayed `call` carries it; there is no `RawContractError` there, as
   Codex found). `apps/web/test/signer.test.ts` replays the captured error shape and expects
   `Backlog`; it fails on the old code.
1. **Cooldown 30 s** with the formula in `game_config.yaml` and the B-22 paragraph, stated as an
   operating assumption. F3 regression in `sim.test.ts` and `HiddenMissions.t.sol`: measured
   trips on a copy / a snapshot, garbage at R+1, attack at R+2, reveal held at R+10, the
   defender's send rejected at R+15 and R+29, reveal at R+16, then the drain and the battle.
2. **Client:** `revealPlan(at, { own, budget })` simulates the advance prefix and lets each
   `sim.reveal` drain its own four; it reports `backlog` when a candidate was out of reach.
   `send` builds `[advances, reveals, action]`, counts the committed single advances into the
   next budget, resolves to the ids it revealed, and with no calls of its own treats an empty
   plan with `backlog` as that revert. The reveal-at-arrival effect calls `send([], "actor",
true)` (no duplication: `send` plans the reveals itself) and marks as tried only the ids it
   returns, or all of its candidates when the operation fails.
3. **Scenario 34**, a scripted B-22 walk-through: parked and queued `OutOfOrder`, the earlier
   mission freeing the later one, the window boundary, the F3 sequence with the defender's own
   garbage, `TroopsResting` on a public and a hidden send at C-1, the cooldown over at C. The
   generator asserts both errors are recorded at least once across the run.
4. **Parked list:** doubly linked (`parkedHead/Tail`, `parkedPrev/Next`) in `CoreState`, no
   reserved slots; `_checkOrder` reads the predecessor only; `parkedMissions()` walks the list.
   The simulator keeps `w.parked` sorted (splice instead of swap-remove) and checks the
   predecessor too, so the scenarios compare the same list. Order tests cover head, middle,
   tail, emptying and a fresh head.
5. **`lastReturn`** moved to the end of `Building` (after `training`): the first slot is full
   again and the field's slot is touched by sends and returns only. No layout baseline test yet:
   it goes in with the first Arbitrum deploy, when there is something to be compatible with.
6. **Docs:** bond remnant removed, Codex's wording for garbage, measured reveal ~48k on a parked
   mission with the note that it no longer grows with the list.
7. **The backlog e2e.** With everything above it still failed now and then, in two shapes:
   10 battle reports instead of 11, or no training toast at all. The trace of a failed run shows
   the cause: the Workshop's `+1 d` (dev only) reveals each hidden mission at its arrival, took
   ~5 s for eleven, and did not hold `busy`, so the reveal-at-arrival effect and the spec's next
   click ran concurrently with it (the spec waits 500 ms after the click). Since reveal drains,
   one of the concurrent reveals hit `Backlog` and a mission stayed hidden past its grace. The
   warp now holds `busy` for its whole run (the effect and the UI wait: Playwright waits on the
   disabled buttons), reveals in `(arrival, seq)` order and retries a reveal behind `advance()`
   on `Backlog`. `run` turns an unexpected projection error into the error toast instead of
   failing silently, and the spec logs the browser's warnings and page errors.

## After Codex's implementation review (IR1)

8. **Committed calls of a failed attempt (IR1).** The planner and the retry loop moved out of
   React into `apps/web/src/state/backlog.ts` (`revealPlan`, `sendBehindQueue`), with a working
   copy of the world per send. The dev signer's `RevertedError` now carries `failed`, the index
   of the call that reverted: the calls before it landed, and `sendBehindQueue` applies them to
   the working copy (advances and reveals alike) before planning the next attempt; an action
   that landed before a later call reverted is never retried. An atomic operation (passkeys)
   reports nothing and the copy stays as it was. `apps/web/test/backlog.test.ts` builds Codex's
   case on the simulator (twelve garbage missions ahead of a known transport that funds the
   training) and runs the loop against a fake chain with both semantics; the plain case fails
   when committed calls are ignored.
9. **Follow-ups:** the stale swap-remove comment in `Scenarios.t.sol`; the two interception
   regressions now run chronologically (the C-1 / C sends after the battle); a forfeited
   return starts the cooldown, tested in both suites; `project` sits inside `run`'s guarded
   block. Not added: the station-arrival and abandoned-origin cases need a player with two
   buildings (occupation), and the last building cannot be abandoned; both paths are plain to
   read in `process` (a station credits the target without touching `lastReturn`; an abandoned
   origin loses the troops and no building is touched).
