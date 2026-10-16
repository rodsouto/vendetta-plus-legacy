# Deploying to Arbitrum One

How to put the game on Arbitrum One (B-01) with passkey accounts and sponsored gas (B-15, B-16),
and its indexer on Goldsky (B-18).
There is no testnet stage: the local 4337 stack (`pnpm dev:aa`, `pnpm --filter @vendetta/web e2e:aa`)
covers testing, and everything here spends real money.

## What you need

All of it goes in `.env` at the repo root (`cp .env.example .env`; it is git-ignored).

| Variable | What | Where it ends up |
|----------|------|------------------|
| `DEPLOYER_PRIVATE_KEY` | A fresh key used only to deploy, with ~0.005 ETH on Arbitrum One | Deploy script only |
| `ADMIN` | Owner of the `Game`: upgrades, suspensions, premium. A Safe (B-17); empty = the deployer | On-chain |
| `ARBITRUM_RPC_URL` | RPC to deploy through; empty = `https://arb1.arbitrum.io/rpc` | Deploy script only |
| `ETHERSCAN_API_KEY` | Etherscan v2 key (covers Arbiscan) to verify the sources; optional | Deploy script only |
| `VITE_PIMLICO_API_KEY` | Pimlico API key: bundler and paymaster | **Public** JS bundle |
| `VITE_PIMLICO_POLICY_ID` | Sponsorship policy (`sp_...`) that caps spending | **Public** JS bundle |
| `VITE_RPC_URL` | RPC for reads; empty = the public one in `deployments/arbitrum.json` | **Public** JS bundle |
| `VITE_INDEXER_URL` | GraphQL endpoint of the subgraph on Goldsky (step 3); empty = no ranking | **Public** JS bundle |

Only `VITE_*` variables reach the browser; the deployer key never does.

## 1. Pimlico

1. Create an account at [dashboard.pimlico.io](https://dashboard.pimlico.io) and a paid plan (B-16),
   then load balance: sponsored gas is paid from it.
2. **API key** (API Keys page): restrict its **origins** to the site's domain, and enable only
   bundler and paymaster methods. Origins stop other websites, not scripts (the header can be
   forged), so this is a speed bump, not a lock.
3. **Sponsorship policy** (Sponsorship Policies page): chain allowlist **Arbitrum One (42161)** only,
   and limits (USD):
   - per user operation: **$0.50** (an account creation costs ~1.2M gas, the most expensive
     operation; a normal action ~0.2M);
   - per user, daily: **$0.50**;
   - global, daily: **$5** to start; raise it with real players.

   A "user" for Pimlico is the operation's sender: the passkey account when creating an account or
   renewing a session, the device's session account for game actions. Anyone can create senders, so
   the per-user limit does not stop abuse; the **global** limit is the real bound.
4. Copy the key and the policy id into `.env`.

Open questions to settle in the dashboard before launch (the docs do not say): whether an operation
that names **no** policy is still sponsored with the key (someone could take the key from the bundle
and skip the policy), and whether the account balance can be capped. Policies cannot restrict the
target contract, so if unpolicied sponsorship exists, keep the balance low or move the key behind a
proxy of our own (Pimlico documents this).

## 2. Deploy the contracts

```bash
pnpm deploy:arbitrum
```

The script checks that the RPC is Arbitrum One and that `contracts/` has no uncommitted changes,
shows the deployer, its balance and the admin, simulates the deploy (about 29M gas, ~0.0012 ETH at
0.04 gwei), and asks before broadcasting (type `deploy`; `--yes` skips the question). It deploys the
linked libraries, the `Game` implementation and its UUPS proxy, and the `PasskeyDirectory`, verifies
them on Arbiscan when `ETHERSCAN_API_KEY` is set, and writes `deployments/arbitrum.json` (addresses,
first block, commit). It refuses to run if that file exists.

Commit `deployments/arbitrum.json`. After that the deployer key has no role unless it is the admin;
if `ADMIN` was empty, transfer ownership to a Safe as soon as possible.

## 3. Indexer on Goldsky

The ranking comes from a subgraph (`packages/indexer`, The Graph format) hosted on
[Goldsky](https://goldsky.com) (B-18). Create an account and an API key, install the CLI and log in:

```bash
curl https://goldsky.com | sh
goldsky login
pnpm --filter @vendetta/indexer deploy:goldsky 1.0.0
```

The script fills in the `Game` address and first block from `deployments/arbitrum.json`, builds the
subgraph, deploys it as `vendetta/1.0.0` and points the `prod` tag at it. Put the tag's GraphQL
endpoint (`goldsky subgraph list`) in `VITE_INDEXER_URL`. A later version (after an upgrade that
changes the events) gets a new number and the same tag, so the web app keeps its URL; the tag moves
right away, and the ranking is incomplete until the new version has synced from the first block.

## 4. Build and host the web app

```bash
pnpm build:arbitrum     # VITE_NETWORK=arbitrum, reads .env and deployments/arbitrum.json
```

`apps/web/dist/` is a static site (hash routing, no server). Any static host works; add its domain
to the API key's allowed origins. Passkeys are bound to the domain (WebAuthn relying party): moving
to another domain loses access for existing passkeys, so pick the final domain first.

## Running costs

Measured on the local stack (`actualGasUsed`): create an account ~1.16M gas, renew a session
~0.61M, the first action of a session ~0.35–0.46M, then ~0.17M per action. At 0.01–0.04 gwei that is
roughly a cent per action, plus Pimlico's surcharge.

## Known limits

- The Reports page reads `Battle` events straight from the RPC, only the last 5M blocks (about two
  weeks; the public RPC allows 10M per query). Older reports are not shown.
- The ranking shows stored points (B-19): a player whose queues finished but who has not acted since
  (lazy settlement, B-06) ranks with the points of their last settlement.
- `PasskeyDirectory` has no owner and no upgrades: a new version means a new deploy and a new
  address in `deployments/arbitrum.json`. Existing entries would not carry over.
