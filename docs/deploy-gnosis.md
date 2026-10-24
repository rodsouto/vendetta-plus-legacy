# Deploying to Gnosis Chain

Production network: **Gnosis Chain, chain ID 100**. Gas is paid in **xDAI**, not GNO or ETH.
The player uses passkeys and sponsored operations; network details stay out of the game UI.
The contract deployment, keeper and provider setup spend real money. Local verification uses
`pnpm dev:aa` and `pnpm --filter @vendetta/web e2e:aa`.

## Configuration

Copy `.env.example` to `.env` at the repository root. The file is git-ignored.

| Variable | Purpose |
|----------|---------|
| `DEPLOYER_PRIVATE_KEY` | A dedicated deployer funded with xDAI on Gnosis |
| `ADMIN` | Owner of Game; use a Safe in production. Empty means the deployer |
| `GNOSIS_RPC_URL` | Deployment RPC; defaults to `https://rpc.gnosischain.com` |
| `VITE_PIMLICO_API_KEY` | Public browser key for sponsorship and ordinary bundling on chain 100 |
| `VITE_PIMLICO_POLICY_ID` | Sponsorship policy restricted to Gnosis and the intended spending limits |
| `VITE_REVEAL_BUNDLER_URL` | EntryPoint 0.7 bundler with private user-operation handling and private executor submission |
| `VITE_RPC_URL` | Public read RPC override; defaults to the committed deployment RPC |
| `VITE_INDEXER_URL` | Goldsky GraphQL endpoint; empty uses recent RPC battle logs |
| `KEEPER_PRIVATE_KEY` | Keeper account funded with xDAI; server only |
| `REVEAL_RPC_URL` | Private/encrypted raw-transaction submission endpoint for keeper reveals; server only |

Only `VITE_*` variables enter the public web bundle. Never put private keys in them. API credentials
embedded in URLs must be safe for public use and restricted appropriately.

## Private reveals are a launch dependency (B-22)

Gnosis has a public mempool. A pending reveal exposes the mission target and lets a defender try to
move troops before inclusion. Drand ciphertext alone does not protect a reveal after it is opened.

The browser routes every operation containing a Game `reveal` through `VITE_REVEAL_BUNDLER_URL`,
including any accompanying advance or player action. Sponsorship remains on Pimlico. The reveal
bundler must support our EntryPoint 0.7 accounts, accept the Pimlico paymaster's sponsorship and keep
both the user operation and executor transaction private until ordering is fixed. Ordinary Pimlico
bundling has not been established to provide this guarantee. The app refuses to connect to Gnosis
when this separate route is missing and never retries a reveal through the ordinary bundler.

The keeper uses `REVEAL_RPC_URL` only for reveals and the ordinary RPC for reads, advancement and
forfeits. Its private endpoint must be on chain 100 and must not fall back to the public mempool.
[Shutter's encrypted-mempool infrastructure](https://shutter.network/shielded-trading/) is a candidate,
not a verified integration or an automatically configured provider. A Shutter **raw transaction** RPC
cannot be used as an **ERC-4337 bundler** URL. A public web URL or a successful chain-ID check alone
is not evidence of private submission.

Before opening the world, validate the selected routes end to end: sponsorship interoperability,
transaction ordering/privacy, no public fallback, payload and gas limits, and inclusion latency.
This repository supplies the routing and guards, not a provisioned private bundler service.

Gnosis timing uses a 20-second send margin (20–22 seconds of fixed-arrival slack) and a 15-second
head start before the drand round opens. These are initial budgets for five-second slots, not an
inclusion guarantee. Missed slots, stale RPC heads and provider delay consume that budget. Verify
sender reveals arrive before public decryption and keeper reveals before the 60-second grace ends;
also validate the existing 15-second reveal-order window under actual keeper latency.

## Pimlico

Configure the project for **Gnosis (100)**. The browser uses
`https://api.pimlico.io/v2/100/rpc?apikey=...`. Restrict key origins and API methods. Create a
sponsorship policy restricted to Gnosis, with per-operation, per-sender and global USD limits.
Start with a small global allowance and increase it from observed usage. An origin restriction is
not authentication: scripts can forge the header. A sender limit is not a player limit: one player
uses a passkey account and device-session accounts, and attackers can create new senders.

Confirm how unpolicied requests are billed and rejected in your actual project. Do not assume the
policy ID in the browser prevents callers from omitting it.

[Pimlico billing](https://docs.pimlico.io/guides/pricing) includes API credits plus sponsored gas and
a 10% mainnet gas surcharge. Our local flow used about 1,740 API credits per sponsored operation;
provider responses and polling may change that count. See the [measured comparison](benchmarks/gas-networks-2026-10-23.json).

## Deploy the contracts

```bash
pnpm deploy:gnosis
```

The script verifies chain ID 100 and the deployed account factories/validators, requires committed
contracts, prints the deployer balance in xDAI and the admin, then simulates. Use that simulation's
estimate to fund the deployer. Type `deploy` to broadcast (`--yes` skips the prompt). It deploys the
linked libraries, Game implementation, UUPS proxy and PasskeyDirectory, and requests source
verification through [Gnosis Blockscout](https://gnosis.blockscout.com) without an Etherscan key.

The script writes `deployments/gnosis.json`: chain ID, public RPC, Game/directory addresses, first
receipt block and commit. It writes this before explorer verification, so a verification outage
does not lose a successful deployment record. It refuses to overwrite an existing deployment. Commit that file. The
deployer has no continuing role unless it is also the admin; transfer ownership to the intended
Safe if `ADMIN` was empty.

## Indexer on Goldsky

[Goldsky supports Gnosis](https://docs.goldsky.com/chains/gnosis). Install the CLI and authenticate,
then run:

```bash
pnpm --filter @vendetta/indexer deploy:goldsky 1.0.0
```

The script reads `deployments/gnosis.json`, checks chain ID 100 and generates the subgraph with the
Graph network identifier `gnosis`. It deploys `vendetta/1.0.0` and moves the `prod` tag. Copy the
GraphQL endpoint into `VITE_INDEXER_URL`. A new version must finish syncing before its history is
complete. The game state remains independent of the indexer.

## Build and host

```bash
pnpm build:gnosis
```

This builds the static web app with `VITE_NETWORK=gnosis`, `.env` and `deployments/gnosis.json`.
Use a stable HTTPS domain: passkeys are bound to it. Add that domain to the provider's allowed
origins. The production configuration rejects deployments for another chain, missing account
directories and missing private reveal routing.

## Keeper

```bash
KEEPER_PRIVATE_KEY=0x... REVEAL_RPC_URL=https://... RPC_URL=https://... \
  pnpm --filter @vendetta/web keeper ../../deployments/gnosis.json gnosis
```

Run it continuously with outbound HTTPS to the providers and `api.drand.sh`. It needs funded xDAI
and verifies that its normal and private RPCs use the expected chain. On Gnosis it advances **one
mission per transaction**, rather than assuming four heavy missions fit. The observed block gas
limit on 2026-10-23 was 17M; the 7M mission reserve and ERC-4337's padded limits still need to fit
actual provider limits. Long client backlog operations may fail until the keeper catches up.

## Verification and known limits

```bash
pnpm --filter @vendetta/web test
pnpm --filter @vendetta/web e2e:aa
pnpm build:gnosis
pnpm --filter @vendetta/indexer build
```

The local AA fixture is captured from Gnosis, including Kernel, its WebAuthn/P-256 verifier,
SimpleAccount and EntryPoint. Refresh it with `pnpm --filter @vendetta/web aa:fixture` when needed;
`GNOSIS_RPC_URL` can override its public source. This checks bytecode/account behavior locally;
it does not validate a production bundler, sponsorship policy or private relay.

Without an indexer, reports scan up to 241,920 recent blocks (about two weeks), newest first, in
chunks of at most 5,000 blocks, stopping at the latest 100 battles. Choose a read provider that
supports that range. World loading still reads entities individually and grows with the world.
Drand outages leave only the sender able to reveal; after the grace, unrevealed missions forfeit.
PasskeyDirectory is ownerless and not upgradeable: replacing it requires a new deployment/address.
