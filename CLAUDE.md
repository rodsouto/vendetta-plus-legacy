# Vendetta on-chain

Fully on-chain rewrite of the legacy Vendetta PHP game (EVM, Arbitrum One).

## Where the rules live

- `docs/spec/` is the game specification. Precedence when they disagree:
  `docs/spec/blockchain.md` (B-xx, on-chain) > `docs/spec/decisions.md` (D-xx, target) > chapters (legacy).
- `docs/spec/data/*.yaml` is the source of truth for rulesets, config and test vectors. Most are
  generated from the legacy PHP by `scripts/` (see `docs/spec/README.md`); only `game_config.yaml`
  is hand-written.
- Every game rule implemented in TS or Solidity must be checked against the test vectors.

## Layout

| Path | What |
|------|------|
| `packages/spec-data` | Codegen from the YAML (all output committed): JSON in `generated/` (`.` = rulesets + config, `./vectors` = test vectors, tests only), Foundry fixtures in `generated/fixtures/`, and `contracts/src/generated/<Ruleset>Ruleset.sol` |
| `packages/rules` | Rules engine in TypeScript: exact formulas on `bigint` (B-03) and `src/sim/`, the reference simulator of the on-chain state (B-20). `scripts/scenarios.ts` writes `generated/scenarios/` for the differential tests |
| `contracts` | Foundry project. `src/Game.sol`: the single UUPS proxy; logic in linked libraries (`src/core/`), formulas in `src/rules/` and `src/combat/`. Deps come from `node_modules` (pnpm), not submodules |
| `packages/indexer` | Subgraph for the market history (B-11, B-18: trades, payments, withdrawals); the web app does not read it (the ranking comes from the loaded world). `subgraph.template.yaml` is filled per deployment by `scripts/manifest.sh`; `scripts/local.sh` runs it on a graph-node in Docker (`pnpm dev:local`), `deploy:goldsky` on Goldsky |
| `apps/web` | Vite + React SPA (viem, TanStack Query), i18n es/en. `src/chain/load.ts` rebuilds the simulator World from the contract views; the UI projects it live and validates actions in the simulator before sending (B-20). `src/account/` signs: anvil dev accounts, or a passkey Kernel account plus a per-device session (B-15); a player may have several controllers (devices, recovery codes: B-26); network picked by `VITE_NETWORK`. `src/chain/hidden.ts`: hidden missions (B-22: tlock on Arbitrum, plaintext on local chains); `scripts/keeper.ts` reveals them. Design context in `apps/web/PRODUCT.md` / `DESIGN.md` |
| `application/`, `library/`, … | Legacy PHP. Read-only reference |

## Commands

```bash
pnpm install
pnpm codegen            # regenerate JSON, fixtures, Solidity constants and differential scenarios
python3 scripts/generate_target_vectors.py   # regenerate target combat vectors (needs PHP 7.4 + PyYAML)
pnpm test               # all workspaces (needs Foundry: also runs forge test)
pnpm test:contracts     # forge test only
pnpm --filter @vendetta/web dev
pnpm format             # prettier; forge fmt inside contracts/
scripts/ci-local.sh     # the CI steps on a fresh clone of HEAD (no GitHub needed)
pnpm dev:local          # anvil + deploy + indexer (market history; graph-node in Docker, :8500, skipped without Docker) + keeper (reveals hidden missions, B-22) + web app on :5173 (dev accounts, time travel in the Workshop page)
pnpm --filter @vendetta/web e2e   # Playwright flow on its own fresh chain (e2e/serve.sh, :5199)
pnpm dev:aa             # anvil + Arbitrum One's 4337 contracts + Alto + mock paymaster + web app: passkey accounts locally
pnpm --filter @vendetta/web e2e:aa   # Playwright passkey flow (virtual WebAuthn authenticator) on its own 4337 stack (:5198)
pnpm deploy:arbitrum    # real deploy to Arbitrum One from .env; writes deployments/arbitrum.json (docs/deploy-arbitrum.md)
pnpm --filter @vendetta/indexer deploy:goldsky <version>   # subgraph to Goldsky for deployments/arbitrum.json
pnpm build:arbitrum     # web app for Arbitrum One (static, apps/web/dist)
pnpm --filter @vendetta/web keeper <deployment.json> [local|arbitrum]   # reveals hidden missions as they arrive and processes due ones
```

## Rules

- Gotcha: if `forge test` suddenly runs only a few suites after `pnpm codegen`, run `forge clean` (stale build cache).

- Never edit generated files by hand (`packages/spec-data/generated/`, `contracts/src/generated/`, generated YAML/MD in `docs/spec/`).
- Code, comments and identifiers in English. UI texts go through i18n (es, en).
- The engine reads ruleset `roles`, never entity names (D-21).
- `packages/rules/src/sim` and `contracts/src/core` implement the same state machine. Change both
  together: `contracts/test/core/Scenarios.t.sol` replays the TS scenarios and must match exactly.
