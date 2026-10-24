# Codex reply to the backlog advances proposal

Date: 2026-10-22  
In reply to: `backlog-advances-proposal.md`  
Scope: the working tree at `81dd347`; client execution policy, with B-07, B-08 and B-22 taking precedence

**Verdict: agree with changes.** Computing a queue budget from the simulator is a sound replacement for guessing the advance prefix. I do not agree with removing `advance(1)`, assuming an estimation `Backlog` proves a gas problem, or treating a fresh clock as a fresh world. The reported development-signer bug is confirmed. This reply changes no code or specification.

## Findings, ranked by severity

### F1 — P1: Keep a fallback that can shrink to one mission, and handle operation gas limits

Proposal step 3 strengthens B-08 beyond what it guarantees. Its invariant is that **one mission** fits in a transaction, with a provisional 7M reserve. The choice of four missions is a batch size based on the chain budget; it is not a guarantee that every account, bundler and sponsorship policy accepts that batch.

There is a concrete constraint in this tree: the installed Alto configuration defaults both `max-gas-per-user-op` and `max-gas-per-bundle` to **16,000,000**. `apps/web/scripts/aa-stack.ts:125` launches Alto without overriding either. Its `rpcHandler.js:111–122` checks a transaction gas floor, including its executor multiplier, against the per-operation cap. This is a local AA limit, not evidence of Pimlico's production settings.

`stack.ts:85–92` also changes an estimate `E` into `1.5 × E + 100k` before submission. For example, a 14M estimate becomes a 21.1M execution limit even before the remaining EntryPoint budget. A batch can estimate successfully and then fail admission. Kernel uses additional execution machinery; ordinary game actions use the SimpleAccount session path (`signer.ts:252`, `session.ts:17`), which still runs through EntryPoint and sponsorship.

**Failing sequence:** a large operation fails estimation or admission; the client switches to `advance(4)`; a four-mission chunk exceeds the available operation budget; the proposed fallback fails too. Alternatively, estimation succeeds, but the padded operation is rejected with a provider gas-limit error rather than the game's `Backlog`, so the proposed fallback never starts.

**Proposed fix:** attempt the computed prefix, then adapt the separately committed chunk size, down to `advance(1)`. Recognize documented gas-cap/admission failures as well as decoded gas-related reverts. Account for the final padded limit, verification/paymaster gas and forwarding overhead. Keep ordinary action errors and sponsorship exhaustion distinct: splitting calls does not repair an exhausted allowance. If even one mission cannot be admitted, report the deployment/policy constraint and stop.

Keep the keeper's existing one-mission fallback. Rewriting B-08 to remove that path would discard the recovery justified by its invariant, rather than merely optimize prefix counting.

### F2 — P2: The development-signer partial-commit bug is real

`sendPlain` awaits `writeContract` outside any catch (`signer.ts:123–135`). Only a **mined reverted receipt** becomes `RevertedError(name, i)`. The development wallets use local private keys (`chain/config.ts`); installed viem prepares the transaction and estimates its gas before broadcasting it. An estimation rejection escapes without `failed = i`.

`sendBehindQueue` then uses `landed = 0` for that error (`backlog.ts:156`), even if earlier calls succeeded. Its protection against replaying an action, `landed > front.length`, cannot work without the index.

**Failing sequence:** submit `[train(A), train(B)]`; A is mined; B's estimation sees newly due work and throws a viem `Backlog`; the executor retries `[advance(4), train(A), train(B)]`. A is sent twice. The same missing information can leave the working copy behind already committed advances or reveals.

I reproduced this through the actual `DevSigner` and `sendBehindQueue`, with a mocked wallet returning successful receipts and rejecting the second write with a viem error that decodes to `Backlog`. The committed call names were:

```text
train, advance, train, train
```

**Proposed fix:** normalize a confirmed estimation failure with its call index, decoded error, original cause and execution phase. Preserve the existing mined-revert index. Do not wrap errors in a way that loses cancellation/error decoding, or treat an uncertain broadcast/receipt timeout as proof that the call failed. Retain the committed-prefix guard, apply/reload committed prefix effects, and accumulate successfully submitted reveal IDs across attempts.

The proposed regression is necessary. `backlog.test.ts` supplies indices itself; its final partial-action test uses `CannotAfford`, which never exercises a `Backlog` replay. `signer.test.ts` covers mined-revert decoding, not this boundary. The older RPC replay-decoding problem discussed in the B-22 reply has already been fixed by the current `revertData` implementation; this is a separate remaining defect.

### F3 — P2: Initial queue count does not size the reveals, so `n = 0` can still need substantial recovery

`n` counts the initial `processDue` pass. It does not count work introduced by the subsequent planned reveals. Each parked reveal requeues a public mission at the reveal time with a fresh sequence; the next reveal's drain, or the action's drain, processes it. Both implementations do this (`Missions.sol:377–405`, `missions.ts:551–577`).

**Failing sequence:** the heap is empty, several of this client's missions are parked and revealable, and `n = 0`. The combined reveals and their drains exceed the operation budget. Step 3 sends `ceil(0 / 4) = 0` catch-up operations and reconstructs the same oversized reveal batch. Draining an initial queue cannot solve this case.

The same issue remains after a nonzero initial backlog has been cleared: a large reveal prefix can still be too expensive.

**Proposed fix:** size and estimate the complete ordered operation, including reveals, their drains and the requested calls. Permit separately committed, ordered reveal groups with intervening advances when necessary. Replan after each committed group. Preserve B-22's order window and its allowance for client/keeper races. Do not infer either affordability or progress from `n` alone.

For a reveal-only operation, the last reveal deliberately leaves its newly public mission queued. That matches today's behavior: a later action/keeper advance resolves it. If immediate resolution is desired, an explicit trailing advance is additional work that must be budgeted; it is not included in the initial count.

### F4 — P2: Recount from current state; a fresh `T` alone does not repair stale plans

The statement that unseen changes “only add missions” is false. Another `advance` or drained action consumes queued work. Recall drains first and retimes the recalled mission. Forfeit removes a hidden mission without draining and replaces it with a later return. Reveal can replace a parked mission with a due public one, or change a future hidden mission into public work with a possible return. Other actions can also change battle outcomes and hence whether returns exist.

`loadWorld` correctly pins its reads to one block (`load.ts:31–40`). However, the executor receives a captured `snapshot.world`, clones it once, and has only a clock callback (`game.tsx:294–304`, `backlog.ts:139–143`). Periodic React refetches do not replace that copy inside an already running send.

**Failing sequence:** a snapshot has five expired parked missions and no heap entries; the keeper forfeits those missions after the snapshot, without draining; their returns become due while the send is still using that snapshot. The client's `n` remains zero. The action drains four returns and reverts `Backlog` because a fifth remains. That is a stale-count failure even with sufficient gas. Retrying with a newer timestamp against the same world still counts zero. New missions absent from a stale snapshot can produce the same undercount. Conversely, another caller can clear the entire backlog while the client is preparing unnecessary catch-up operations.

There is also an ordering race: a hidden predecessor absent from the snapshot can arrive before an own reveal. The reveal's drain parks it and the order check throws `OutOfOrder`. Because the reveal is an optional prefix, that failure can roll back an otherwise valid atomic action.

**Proposed fix:** provide an explicit way to load a fresh, block-pinned snapshot after committed catch-up work and on a planning inconsistency. Recount and replan against it. Reconcile partial plain submissions using their actual confirmed effects or reload, rather than treating a later wall-clock projection as a receipt. Refresh after committed progress even if the requested action eventually fails. A prefix `OutOfOrder` should trigger prefix replanning/waiting, not repeated advances intended to fix gas.

Treat the count as an exact simulation result for its input and horizon, and an execution hint once other transactions can intervene. Overcounting is safe for `advance`'s game semantics, but unnecessary sponsored operations still cost gas and time.

### F5 — P2: Looking ahead does not reserve gas for future arrivals, and one retry is not a guarantee

`advance(n)` checks the actual block timestamp on every iteration. A larger `n` does not make a not-yet-due mission execute or make estimation reserve gas for it (`Missions.sol:83–94`).

**Failing sequence:** at T the heap head arrives at T+2. Counting through T+10 gives `n = 1`, but estimation executes an empty `advance(1)` and a cheap action. The operation lands at T+2 with less than 7M available inside the mission processor and reverts `Backlog`. Counting the mission in advance did not prevent the race. If the keeper clears that due work before the retry's estimate, the retry can estimate during another gap and cross another arrival at inclusion. This does not require an unusually large queue.

**Proposed fix:** keep lookahead as a heuristic and describe the inclusion race explicitly. One retry is acceptable as a user-experience/cost policy, provided failure is recoverable and never replays committed actions. For stronger completion behavior, use a bounded elapsed-time/operation budget, refresh state, adapt chunks, and stop on no progress. Removing a fixed mission-count ceiling need not mean unbounded automatic spending.

The proposal distinguishes estimation failure from inclusion failure, but `submit: Promise<void>` and the current errors do not consistently expose that distinction. Carry the phase through the signer boundary; a decoded `Backlog` alone cannot select those two policies. It can mean an underestimated queue as well as insufficient gas.

### F6 — P2: Long catch-up must rebuild time-sensitive calls and expire reveal plans

The hidden-send margin and the backlog lookahead happen to be 10 seconds, but they serve different purposes. `Missions.tsx:150–166` fixes the timelock/ciphertext before `g.act` starts. `quicknetPrepare` chooses an arrival only 10–12 seconds beyond that preparation's natural arrival (`hidden.ts:55–64`). The contract rejects a send whose inclusion-time natural arrival has overtaken that fixed arrival (`Missions.sol:333–336`).

**Failing sequence:** prepare a hidden send, spend more than its inclusion margin on separately committed catch-up operations, then submit the unchanged send. Catch-up succeeds but the action fails `TooLate`. A similar delay can carry an own arrival reveal beyond its 60-second grace. The current planner accepts the simulator's expired reveal no-op as a successful planned call (`backlog.ts:82–94`), so a mined no-op can be returned as a revealed ID while the mission remains hidden.

**Proposed fix:** revalidate time-sensitive intent after catch-up. For hidden sends, prepare/encrypt after lengthy catch-up or rebuild with a fresh timelock on `TooLate`, only when the send is known not to have landed. Never change just the arrival while reusing ciphertext for an earlier round. Filter expired reveal candidates or verify the simulated reveal actually opened the mission, and distinguish an expired/no-op call from a successful reveal. Recheck order/grace eligibility before each separate submission; leave forfeiture to the existing keeper/explicit recovery flow.

## Answers to the seven questions

### 1. Is the count exact, and do unseen changes only add missions?

**Exact for a fixed input world and horizon, assuming enough gas; no to “only adds.”** `sim.processDue` and Solidity `_processDue` consume the same `(arrival, seq)` order, count parking once, and process newly due returns within the same pass. Count **pops**, not mission IDs: one outbound mission can count twice when its return is due too. Already parked missions contribute zero until an external operation requeues them.

This is supported by the matching code, existing contract tests such as `test_backlogThenAdvance`, and a temporary probe in which five public outbound missions produce ten processed events after a time jump. Differential tests support parity; they do not prove a forecast remains correct after concurrent state changes. F4 covers recalls, forfeits, reveals and new sends. A count through T+δ is a count at that future horizon, not the exact work at T or at an unknown inclusion time.

### 2. Is δ = 10 seconds reasonable on Arbitrum and local anvil?

**Reasonable as an initial tunable lookahead, not as a latency bound or gas guarantee.** A live session signs ordinary actions without a passkey prompt; session renewal can add a prompt before the action. RPC, sponsorship, bundler admission and inclusion still vary. This tree supplies no measurement establishing a ten-second bound for the full path.

Use two explicitly separate times: `T` for actual reveal eligibility, and `H = T + δ` for counting. Obtain T through the current `chainNow`: a fresh block timestamp on a live chain, or the offset-adjusted local clock. Never use H to select reveals, release an order hold, expire a grace, or mutate the working world used for actual-time planning. A reveal sent early leaks its target even if it later fails, contrary to B-22. Count on a disposable clone; call `revealPlan(originalWorkingWorld, ..., T, { budget: n })` on its own clone.

The local clock is **not simply the device clock**: it includes `offset.current`, and the Workshop advances that offset after `evm_increaseTime`/`evm_mine` (`game.tsx:276–286, 757–764`). Ten seconds cannot cover an arbitrary time jump; refresh/recount after one. Do not replace that local behavior with an idle anvil's last-block timestamp.

### 3. Does one `advance(n)` behave like repeated `advance(4)`?

**For state transitions, yes under fixed state/time and enough gas, when their total budgets are equal. For gas and failure boundaries, no.** A remaining due queue after reaching `max` is allowed for `advance`; the four-mission drain on an action additionally rejects a remaining due head. An advance that runs short of the reserve before its next allowed due mission reverts and rolls back all of that call's work.

One `advance(n)` saves repeated dispatch/proxy/library overhead and can save account-batch encoding overhead. It retains a gas check before each processed mission. Calls inside one atomic AA operation share its execution budget and roll back together. Separate operations receive fresh budgets and preserve earlier successes, but permit time and other transactions to change the result. Development calls are separate transactions even when supplied in one array.

If `n` is not a multiple of four, `ceil(n/4)` calls also permit extra pops at the last chunk; they are not literally equal budgets. Extra due work is permitted by B-08, but must not be assumed identical under concurrent arrivals.

### 4. Does `advance(4)` always fit a 4337 operation?

**No.** See F1, including the local 16M caps and the client's 50% + 100k padding. The chain's 32M execution ceiling is a separate constraint from account forwarding, EntryPoint overhead, bundler admission and sponsorship policy. [Arbitrum's sequencer documentation](https://docs.arbitrum.io/how-arbitrum-works/deep-dives/sequencer) describes that transaction ceiling; it does not promise acceptance by a 4337 provider.

Measure the final submitted operation through both the SimpleAccount session and Kernel controller paths, including the local AA stack. Production provider/policy limits need explicit verification; they are not established by this repository. Even the one-mission recovery needs a provider policy that can admit it. B-08's reserve is expressly provisional, so `4 × 7M < 32M` should not become a stronger unconditional guarantee.

### 5. Is one retry enough for an inclusion race?

**There is no guarantee.** F5 gives a repeating sequence. A fresh T without fresh state can additionally repeat F4's stale undercount indefinitely. One inclusion retry can be an intentional cap, with a clear failure and subsequent retry path. It should not be presented as a proof of eventual success on a busy queue.

The alternative gas-floor idea is a separate tradeoff. Its roughly 700k marginal penalty for 7M left unused is consistent with the project's EntryPoint 0.7 implementation, which charges ten percent of unused execution allowance. [EntryPoint v0.7 `_postExecution`](https://github.com/eth-infinitism/account-abstraction/blob/v0.7.0/contracts/core/EntryPoint.sol#L676-L685). Any implemented floor would need account/call-forwarding overhead, not merely an assumption that adding exactly 7M exposes 7M to the library.

### 6. What changes for `send([], "actor")` at arrival?

**Keep the shared executor and its distinction between backlog and waiting.** The call site already uses an unlimited actual-time projection to decide whether useful own reveals exist, then lets `send` plan the bounded operation (`game.tsx:319–324`).

- If an actual-time reveal is reachable after catch-up but the bounded prefix cannot reach it, an empty accepted plan still requests progress. It must not return success solely because `calls` is empty.
- If there are no eligible own candidates, or only an `OutOfOrder` hold, return no revealed IDs and wait. A positive world backlog count alone is not a reason for this effect to pay for unrelated work.
- Do not submit a pointless `advance(0)` when the entire operation is empty. When there are reveal calls and `n = 0`, F3 still applies.
- Return/record the IDs actually committed, including successful plain prefixes, and refresh after committed progress. An empty attempt must not mark a mission as revealed. The existing catch marks candidates as *attempted* to suppress repeated automatic sends; retain that as an explicit one-attempt policy or replace it with bounded retries, rather than accidentally claiming those missions opened.

Replan using the actual chain time after separate catch-up calls, preserve the live-session/no-surprise-prompt guard and `busy` serialization, and keep the no-early-reveal regression.

### 7. What else should change before implementation?

Correct these two descriptions and cover the execution boundaries:

- **There is no universal current ~28-event ceiling.** In a fixed-time fixture with one action, no known reveals and no gas model, the current atomic path succeeds at 16 events and fails at 17. Its eight separately committed fallback advances then leave nine events, so the final action still fails. The correctly indexed plain path succeeds through 36 and fails at 37: failed attempts committed 4 + 8 + 12 advances, then another eight, before the last action's four. Reveals and actual gas change these limits. The temporary probe reproduced those boundaries. The motivation should be the arbitrary, account-dependent retry policy.
- **The keeper reads more than the queue head.** `keeper.ts:115–125` loads both queue lists and every queued/parked mission, then sorts due hidden missions. It does not reconstruct a simulator world, so keeping its existing incremental strategy is sensible; “only reads the queue head” is inaccurate.
- **Removing `MAX_BACKLOG_RETRIES` needs another caller update.** `game.tsx:45, 791–796` imports and uses it in Workshop warp's direct reveal loop. Remove or replace that dependency deliberately, and cover warp with the new behavior.

Before implementation, I would require regressions for: actual signer estimation errors after committed prefix/action calls; atomic versus plain rollback; return-inclusive counts; snapshot changes between count and submission; gas-cap errors after padding; a four-mission chunk shrinking to one; `n = 0` with expensive parked reveals; reveal-only empty-backlog versus order-hold plans; future arrivals crossing estimation twice; grace expiry; and fixed hidden sends becoming `TooLate` during catch-up. Simulator-only tests cannot validate the gas/admission cases; exercise the actual local AA stack for those.

A suitable revised policy is: count on a clone, estimate the complete actual-time plan, commit adaptively sized catch-up/reveal work when necessary, reload and replan after progress, and submit only the remaining original intent. Preserve a bounded automatic-work budget without imposing a fixed total backlog size.

Update B-08's client-policy sentence alongside that eventual implementation. Keep its four-mission action drain, gas guard and single-mission invariant, and keep B-07/B-22's ordering, parking and reveal-time semantics unchanged. No Solidity or simulator rule change is needed for this direction.

## Validation

The existing targeted tests passed: **2 files, 10 tests**. The `pnpm` launcher initially failed with a sandbox `spawnSync ... EPERM`; invoking the installed runner directly succeeded:

```bash
cd apps/web
node node_modules/vitest/vitest.mjs run test/backlog.test.ts test/signer.test.ts \
  --pool=threads --configLoader=runner
```

Additional assertions used the real executor, development signer and simulator, with mocked wallet failures/receipts or simulated submissions. The temporary probe is `/tmp/vendetta-backlog-advances-review-probe.mts`; it changes no repository code. Those probes confirm the duplicate-action sequence, count reduction by another advance, return-inclusive counts, and the current atomic/plain boundaries. They do not constitute a live Pimlico test or a new worst-case gas measurement.
