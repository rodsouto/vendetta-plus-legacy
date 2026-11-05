# Vendetta on-chain

Fully on-chain rewrite of the legacy Vendetta PHP game (EVM, Gnosis Chain).

Pre-deployment: no worlds have been deployed on any network yet. Backward compatibility with
earlier storage layouts, ABIs or configuration names is not required. Keep all consumers and
generated artifacts in sync when changing them.

## Where the rules live

- `docs/spec/` is the game specification. Precedence when they disagree:
  `docs/spec/blockchain.md` (B-xx, on-chain) > `docs/spec/decisions.md` (D-xx, target) > chapters (legacy).
- `docs/spec/data/*.yaml` is the source of truth for rulesets, config and test vectors. Most are
  generated from the legacy PHP by `scripts/` (see `docs/spec/README.md`); only `game_config.yaml`
  is hand-written.
- Every game rule implemented in TS or Solidity must be checked against the test vectors.

## Layout

| Path                          | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/spec-data`          | Codegen from the YAML (all output committed): JSON in `generated/` (`.` = rulesets + config, `./vectors` = test vectors, tests only), Foundry fixtures in `generated/fixtures/`, and `contracts/src/generated/<Ruleset>Ruleset.sol`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `packages/rules`              | Rules engine in TypeScript: exact formulas on `bigint` (B-03) and `src/sim/`, the reference simulator of the on-chain state (B-20). `scripts/scenarios.ts` writes `generated/scenarios/` for the differential tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `contracts`                   | Foundry project. `src/Game.sol`: the single UUPS proxy; logic in linked libraries (`src/core/`), formulas in `src/rules/` and `src/combat/`. Deps come from `node_modules` (pnpm), not submodules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `packages/indexer`            | Subgraph for the market history (B-11, B-18: trades, payments, withdrawals) and the battle reports, which the web app reads when built with `VITE_INDEXER_URL` (else from the RPC logs, `src/chain/reports.ts`); the ranking comes from the loaded world. `subgraph.template.yaml` is filled per deployment by `scripts/manifest.sh`; `scripts/local.sh` runs it on a graph-node in Docker (`pnpm dev:local`), `deploy:goldsky` on Goldsky                                                                                                                                                                                                                                                                                                                                                                                              |
| `apps/web`                    | Vite + React SPA (viem, TanStack Query), i18n es/en. `src/chain/load.ts` rebuilds the simulator World from the contract views; the UI projects it live and validates actions in the simulator before sending (B-20). `src/account/` signs: anvil dev accounts, or a passkey Kernel account plus a per-device session (B-15); a player may have several controllers (devices, recovery codes: B-26); network picked by `VITE_NETWORK`. `src/chain/hidden.ts` / `codec.ts`: the single fixed v2 hidden packet on every network; `scripts/keeper.ts` submits verified certificates and retries failures, with persistent signed-transaction journals in `scripts/keeper/`. Game initializes its mandatory consumer configuration at genesis; no v1/migration/activation path exists. Design context in `apps/web/PRODUCT.md` / `DESIGN.md` |
| `application/`, `library/`, … | Legacy PHP. Read-only reference                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Commands

```bash
pnpm install
pnpm codegen            # regenerate JSON, fixtures, Solidity constants and differential scenarios
python3 scripts/generate_target_vectors.py   # regenerate target combat vectors (needs PHP 7.4 + PyYAML)
pnpm test               # all workspaces (needs Foundry: also runs forge test)
pnpm test:contracts     # forge test only
pnpm --filter @vendetta/contracts layout   # record a compatible storage layout change (B-17; pnpm test checks it)
pnpm --filter @vendetta/web dev
pnpm format             # prettier; forge fmt inside contracts/
scripts/ci-local.sh     # the CI steps on a fresh clone of HEAD (no GitHub needed)
pnpm dev:local          # anvil + deploy + indexer (market history; graph-node in Docker, :8500, skipped without Docker) + optional keeper (HIDDEN_PROVER_URL, B-22) + web app on :5173 (dev accounts, time travel in the Workshop page)
pnpm --filter @vendetta/web e2e   # Playwright flow on its own fresh chain (e2e/serve.sh, :5199)
pnpm dev:aa             # anvil + Gnosis Chain's 4337 contracts + Alto + mock paymaster + web app: passkey accounts locally
pnpm --filter @vendetta/web e2e:aa   # Playwright passkey flow (virtual WebAuthn authenticator) on its own 4337 stack (:5198)
pnpm deploy:gnosis    # blocked pending hidden v2 setup approval; future real deploy to Gnosis Chain from .env; writes deployments/gnosis.json (docs/deploy-gnosis.md)
pnpm --filter @vendetta/indexer deploy:goldsky <version>   # subgraph to Goldsky for deployments/gnosis.json
pnpm build:gnosis     # web app for Gnosis Chain (static, apps/web/dist)
pnpm --filter @vendetta/web keeper <deployment.json>   # submits verified certificates and processes due missions
pnpm test:audit-hidden-v2   # source bundle inventory, integrity and publication checks
pnpm audit:hidden-v2 create /outside/repo/hidden-v2-source.tar.gz   # freezes working-tree modern sources, including untracked files
pnpm audit:hidden-v2 verify /outside/repo/hidden-v2-source.tar.gz   # checks bundle integrity; not audit approval
pnpm capacity:hidden-v2 --directory /outside/git/new-run --max-log2 14 --unsafe-test-only   # bounded low-domain phase-1 samples; no game-domain MPC or phase 2
pnpm capacity:cs-hidden-v2 --binary /outside/git/compile-only --binary-sha256 <pin> --source-bundle-sha256 <pin> --directory /outside/git/new-run   # four compile-only workers, kernel address-space/CPU/file limits; no setup
pnpm probe:local-hidden-v2 --directory /outside/git/new-run --unsafe-test-only   # local phase-1 initialization/hash in domains 2^22/2^23; 8 GiB virtual limit, no contributions/keys
pnpm pipeline:local-hidden-v2 contribute --directory /outside/git/new-run --log2 22 --unsafe-test-only   # persisted unsafe local MPC with per-worker limits; verify/continue/seal and phase2 commands require pinned prior receipts
pnpm model:phase2-hidden-v2 --compile-report /path/report.json --compile-report-sha256 <pin> --output /outside/git/new-model.json   # allocation inventory, not measured peak RAM or phase 2 execution
pnpm inspect:mpc-hidden-v2 --shape /path/shape.json --shape-sha256 <pin> --transcript /path/contribution.bin --transcript-sha256 <pin> --max-bytes 65536   # bounded streaming framing/hash only; no native decoding or production approval
pnpm rehearse:hidden-v2 --directory /outside/git/new-run --unsafe-test-only   # fixed tiny MPC, offline build, separate processes; no production approval
pnpm ceremony:hidden-v2 inspect-plan --plan /path/plan.json --plan-sha256 <pin>   # offline design validation; VENDETTA_GO_BIN selects the Go SDK
pnpm ceremony:hidden-v2 inspect-execution --plan /path/plan.json --plan-sha256 <pin> --execution /path/execution.json --execution-sha256 <pin>   # proposal only; no MPC execution
pnpm ceremony:hidden-v2 verify-review --plan /path/plan.json --plan-sha256 <pin> --trust /path/trust.json --trust-sha256 <pin> --review /path/review.json   # design-review signatures only
```

## Rules

- Gotcha: if `forge test` suddenly runs only a few suites after `pnpm codegen`, run `forge clean` (stale build cache).

- Hidden v2 production is still blocked: the only supported producer setups are unsafe local keys
  with explicit opt-in on chain IDs 1337/31337. A manifest declaring `unsafeLocalSetup: false`
  is rejected until secure setup provenance and independent approval are implemented. Native MPC
  compatibility also passed the full invalid-point game circuit locally, including native
  proving and Solidity verifier/consumer checks. Opening's native initialization stopped
  under probable host memory pressure; an experimental disk-backed adapter now passes
  byte-for-byte native initialization/key comparisons and proof tests on small circuits.
  Both full game circuits completed the unsafe local MPC protocol on this PC.
  Opening initialization used an experimental staged adapter (2.92 GiB peak RSS);
  reduced-copy sealing produced new keys, and three fresh native proofs passed
  actual consumers/Game/H3 and punctual/delayed full-World equality on private Anvil.
  Exact small-circuit native key comparisons pass; this is not independent audit
  or secure setup provenance. See the local-mpc-staged benchmark for measured scope.
  Use pinned cache indices or a completed initialization to resume local stages. Deploy.s.sol permits only 1337/31337 and
  deploy:gnosis aborts before reading secrets or contacting RPC. The unsafe MPC rehearsal
  uses a fixed tiny circuit, ephemeral test identities and archived authenticated beacons;
  it does not establish independent participation or post-closure randomness. See `docs/proposals/hidden-v2-production-readiness.md`.

- Storage (`contracts/src/core/GameStorage.sol`) must stay upgrade-compatible (B-17): new fields only at the
  end of a struct, no enums, and a stored constant code (`ATTACK`, `CAPO`…) never changes or gets
  reused. Before the first deploy a reordering can be recorded with
  `node contracts/scripts/storage-layout.mjs --update --force`; never after.

- Never edit generated files by hand (`packages/spec-data/generated/`, `contracts/src/generated/`, generated YAML/MD in `docs/spec/`).
- Code, comments and identifiers in English. UI texts go through i18n (es, en).
- The engine reads ruleset `roles`, never entity names (D-21).
- `packages/rules/src/sim` and `contracts/src/core` implement the same state machine. Change both
  together: `contracts/test/core/Scenarios.t.sol` replays the TS scenarios and must match exactly.
