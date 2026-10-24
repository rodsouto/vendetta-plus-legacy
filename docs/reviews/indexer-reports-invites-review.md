# Review of the indexer reports and invitation scan implementation

Date: 2026-10-23  
Reviewer: Codex  
Scope: `git diff HEAD` on top of `aa9d707c4c62f3723baf2864676f311803cc06d3`, plus the untracked `apps/web/src/chain/reports.ts`.

Two correctness findings remain: a live reorg can make the invitation cache permanently skip a valid invitation across reloads, and the subgraph query can omit a newer battle at the 100-report boundary. The event signature, battle mapping, TTL binary-search bounds and empty-environment overrides checked out.

## Scope and constraints

I read `CLAUDE.md` first and applied B-xx > D-xx > chapters. Review covered the entire requested diff, B-18 and B-26, the contract event and invitation definitions, the reports reader/page, invitation loading and its callers, subgraph schema/handler/manifest, and local, e2e, AA and Arbitrum build wiring. I used `market-escrow-implementation-review.md` as the requested format reference and did not inspect other existing files in `docs/reviews/`.

Using only `VITE_INDEXER_URL`, choosing RPC logs when that setting is empty, limiting indexed history to 100 reports without pagination, showing all players' battles to a visitor without a player, and keeping gameplay independent of the indexer are owner decisions, not findings. IR2 concerns which 100 reports are returned, rather than the accepted limit.

No tracked file or `apps/web/src/chain/reports.ts` was edited. Probes used temporary copies/adapters of the actual source. No Playwright or Docker command was run; no live Graph node or Goldsky endpoint was exercised.

## Findings, ranked by severity

### IR1 — P2: a live reorg can persist an invitation omission under a valid new block hash

**Locations:**

- `apps/web/src/chain/load.ts:335`: an existing in-memory entry bypasses the entire hash and head-height validation branch.
- `apps/web/src/chain/load.ts:339`: canonical-hash and cursor-beyond-head checks apply only when loading an entry for the first time in the visit.
- `apps/web/src/chain/load.ts:354`: subsequent scans start strictly after the old cursor, including after a replacement of already-scanned blocks.
- `apps/web/src/chain/load.ts:368`: the new head hash is then attached to that incomplete player set and persisted.

**Failing sequence:**

1. An address without a player loads the app on branch A at block 100. It has no invitations, so the cache contains `scanned = 100`, `hash = A100`, and an empty player set.
2. While the page remains open, block 100 is replaced. Branch B's block 100 contains a still-valid `ControllerInvited` from player 2 to this address. The next head is B101, and player 2 is present in the loaded world.
3. The next `pendingFor` call finds its in-memory entry and never compares A100 with B100. It queries only block 101, so it never discovers player 2.
4. It saves `scanned = 101`, `hash = B101`, `players = []`. Reloading now validates B101 successfully and resumes at block 102. The valid invitation remains undiscoverable unless the cache is cleared or the player sends another invitation.

A local rollback/redeploy with the page open has the same defect: an in-memory cursor at 100 survives a new head at 95, skips replacement invitations below 100, and eventually persists a matching new-chain hash after the head catches up. The old implementation's live cursor also lacked reorg recovery, but reloading rebuilt it; persistence newly makes this omission survive reload.

**Evidence:** a temporary probe executed the actual `pendingFor` body with a block/log client adapter and persistent localStorage adapter. It reproduced the A100 → B101 sequence, inspected the saved B101/empty-player entry, and loaded a fresh module to reproduce the continued omission after reload. A second probe reproduced the 100 → 95 rollback, a missed invitation at replacement block 91, and its omission after the new head reached 101 and the module reloaded. Directly loading a mismatched stored hash or a stored cursor above the head did correctly reset; the missing validation is on subsequent calls within the visit.

**Proposed fix:** validate both in-memory and persisted cursors before resuming, resetting when the cursor exceeds the head or its block hash changed. Persist a cursor/hash pair only after verifying the scanned endpoint still belongs to the canonical chain. Add regressions for a same-height replacement, a head rollback and a reload after the first post-reorg poll.

### IR2 — P2: limiting by block before sorting by log index can omit a newer battle

**Locations:**

- `apps/web/src/chain/reports.ts:72`: `first: 100` is applied by the server with only `orderBy: block`.
- `apps/web/src/chain/reports.ts:90`: sorting by `logIndex` happens after the server has already discarded rows outside that page.
- `packages/indexer/src/mapping.ts:123`: battle IDs are transaction-hash/log-index strings, so their lexical order does not encode event chronology.
- `docs/spec/blockchain.md:469`: B-18 promises the player's latest 100 battles.

**Failing sequence:**

1. A player has 99 reports in blocks 101–199, plus two reports in block 100.
2. In block 100, the earlier report has log index 9 and a transaction hash beginning `0xff…`; the later report has log index 20 and a transaction hash beginning `0x00…`.
3. The server orders by block descending and uses its entity-ID tie-break. With descending IDs, the earlier `0xff…-9` record occupies the last available slot, excluding the later `0x00…-20` record.
4. The browser sorts the returned 100 rows by block/log index, but cannot recover the omitted newer report. It displays an older battle instead of the actual 100th-newest one. A batch resolving several battles in one block can create this boundary naturally.

**Evidence:** the actual report-reader body was run against 101 fixture rows, with the mocked server applying block-descending/ID-descending ordering before taking 100. The returned reports included index 9 and omitted index 20. This was a query/selection reproduction, not a live Graph-node run. The tie-break matches Graph Node's upstream `SortKey::sort_expr`, which appends the primary key in the same sort direction; it does not use this entity's `logIndex`. See [Graph Node's scalar sort implementation](https://github.com/graphprotocol/graph-node/blob/master/store/postgres/src/relational_queries.rs).

**Proposed fix:** index a single sortable value encoding both block number and numeric log index, and order the server query by that value before applying the 100-row limit. Keep the accepted limit and lack of pagination. Add a regression with two battles sharing the boundary block and transaction hashes ordered opposite to their log positions.

## What the implementation gets right

The manifest's `Battle` signature exactly matches `IGameEvents.Battle` and `BattleReport` in `contracts/src/core/GameErrors.sol`: three indexed `uint64` fields, a non-indexed building ID, then the nine-field tuple with 21 troop entries, 16 research entries and four resources. Codegen and the AssemblyScript/WASM build pass. The handler retains every input/total plus mission, building, block, timestamp and log index, creates both player relations without resetting existing trade counters, and distinguishes two events from one transaction.

The GraphQL request uses the plural `battles` field, string player IDs, attacker/defender OR filtering, and both required relation selections. The visitor request removes the player variable/filter. Research values stay numbers and large integer quantities are converted with `BigInt`, preserving precision. These shapes agree with [Graph Node's API-schema generation](https://github.com/graphprotocol/graph-node/blob/master/graph/src/schema/api.rs); the remaining ordering defect is IR2.

The RPC path sends separate indexed-topic filters for attacker and defender, deduplicates by block/log position, sorts both components numerically in descending order, and reads each distinct block timestamp once. The page obtains coordinates from the loaded building map and explicitly falls back to the building ID when it is absent, removing the per-report building read.

The TTL cutoff is based on the latest block timestamp and matches the contract/configuration's 604,800-second invitation lifetime. The binary search retains the first block at or after the cutoff, including equal timestamps, never starts before the deployment bound on a fresh scan, and handles a forward Anvil timestamp jump. Including an invitation created exactly at the cutoff is harmless: the state check correctly rejects it at `now == until`. Stable saved scans resume at `scanned + 1`; an initially loaded mismatched hash or cursor beyond the head resets correctly. Reads of current invitation kind, expiry and player epoch still exclude cancelled, expired or invalidated entries.

Explicitly setting `VITE_INDEXER_URL=""` does override a value in `.env`: the installed Vite loader copies matching process-environment entries last, including empty strings. A probe confirmed this in development and production, with conflicting base/mode env files. The local/e2e shell exports and AA stack's final environment merge preserve that override; the Docker-enabled local path replaces it with the local GraphQL URL. The Arbitrum build leaves the setting available from the root env directory. Apart from IR2's latest-100 promise, I found no material inconsistency in the changed B-18/deployment documentation or a new build-wiring defect.

## Coverage and specification follow-ups

There are no committed tests exercising the new report reader, `handleBattle` or `pendingFor` cache/TTL behavior. The existing loader tests cover world reconstruction rather than invitation discovery. Preserve focused regressions for IR1 and IR2, plus the checked TTL equality/deployment bounds, stable resume, topic filtering, duplicate merging and empty-env precedence. Also cover malformed or unavailable localStorage. A live Graph-node smoke test would additionally establish end-to-end event ingestion and execution of the real GraphQL query; compilation and adapters do not establish that integration.

## Verification

Both requested pnpm entry points failed before execution because the sandbox returned `EPERM` from pnpm's Node-version `spawnSync`. I used installed tools directly for their underlying checks. The web chain-loader suite failed during local deployment setup; this is not a complete web-suite pass.

| Command/check | Result |
| --- | --- |
| `pnpm --filter @vendetta/indexer build`; `pnpm test` | Both blocked before running by the pnpm `spawnSync … node --version` error. |
| In `packages/indexer`: `bash scripts/manifest.sh arbitrum-one 0x0000000000000000000000000000000000000000 0`, then `node node_modules/@graphprotocol/graph-cli/bin/run.js codegen` and `… build` | Passed; contract bindings, entity bindings and WASM compiled. No deployment attempted. |
| `npx tsc --noEmit -p apps/web` | Passed. |
| Direct TypeScript checks in `packages/spec-data` and `packages/rules` | Both passed. |
| Direct Vitest run in `packages/rules` | Passed: 6 files, 695 tests. |
| `forge test` in `contracts` | Passed: 21 suites, 158 tests. |
| Direct Vitest run in `apps/web` | 6 files and 32 tests passed. `test/load.test.ts` failed in its `beforeAll` deployment helper; its 3 tests were skipped. |
| In `apps/web`: `VITE_NETWORK=arbitrum node node_modules/vite/bin/vite.js build --outDir /tmp/indexer-reports-review-web-build --emptyOutDir` | Passed, alongside the separate TypeScript check: the underlying Arbitrum web build stages succeed. Vite reported browser-externalized `crypto` in `tlock-js` and bundle-size warnings. |
| Temporary source-body probes and viem ABI probe | Reproduced IR1 and IR2; checked stable reload/hash reset, stored cursor beyond head, cutoff equality, a forward timestamp jump and 75 binary-search bounds with repeated timestamps/deployment bounds; checked RPC filter arguments/dedup/sort/timestamp reuse, GraphQL request/data conversion, handler payload/relations/IDs and Vite empty-env precedence. The ABI probe matched the exact signature and encoded/decoded the real tuple and indexed sides. |
| `bash -n` over the local/e2e/indexer shell scripts; `git diff --check HEAD` excluding `docs/reviews/` | Passed. |

Temporary probe sources and the temporary web bundle were removed. The tracked `git diff HEAD --binary` excluding `docs/reviews/` and the untracked `reports.ts` retained their original SHA-256 hashes. The requested review file is the only intentional repository edit; the allowed indexer build regenerated ignored build artifacts.
