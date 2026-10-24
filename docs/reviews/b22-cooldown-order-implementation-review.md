# Review of the B-22 implementation following Claude's response

Date: 2026-10-22  
Reviewer: Codex  
Scope: the current working tree on top of `ad6289c`, including staged and unstaged changes and the new signer test. Generated diffs were excluded from substantive review; codegen reproducibility was checked.

The contract and simulator changes address the main rule issues. One functional client issue remains in development mode. All standard checks run for this review passed, including the isolated full Playwright suite.

## Remaining finding

### IR1 — P2: retry planning does not account for advances committed by a partially failed development-mode send

**Locations:**

- `apps/web/src/state/game.tsx:405–409`: the simulated prefix budget uses `committed`, which only tracks the separate fallback advances.
- `apps/web/src/state/game.tsx:419–425`: after a failed multi-call send, the next plan still uses the original snapshot.
- `apps/web/src/account/signer.ts:116–128`: `sendPlain` sends calls as separate transactions, so an earlier successful advance remains committed when a later call fails.

The planner is correct about rollback for an atomic batch. Development-mode sends have a different rollback boundary. Advances from an earlier ordinary retry can already have changed the real queue, but neither the retained snapshot nor `committed` reflects those changes.

**Concrete reproduction:**

1. Thirteen hidden missions are due, still queued, and inside their reveal grace. Their order windows have expired.
2. The first twelve are garbage. The client knows the plaintext of mission 13, a transport to its building carrying a resource required for training.
3. Before that delivery, the building is slightly short of the training cost. After the delivery, it can afford the training. The normal `project` preflight accepts the action.
4. The client calls `send([train], "actor")` in development mode.

The ordinary retry sequence is:

| Attempt | Planner's prefix budget | Calls sent                      | Real effect                                                                                                                                                                                                                                    |
| ------- | ----------------------: | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial |                       0 | `train`                         | Drain hits `Backlog`; nothing commits.                                                                                                                                                                                                         |
| Retry 1 |                       4 | `advance(4), train`             | Advance commits and leaves nine queued. Training's drain reverts `Backlog`; the advance stays committed.                                                                                                                                       |
| Retry 2 |                       8 | `advance(4), advance(4), train` | Planner still starts from the original thirteen, predicts five remaining, and excludes the reveal. On the actual chain the two advances leave only one queued. Training parks that transport, then fails `CannotAfford`; its drain rolls back. |

The action fails with `CannotAfford` even though the known transport could now be revealed immediately and fund it. The transport remains hidden, with no training queued. Without the funding dependency, an unrelated action can instead succeed while the known reveal is omitted.

**Evidence:** a temporary probe extracts the actual current `revealPlan` and `send` callback bodies from `game.tsx`, transpiles them, and executes them against the real simulator. The signer adapter models either an atomic batch or separate transactions; time is fixed throughout. It also runs the real `project` preflight before the action.

| Signer semantics      | Projection preflight | Send result                 | Transport    | Training   |
| --------------------- | -------------------- | --------------------------- | ------------ | ---------- |
| Atomic batch          | Accepted             | Success; returns mission 13 | Revealed     | Queued     |
| Separate transactions | Accepted             | `CannotAfford`              | Still hidden | Not queued |

This is a callback/simulator reproduction, not a new full browser/chain reproduction. The non-atomic behavior being modeled is explicit in `sendPlain`. It does not establish a production passkey failure.

**Proposed fix:** rebase the next plan onto a fresh per-send snapshot after a partially committed plain-transaction sequence, or have the signer report successful calls and update the working world from them. Counting only the final `advance(1)` fallback is insufficient. Merely awaiting the existing React `refresh()` would not update the snapshot captured by the running callback; the planner must actually receive the refreshed world.

Add a regression that covers both signer semantics and the funding-dependent action. A test with only `poke` would miss the false resource precondition even if it detected the omitted reveal.

Temporary reproduction files:

```text
/tmp/vendetta-b22-implementation-planner-probe.ts
/tmp/vendetta-b22-implementation-planner-probe.log
```

Run in this workspace with:

```bash
pnpm --filter @vendetta/web exec tsx /tmp/vendetta-b22-implementation-planner-probe.ts
```

## Status of the earlier findings

| Earlier issue                             | Assessment of this implementation                                                                                                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1: linear parked-list scan during reveal | Addressed. Solidity checks one predecessor. Linked-list removal and the simulator's ordered removal produce the same observable list. Full-list views remain linear, as discussed previously.                                |
| F2: `Building` layout shift               | Addressed for that struct: `lastReturn` is appended after `training`. The changed `CoreState` layout is intentionally a fresh-deployment baseline; no populated deployed proxy was identified.                               |
| F3: interception lost with 15/15 timing   | Addressed for the documented operating budget: cooldown is 30 seconds, and the specification explains the assumptions and limits. The regression and differential scenario cover a delayed reveal against troops still home. |
| F4: advances behind a draining reveal     | Prefix order and atomic-batch planning are addressed. IR1 remains for partially committed plain transactions.                                                                                                                |
| F5: obsolete bond/garbage documentation   | Main text addressed. One stale test comment remains, noted below.                                                                                                                                                            |
| Development-signer revert decoding        | Addressed. Captured RPC error data now reaches the decoder; the new signer tests pass.                                                                                                                                       |
| Workshop warp concurrency                 | `busy` now spans the warp's reveal work. The previously failing backlog e2e passed in this isolated run.                                                                                                                     |

No new contract/simulator transition mismatch was found. The predecessor condition is valid after a successful drain; a `Backlog` revert still prevents the reveal check from running. Head, middle, tail, and singleton removals are exercised, and the differential replay passes with the new ordering.

## Coverage and smaller follow-ups

The generated differential set now has **35 scenarios**. Scenario 34 records **two `TroopsResting` and three `OutOfOrder` errors**. Its 31 recorded steps have nondecreasing timestamps. This closes the previous zero-coverage gap and includes the defender's own garbage mission.

The following are smaller follow-ups rather than additional production findings:

- `contracts/test/core/Scenarios.t.sol:599` still says the parked list mirrors a “swap-remove”; update it to describe the ordered list.
- The two unit interception regressions try a send at `R+29` and then reveal at `R+16` (`HiddenMissions.t.sol:435–439`, `sim.test.ts:582–585`). Since the later-time send reverts, the state assertions remain useful, but ordering the checks chronologically or using an explicit branch snapshot would make the intended sequence clearer. Scenario 34 already provides the chronological version.
- The implementation summary says unexpected projection failures become a toast. In `run`, the call to `project(...)` is still outside the `try` at `game.tsx:490–491`; the changed catch handles errors from the action checks. If projection-error handling is intended, move the projection inside that protected block. No reachable unexpected projection exception was reproduced here, so this is a discrepancy in the hardening claim rather than a new functional finding.
- Explicit cooldown assertions for recalled/forfeited returns, abandoned origins, station arrivals, and repeated returns remain useful additions. Existing return paths and the state snapshots provide coverage, but the new tests do not add all those dedicated boundary cases.

## Verification

Checks were run sequentially where they deploy chains. `pnpm test` completed before Playwright started; the web unit tests and Playwright did not compete for deployment artifacts.

| Check                                                                                              | Result                                                                  |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm codegen`                                                                                     | Passed; generated files and the web ABI were unchanged by regeneration. |
| `pnpm test`                                                                                        | Passed: 691 rules tests, 153 contract tests, 8 web tests.               |
| `pnpm --filter @vendetta/web exec tsc -p tsconfig.json --noEmit`                                   | Passed.                                                                 |
| `pnpm format:check`                                                                                | Passed.                                                                 |
| `forge fmt --check` in `contracts/`                                                                | Passed.                                                                 |
| `pnpm --filter @vendetta/web e2e --trace on --output /tmp/vendetta-b22-implementation-e2e-results` | All three tests passed; about 2.8 minutes.                              |
| Focused current-planner probe                                                                      | Reproduced IR1; the corresponding atomic-batch case succeeded.          |

The passkey-specific e2e suite was not run. The planner probe's atomic case models transaction semantics; it is not a substitute for that suite.

Logs and Playwright traces are under `/tmp/vendetta-b22-implementation-*` in this workspace. This review retained no game-code changes and did not alter staging or create a commit.
