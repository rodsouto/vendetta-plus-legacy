# Review of the market escrow implementation

Date: 2026-10-22  
Reviewer: Codex  
Scope: `git diff HEAD` on top of `0f2dd749e7a89304bf431695020e6803a2781784`, plus the untracked `apps/web/e2e/market.spec.ts`.

The escrow implementation follows the main economic rules, and I found no reproduced resource-creation exploit or contract/simulator transition mismatch. Four client/history findings remain: a withdrawal form can keep submitting an invisible, exhausted resource; payment history is overwritten; the new errors have no translations; and offer events omit newly material terms.

## Scope and constraints

I read `CLAUDE.md` first, the proposal and Codex reply, and the updated D-19, D-26, B-09, B-11 and YAML configuration. B-xx takes precedence. Review covered the simulator and core contracts, entry points/storage/errors, scenario generator and Solidity replay, market unit tests, the requested web pages and loader, both translations, and the indexer schema, handlers and manifest.

The unlootable escrow vault, withdrawals without expiry, tiny-trade deposit rounding, one source building per offer, and both parties' vacation locks are owner decisions, not findings. Multi-account accumulation does not violate a per-player cap. The caller-only gate also intentionally allows another player to accept an already pending offer from a seller with final shares left.

Generated files were excluded from substantive review. I regenerated the spec outputs, scenarios and ABI and compared their hashes with the initial working tree. They were unchanged. No implementation or specification changes remain from this review; temporary probes were removed.

Validation uses fresh deployments, as the repository tests do. This is not a storage-compatible in-place upgrade of the old market: `Trade` changes representation, `Player` removes `debts`, and removing `CoreState.owes` moves subsequent mapping slots (`contracts/src/core/GameStorage.sol:77`, `:127`, `:192`). No populated deployment or migration was assessed. Deploying this over populated old storage would require a separate migration review.

## Findings, ranked by severity

### IR1 — P2: a repeated withdrawal includes an exhausted resource whose input has disappeared

**Locations:**

- `apps/web/src/pages/Market.tsx:308`: custom amounts remain in `edited` across successful withdrawals and refreshed trade props.
- `apps/web/src/pages/Market.tsx:311`: only resources with a positive share get an input.
- `apps/web/src/pages/Market.tsx:312`: the submitted vector still reads custom amounts for every resource, including hidden inputs.
- `apps/web/e2e/market.spec.ts:94`: the new test exercises one default withdrawal, so it misses this sequence.

**Failing sequence:**

1. A fully paid trade entitles the buyer to 300 weapons and its 10-dollar deposit. Its destination has sufficient room.
2. The buyer edits the weapons input to `100` and the dollars input to `10`, then withdraws successfully.
3. The refreshed share is `[200, 0, 0, 0]`. The form stays mounted because weapons remain. Its dollar input disappears.
4. Click Withdraw again. The vector is still `[100, 0, 0, 10]`, so preflight fails with `InvalidWithdrawal`. Editing the remaining weapons field cannot clear the invisible dollar amount.

Navigating away and back resets the form, so this does not destroy the entitlement. It breaks the intended repeated-withdrawal flow and can delay clearing `SharesLeft`.

**Evidence:** a temporary probe transpiled and executed the actual `WithdrawForm` body with retained hook state, a minimal JSX adapter, and the real simulator. It observed the first successful withdrawal, a single remaining input with value `100`, and the second submission above failing with `InvalidWithdrawal`. This was a component-body/simulator reproduction, not a browser reproduction.

**Proposed fix:** clear custom amounts after a successful withdrawal and ensure resources with no remaining share always submit zero. Reconcile edits when refreshed entitlements change, including changes made from another device. Add a browser regression with an edited, multi-resource withdrawal followed by another withdrawal without remounting the page.

### IR2 — P2: the indexer retains payment totals but loses the individual payment history required by B-18

**Locations:**

- `packages/indexer/src/mapping.ts:75`: `handleTradePaid` overwrites `Trade.paid` and stores no payment entity.
- `packages/indexer/schema.graphql:42`: the schema exposes cumulative payment totals and withdrawal records, with no payment collection.
- `docs/spec/blockchain.md:458`: the indexer is required to keep every payment as part of market history.

**Failing sequence:**

1. Accept an offer for 300 weapons at a price of 100 dollars.
2. One transport pays 40 dollars. A later transport pays another 60. The contract emits `TradePaid` with cumulative totals of 40 and 100 respectively.
3. After indexing both events, the stored trade only has `paid = 100` and `complete = true`. There is no payment record containing the first 40, either event's transaction/log identity, or its block/time.
4. A consumer cannot retrieve the two installments from the market-history schema. The current entity state does not distinguish them from one 100-dollar payment.

The rewritten handler carries forward the old totals-only settlement model. The new withdrawal handler correctly uses separate immutable records; payments need the equivalent treatment. On-chain logs remain available, so this is an indexer/spec mismatch, not lost escrow or incorrect completion accounting.

**Evidence:** executing the actual handler source against an in-memory entity adapter with these two payment events left exactly two `Player` entities, one `Trade`, and no payment records. The final paid total and completion counters were correct. The subgraph also compiled successfully; compilation cannot detect this missing history.

**Proposed fix:** add an immutable `Payment` entity keyed by transaction hash and log index, related to the trade, recording the event's block/time and cumulative totals and/or credited delta. Keep `Trade.paid` as the current aggregate. Add a handler regression that checks both payment records and that completion increments only once.

### IR3 — P3: the three new market errors have no English or Spanish messages

**Locations:**

- `apps/web/src/i18n/en.json:339` and `apps/web/src/i18n/es.json:339`: neither dictionary contains `InvalidWithdrawal`, `SharesLeft` or `TooManyTrades`; the obsolete `InDebt` and `InvalidClaim` messages remain at lines 358 and 360.
- `apps/web/src/state/game.tsx:365`: simulator errors are translated without a fallback.
- `apps/web/src/state/game.tsx:340`: decoded contract errors instead fall back to the generic transaction-failed message.

**Failing sequence:**

1. Accept ten trades as buyer while they remain open, then try to accept an eleventh. The UI does not disable acceptance based on the buyer cap.
2. Preflight correctly throws `TooManyTrades`, but the toast displays `errors.TooManyTrades` in either language.
3. Alternatively, enter a withdrawal amount above the available share. The toast displays `errors.InvalidWithdrawal`. A contract-side race producing a new error loses its explanation behind the generic fallback.

**Evidence:** the real i18next implementation, initialized separately with each checked-in dictionary, returned all three literal `errors.…` keys.

**Proposed fix:** add actionable messages for all three errors in both languages, remove the unused debt/claim messages, and cover the new error names in a translation-completeness check. Explain that final shares must be withdrawn, that the buyer cap is ten, and that withdrawal amounts must fit both entitlement and capacity.

### IR4 — P3: offer history omits the source building and immutable rate values

**Locations:**

- `contracts/src/core/GameErrors.sol:156`: the event promises to carry the terms without reconstruction calls, but `TradeOffered` has no source building and carries only a rate index.
- `contracts/src/core/Market.sol:215`: the stored trade includes `from` and snapshots the matched rate values; the event at line 223 omits those values.
- `packages/indexer/src/mapping.ts:47` and `packages/indexer/schema.graphql:34`: indexed offers retain only the old economic fields and numeric rate index.

**Failing sequence:**

1. A seller creates otherwise identical offers from two different owned buildings. Each offer authorizes a different eventual stock debit.
2. Cancel both pending offers. Their contract records are deleted.
3. The indexed history cannot identify either source building, and replaying the market events cannot recover it. The new source term is absent from both representations.
4. Separately, if a future configuration changes the meaning of rate index zero, old indexed offers still contain only zero, while the contract's accepted trades retain their original rate values. A consumer using the new table can misvalue historical partial payments.

The source-building omission exists now. The rate-history problem is conditional on a later rate-table change; it does not reprice current on-chain entitlements.

**Proposed fix:** include `fromBuilding` and the matched rate vector, or an immutable rate-version identifier, in the offer event and indexed trade. Update the manifest and regeneration inputs accordingly. Test cancelled offers from different sources and retention of old rate terms across a configuration-version change.

## What the implementation gets right

The YAML gives a 10% deposit, a five-day payment window and independent seller/buyer caps of ten. The simulator and Solidity both debit the seller's goods and the buyer's deposit atomically at acceptance, after ownership checks and local settlement. Rates are copied at offer time; the deadline and original deposit are stored at acceptance. Entitlements use cumulative paid amounts and original deposits, then subtract cumulative withdrawals.

I compared check order on the shared ABI input domain:

| Action | Order in both implementations |
| --- | --- |
| Offer | Global drain; caller activity; buyer/resource/quantity/price/rate validation; source ownership; both-list gate; seller cap. |
| Accept | Drain; caller activity; trade/buyer validation; seller activity; both-list gate; buyer cap; both buildings' ownership; seller then buyer settlement; affordability; escrow debit and acceptance. |
| Withdraw | Drain; caller activity and destination ownership; accepted-trade/party validation; destination settlement; entitlement/capacity and nonzero-amount checks. Destination ownership therefore precedes trade validity. |
| Public payment | Drain; caller/source and target checks; payable-trade validation; mission cap; local settlement and troop-rest checks; troop/cargo/salary validation; computed-arrival deadline check. |

The simulator's additional negative-value/vector-length checks concern values the Solidity ABI cannot represent. I found no differing custom-error precedence for shared inputs. Scenario action arguments, the replay's error-name mapping, both player lists, and all new trade snapshot fields agree.

Finality is inclusive for delivery: payment can arrive at `closesAt`; unpaid expiry is `now > closesAt`. Queued payments settle at their scheduled arrival, even when processed later. The normal drain precedes gates and withdrawals. Full payment finalizes early; surplus shipments remain ordinary deliveries and cannot increase paid amounts past the price. Recall returns through the home-arrival path and does not pay.

D-26 still credits payment independently of the recipient's free storage or the continued existence/ownership of the destination. Hidden missions cannot acquire a trade ID. Withdrawal checks only the acting party's activity, and uses `floor((capacity - stock) / STOCK_SCALE)`. Both parties retain their vacation timestamp lock after early completion. Old debt actions, counters, transport restrictions, views and indexer entities were removed from the active implementation. The loader copies the new rate, deadline, deposit, withdrawal counters and purchase list into the simulator world.

## Coverage and specification follow-ups

The generator reproduced 35 scenarios with 7,831 recorded steps and 2,807 expected reverts, including 102 successful acceptances, 170 withdrawals and 150 `SharesLeft` errors. The Solidity replay compares both lists and every new stored trade field after actions, including failed actions. All declared market coverage tags were satisfied.

Those tags do not establish every important boundary. In particular, `packages/rules/scripts/scenarios.ts:1591` tests sending at the deadline, which is already too late; it does not explicitly test arrival exactly at the deadline or one second beyond it. The generated run reported zero successful abandons, so it does not establish the abandoned/reoccupied-target case of D-26. The new e2e covers one full-payment/default-withdrawal path, and the existing chain-loader tests contain no market trade.

These are useful permanent additions, rather than additional reproduced production findings:

- Preserve the five temporary contract regressions described below, especially exact-deadline delivery drained after expiry and more payment after an earlier goods withdrawal.
- Add acceptance cases for an insufficient buyer deposit, a source lost after offering, queued payments taking stock during local settlement, and complete rollback when acceptance fails.
- Add focused D-26 abandoned/reoccupied-target tests; B-26 transfer with retained escrow, caps and withdrawal rights; and fractional-stock capacity boundaries.
- Exercise zero-current-share trades remaining indexed while open, both-list pruning after final withdrawal, and acceptance of a blocked seller's previously pending offer. Check the vacation lock after early full payment.
- Add market reconstruction coverage to the loader test and handler tests to the indexer. A successful build does not exercise the history requirements.

The B-xx text resolves the main economic ambiguities from the proposal, including strict post-deadline expiry, caller activity on withdrawal, immutable terms and the caller-only gate. I found no further economic specification gap requiring reversal of the owner's decisions. The representation of complete offer terms in history needs the clarification in IR4.

## Verification

The normal `pnpm test` entry point failed before running suites because the sandbox returned `EPERM` from pnpm's Node-version `spawnSync`. I used the installed tools directly. RPC-backed web tests completed their attempted run before Playwright started.

| Command/check | Result |
| --- | --- |
| `node ../../node_modules/typescript/bin/tsc -p tsconfig.json` in `packages/spec-data`, `packages/rules` and `apps/web` | All passed. |
| `node node_modules/vitest/vitest.mjs run` in `packages/rules` | Passed: 6 files, 691 tests. |
| `forge test` in `contracts` | Passed: 21 suites, 154 tests, including all differential scenario groups. |
| `node node_modules/vitest/vitest.mjs run` in `apps/web` | 5 files and 24 tests passed. The chain-loader suite failed during local deployment setup; its 2 tests did not run. Not a full web-suite pass. |
| `node --import ./packages/rules/node_modules/tsx/dist/loader.mjs packages/spec-data/scripts/build.ts`, then the same loader with `packages/rules/scripts/scenarios.ts` and `apps/web/scripts/abi.ts` | Passed; every checked generated file and the ABI matched its pre-review hash. Contract compilation also passed. |
| `bash scripts/manifest.sh arbitrum-one 0x0000000000000000000000000000000000000000 0`, then `node node_modules/@graphprotocol/graph-cli/bin/run.js codegen` and `… build`, in `packages/indexer` | Passed; generated bindings and WASM compiled. No hosted Graph node was exercised. |
| `node node_modules/@playwright/test/cli.js test e2e/market.spec.ts` in `apps/web` | Could not run the test: sandbox `Operation not permitted` errors prevented the local Anvil/RPC server from starting. |
| Temporary component/i18n/indexer probe, run through the installed tsx loader | Reproduced IR1, IR2 and IR3 as described above. Also checked implemented share conservation for 124 valid small offers and 3,784 payment states; passed. |
| `forge test --match-contract MarketReviewProbe --match-test test_review -vv` with a temporary test file | All 5 passed: exact-deadline arrival plus delayed gate/drain; one-second-late rejection; further payment after partial withdrawal; recalled payment pays nothing; tiny mixed-price deposit rounding. |
| Direct Prettier check over `packages/**/*.{ts,tsx,json}` and `apps/**/*.{ts,tsx,json}`, using `.prettierignore`; `forge fmt --check`; `git diff --check HEAD` | Passed. |

Temporary probe sources were deleted. The original tracked `git diff HEAD --binary` remained byte-for-byte unchanged, and generated hashes remained unchanged. This review file is the only lasting addition from the review.
