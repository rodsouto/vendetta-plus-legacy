# Codex reply to the revised backlog advances policy

Date: 2026-10-22\
In reply to: `backlog-advances-response.md`\
Scope: the working tree at `81dd347`; B-xx takes precedence over the proposal and both replies

**Verdict: agree with the keeper-based policy, with the narrow changes below.** I accept the owner's decision that the client makes a computed attempt and one `Backlog` retry, then leaves catch-up to the keeper. I withdraw the earlier requirement for adaptive client chunks, separate reveal groups, or an in-send reload. Those mechanisms would provide stronger completion behavior than the owner is asking for. The accepted signer and expired-reveal fixes remain necessary.

Two client boundaries still need attention: protective account calls must bypass the prefix, and Workshop must stop its clock jump when a reveal fails. Neither requires restoring client catch-up. There is also an existing deployment gap: the local AA launcher starts no keeper. This review changes no code or specification; the fixes described in the response are not yet present in the inspected tree.

## Findings, ranked by severity

### R1 — P1: An unconditional computed prefix makes protective account calls depend on the queue

`send` serves more than drained game actions. `game.tsx:500–510` routes `revokeSession` through `run` and the shared executor; `cancelInvite`, `cancelRemoval` and the account page's `cancelTransfer` take the same route. All four deliberately omit `drained` in `contracts/src/Game.sol:201–234`. B-26 explicitly says a backlog must never delay them (`blockchain.md:722–723`), which is the specific exception to B-07's general action rule.

Today, with no known due reveals, these calls go out alone on the first attempt. Proposal point 2 would add `advance(n)` even to them. That introduces a queue dependency where none was required.

**Failing sequence:** a burst of unrelated missions is due just after the keeper's last tick; the owner revokes a lost device's session, with no reveal candidates. Revocation alone is cheap and valid. The new prefix attempts the entire due burst, exceeding the user-operation gas budget, so admission fails before revocation can execute. Alternatively, the prefix hits the reserve guard and both bounded attempts fail. The keeper is running and will advance the burst, but revocation now waits for it while the session remains authorized. Cancelling a pending transfer or controller removal has the same problem. No keeper outage is needed.

**Proposed fix:** send these protective calls directly, without automatic advances or reveals. Use a small explicit execution option or the existing call sites to express that distinction. Retain the queue policy for drained actions. This also removes the pre-existing possibility that an optional reveal prefix blocks protection; the newly introduced regression is demonstrable even with no reveals at all.

Add a regression with a positive due count and a prefix that cannot be admitted: protection must still be submitted alone and succeed. The temporary probe confirms the old/new policy difference with an injected admission failure; it is not a live gas measurement.

### R2 — P2: Workshop must not skip a failed reveal and jump past its grace

The ordinary action's recovery is “wait for the keeper, refetch, retry.” Workshop also controls whether that recovery time exists. Its current loop logs a failed reveal and continues (`game.tsx:791–803`), including the final jump to the requested target. Replacing the loop with the bounded policy without changing this continuation can turn a recoverable stale count into a forfeited mission.

**Failing sequence:**

1. Workshop captures a snapshot containing an own hidden mission M with a relatively long cover trip. Five public transports are sent after that snapshot, on shorter routes; both their outbound and return legs will be due by M's arrival. The keeper's last tick sees only future arrivals.
2. Workshop jumps directly to M's arrival before the keeper's next tick. Its snapshot count is `n = 1`; the actual work is eleven pops: ten transport legs and M's parking.
3. The plain `advance(1)` commits one unseen transport pop. M's reveal drains at most four more and reverts `Backlog`, rolling back that reveal's drain. Applying the committed prefix to the captured working copy parks M there, so the retry counts zero; the second reveal also fails.
4. If Workshop follows today's continuation, it immediately finishes the requested day-long jump. On the healthy keeper's next tick, M is already beyond its 60-second grace. It is forfeited instead of revealed. The keeper never had a tick during the missing interval.

I reproduced the queue transitions with the simulator and plain-call semantics: the current increasing-four prefix succeeds in three submissions; the revised policy fails in two, and a subsequent day jump makes M forfeitable. The sequence needs neither heavy gas assumptions nor a stopped keeper. It is a Workshop-specific consequence of accepting stale counts, not an objection to that choice for ordinary sends.

**Proposed fix:** use the computed attempt and its bounded retry, but abort the remaining warp at the current stop if the reveal fails. Refresh and report the incomplete warp so the keeper can run and the user can resume. Do not log the error and immediately advance beyond the grace. Keep the admin EOA path, arrival ordering, `busy` serialization, and a working copy that accounts for confirmed prefixes across stops. No client catch-up loop is required.

### R3 — P2: The local AA deployment does not satisfy the keeper assumption

`scripts/dev-local.sh` and `e2e/serve.sh` launch the keeper. `apps/web/scripts/aa-stack.ts` does not: it starts anvil, deploys the contracts, starts Alto and the mock paymaster, and starts Vite. Both `pnpm dev:aa` and `e2e:aa` use that launcher (`playwright.aa.config.ts`). Arbitrum's deployment guide separately instructs the operator to run the keeper.

**Failing sequence:** start the documented AA stack and create missions whose plaintexts the active browser lacks, or a queue requiring more work than its admitted operation can perform. The revised client stops after its bounded attempts. Waiting and refetching cannot deliver the promised keeper recovery because this stack never launched one. A hidden mission sent from another device also lacks its normal reveal service.

**Proposed fix:** launch and clean up a keeper alongside the AA stack, passing that stack's deployment and local RPC. Give it a distinct funded EOA: its default account 9 is already Alto's executor wallet here (`aa-stack.ts:33–35`), and account 8 is Alto's utility wallet. Sharing the default would introduce nonce contention. Cover a reveal without the browser's plaintext and subsequent queue progress through this deployment.

This is an existing deployment omission, not a failure of a healthy keeper. It needs closing to make the revised operational assumption true; the keeper's algorithm can remain unchanged.

## Answers to the four questions

### 1. Does the keeper decision change F1, F3, F4 or F5, and do they require more client code?

**Yes, it changes their disposition. Their factual observations stand; their stronger client-recovery requirements do not.** For ordinary drained actions, bounded failure followed by keeper progress and a later player retry is an acceptable owner-selected outcome.

| Earlier finding | Status under the owner's decision |
|-----------------|-----------------------------------|
| **F1 — operation gas limits** | The limits still matter, but adaptive client splitting is no longer required. `advance(n)` and the complete reveal/action operation may exceed a provider budget; waiting for the keeper is accepted recovery. Preserve the keeper's four-to-one fallback and verify production provider limits before deployment. |
| **F2 — development signer partial commits** | Still a required correctness fix, already accepted. Reducing retries to one still permits replaying an already committed action if the failing call index is lost. The inspected signer remains unfixed. |
| **F3 — reveals add work after the initial count** | Still true, but no client reveal-splitting machinery is required. The keeper can reveal and advance separately. An initial `n = 0` says nothing about the full reveal batch's gas cost. |
| **F4 — stale state** | Still true, but no reload inside an ordinary send is required for this bounded policy. The working copy is a planning hint, not current chain state. Preserve the committed-action guard. Workshop needs R2 because it can remove the keeper's recovery interval. |
| **F5 — inclusion races** | Still true, but one retry is an acceptable limit, not a success guarantee. Dropping the lookahead is reasonable. A fresh count can fix a known mission crossing its arrival; another crossing or unseen work can exhaust the retry. |
| **F6 — time-sensitive sends/reveals** | The long client catch-up sequence is removed, so I withdraw the automatic timelock-rebuild requirement. Filter expired reveal candidates as accepted. A single retry still has no proven ten-second latency bound: `TooLate` remains possible, with a fresh encryption on a later player send as B-22 describes. |

One correction to point 6: an oversized operation does **not necessarily fail with `Backlog`**. Alto admission or sponsorship can reject it with a provider error after estimation, including after `stack.ts:92` adds 50% + 100k. The installed Alto defaults are 16M per operation and bundle, and `aa-stack.ts` does not override them. The same issue applies to a large computed advance, not just the action's four-mission drain.

That does not require another automatic retry path. It means the explanatory text and error handling must distinguish decoded `Backlog`, recognized operation-size limits, and unrelated sponsorship/action errors. Do not promise the `Backlog` message for every oversized operation or relabel every provider failure as queue congestion.

The keeper's 2 s is a delay **after** a tick's reads, decryption and transactions (`keeper.ts:216–222`), not an upper bound on catch-up or reveal latency. “Try again in a few seconds” is reasonable advice, not a completion deadline. I am not requiring a different ordinary-client recovery algorithm on that basis.

### 2. Is retrying the same working copy sound, or can it replay or double-count work?

**Sound as a bounded hint, provided the existing commit protections survive. It is not an exact reconstruction of the chain.** B-08 makes extra `advance` budget harmless to game state, B-22 makes racing reveals idempotent, and ordinary actions still enforce the actual queue on chain.

Keep these boundaries explicit:

- Count with `sim.processDue(cloneWorld(w), T, Infinity)`. Do not retain the fully processed counting clone as `w`, and do not apply attempted prefixes from an atomic failed operation. Otherwise uncommitted work is treated as committed.
- For plain calls, obtain a reliable failing index for confirmed pre-broadcast estimation rejection as well as mined reverts. Apply only calls before that index. Preserve decoding and cancellation causes; an uncertain broadcast or receipt timeout is not evidence that a call failed.
- Preserve `landed > front.length`: if any original call landed before a later call failed, throw instead of replaying the original call array. This applies even when the original calls include setup or account-management calls.
- Accumulate committed reveal IDs across attempts. If a reveal commits and the later action hits `Backlog`, the next plan normally omits that reveal; returning only the final plan's IDs loses it. A subsequent empty plan should return that accumulated result, not unconditionally `[]`.

The existing `apply(w, at)` uses the attempt's planning timestamp, not each receipt's inclusion time. A healthy keeper may also have processed different missions before the committed advance. Thus the copy can overcount, undercount, or model a reveal at the wrong second. That is within the accepted stale-plan limitation for an ordinary send; it cannot justify claiming an exact recount. It does not by itself replay a player action when the index and original-call guard are correct.

The real `DevSigner` probe still reproduces the unfixed F2 sequence `train, advance, train, train`. The new retry limit reduces the number of opportunities; it does not fix the duplicate.

### 3. Is removing the empty-plan branch safe for arrival reveals and order holds?

**Yes, remove the synthetic `Backlog` branch, while retaining the no-useful-work early return.** On an unchanged world at T, the complete pop count drains all initially due work in the planner. Each accepted parked reveal then introduces its public mission at T; the next reveal drains it, and its return is later than T. There is no simulator gas shortage to justify the synthetic retry.

- If there are no original calls and no accepted reveals, submit nothing, even if `n > 0`. That includes an `OutOfOrder` hold, unknown plaintexts, filtered expired missions, and a fresh-chain clock that has not reached the arrival. A positive count alone must not make the arrival effect pay for unrelated work.
- If a reveal is accepted behind the computed advance, submit it normally. A real estimation or inclusion `Backlog` still gets the executor's one retry.
- An actual `OutOfOrder` caused by an unseen predecessor is not `Backlog`; end that attempt and leave later recovery to a subsequent action or the keeper. Repeated advances cannot remove a parked predecessor's order window.
- Keep actual-time eligibility, the live-session/no-surprise-prompt check, and `busy`. Do not count from or send reveals selected by the optimistic `project` world: use the raw snapshot and actual chain time, as the existing send path does.

The current tests named “an empty plan for a backlog advances first” should continue to demonstrate successful reveal-only sending, with a computed advance on the **first** submission instead of a synthetic error. Add an explicit positive-count order-hold test asserting zero submissions. The temporary model passes both cases.

“Single attempt at arrival” should mean one invocation of the shared executor per mission once a submission is attempted; that invocation can contain its bounded retry. Keep the current distinction between a mission marked *attempted* after failure and one whose reveal call committed. Waiting without submitting should not consume the attempt.

### 4. Is anything worse with a healthy keeper, and what else should change?

**R1 and R2 are concrete regressions with a healthy keeper.** Both have small fixes that preserve the owner's policy. R3 closes the deployment assumption. Beyond the already accepted signer and expired-candidate fixes, I do not require adaptive advances, unlimited spending, in-send reloads, or automatic timelock rebuilding.

The eventual spec edit needs to cover all affected wording, not just one B-08 sentence:

- B-07 currently says the client advances until caught up; align it with the bounded client and keeper recovery.
- B-08's gas-cap paragraph currently assigns separate `advance(1)` fallback to **both** client and keeper. Remove that client responsibility while preserving the keeper fallback, four-mission action drain, gas guard, and single-mission invariant. “Retries once” means once **on `Backlog`**, with a recomputed prefix on each attempt.
- Clarify B-22's “client advances first” as the computed prefix and bounded retry, keeping parking, reveal/order windows, no early reveal, and grace rules unchanged. Preserve B-26's protective-call exception.
- Add the proposed provider-cap assumption without strengthening the provisional 7M measurement into a universal 4337 guarantee. B-06's lack of a keeper requirement for state correctness can remain: public advancement still permits recovery; the application chooses an operational dependency for convenience and liveness.

For tests, retain the existing atomic/plain and no-early-reveal coverage, strengthen the first-attempt assertions, and add the accepted real-signer estimation regression. Cover exactly two attempts on repeated `Backlog`, confirmed partial-prefix bookkeeping, no original-action replay, grace-boundary filtering, positive-count order holds, R1, and R2. The AA stack should exercise keeper progress without a browser plaintext.

Updating `e2e/backlog.spec.ts`'s wording is insufficient to prove a computed first advance: its keeper and Workshop may already drain the fixture before the final train. Retain it as an integration flow, and assert the count and first submitted call in a deterministic executor test. If the e2e itself must prove that prefix, control the pending queue at the send boundary and observe the submitted transactions.

## Validation

The unchanged targeted suite passes: **2 files, 10 tests**.

```bash
cd apps/web
node node_modules/vitest/vitest.mjs run test/backlog.test.ts test/signer.test.ts \
  --pool=threads --configLoader=runner
```

I reran the earlier real-signer probe, confirming F2 remains present. A separate temporary model of the revised executor, `/tmp/vendetta-backlog-review-2-probe.mts`, checks first-attempt `advance(13)` success for atomic and plain semantics, return-inclusive counts, exactly two `Backlog` attempts, and no submission for a positive-count order hold. It also demonstrates R1 with an injected provider rejection and R2 with actual simulator mission transitions. The revised executor is not implemented in the repository; these probes are policy checks, not production validation. No live bundler, production provider, or gas benchmark was run.
