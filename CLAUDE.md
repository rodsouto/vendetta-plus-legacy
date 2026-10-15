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
| `packages/rules` | Rules engine in TypeScript: pure, deterministic, `bigint` + fixed point |
| `contracts` | Foundry project; OpenZeppelin UUPS modules. Deps come from `node_modules` (pnpm), not submodules. `src/combat/`: pure combat library (exact integer math, B-03) |
| `apps/web` | Vite + React SPA, i18n es/en |
| `application/`, `library/`, … | Legacy PHP. Read-only reference |

## Commands

```bash
pnpm install
pnpm codegen            # regenerate JSON, fixtures and Solidity constants after editing docs/spec/data
python3 scripts/generate_target_vectors.py   # regenerate target combat vectors (needs PHP 7.4 + PyYAML)
pnpm test               # all workspaces (needs Foundry: also runs forge test)
pnpm test:contracts     # forge test only
pnpm --filter @vendetta/web dev
pnpm format             # prettier; forge fmt inside contracts/
```

## Rules

- Never edit generated files by hand (`packages/spec-data/generated/`, `contracts/src/generated/`, generated YAML/MD in `docs/spec/`).
- Code, comments and identifiers in English. UI texts go through i18n (es, en).
- The engine reads ruleset `roles`, never entity names (D-21).
