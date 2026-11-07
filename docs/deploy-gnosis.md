# Deploying to Gnosis Chain

**Deployment is blocked pending hidden v2 setup approval.** `pnpm deploy:gnosis`
exits before reading `.env` or contacting RPC, including with `--yes`.
`Deploy.s.sol` independently rejects every chain except local 1337/31337. There
is no operator flag to bypass this policy. The procedure below is retained for
the future approved deploy path; it is not currently executable on Gnosis.

Production network: **Gnosis Chain, chain ID 100**. Gas is paid in **xDAI**, not GNO or ETH.
The player uses passkeys and sponsored operations; network details stay out of the game UI.
The contract deployment, keeper and provider setup spend real money. Local verification uses
`pnpm dev:aa` and `pnpm --filter @vendetta/web e2e:aa`.

## Configuration

Copy `.env.example` to `.env` at the repository root. The file is git-ignored.

| Variable                        | Purpose                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `DEPLOYER_PRIVATE_KEY`          | A dedicated deployer funded with xDAI on Gnosis                                                           |
| `ADMIN`                         | Admin role of Game: upgrades and assigns roles (B-17); use a Safe in production. Empty means the deployer |
| `OPERATOR`                      | Operator role: grants premium (B-25). Empty means `ADMIN`                                                 |
| `ARBITER`                       | Arbiter role: suspends players (B-14). Empty means `ADMIN`                                                |
| `GNOSIS_RPC_URL`                | Deployment RPC; defaults to `https://rpc.gnosischain.com`                                                 |
| `VITE_PIMLICO_API_KEY`          | Public browser key for sponsorship and ordinary bundling on chain 100                                     |
| `VITE_PIMLICO_POLICY_ID`        | Sponsorship policy restricted to Gnosis and the intended spending limits                                  |
| `HIDDEN_OPENING_CONSUMER`       | Predeployed reviewed full opening consumer; required at genesis                                           |
| `HIDDEN_INVALID_POINT_CONSUMER` | Predeployed reviewed invalid-U consumer; required at genesis                                              |
| `VITE_RPC_URL`                  | Public read RPC override; defaults to the committed deployment RPC                                        |
| `VITE_INDEXER_URL`              | Goldsky GraphQL endpoint; empty uses recent RPC battle logs                                               |
| `KEEPER_PRIVATE_KEY`            | Keeper account funded with xDAI; server only                                                              |
| `HIDDEN_PROVER_TOKEN`           | Bearer token with prove scope, assigned by the certificate-service operator; server only                  |
| `HIDDEN_PROVER_URL`             | Certificate-service endpoint; server only, prepares the proof and required H3 prefix                      |

Only `VITE_*` variables enter the public web bundle. Never put private keys in them. API credentials
embedded in URLs must be safe for public use and restricted appropriately.

## Mandatory v2 certificate infrastructure

Every world initializes directly with v2 consumers. No deployment or client falls back to v1, a
plaintext local packet, direct reveal or timeout cancellation. Deploy.s.sol requires both consumer
addresses and validates code presence on local chains; their verifier semantics, setup and mutability must be
reviewed separately. The archived experimental setup is not a production setup.

The keeper expects a complete certificate service. Its HTTP transport, verification simulation and
submission are implemented, as are real generation/replay for newly admitted Game contexts and
a local resident-worker service. Stages 1–5 are closed locally; production remains blocked on
[stage 6](proposals/hidden-v2-production-readiness.md). The producer rejects self-declared secure
setups until provenance verification is implemented. Both deployment entry points now block production pending reviewed setup provenance.

Test deployments use a separate DeployTest script with explicit mock consumers, guarded to test
chain ids. Those fixtures exercise the same v2 packet/receipt state machine, not cryptographic
security. Neither production deployment nor normal clients select another hidden protocol.

The old private reveal route is removed. Certificate submissions follow beacon release and use the
ordinary RPC/bundler; the historical attack remains ahead of later drained actions while pending.

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

After an approved artifact registry is implemented and the gates are replaced, the intended script verifies chain ID 100 and the deployed account factories/validators, requires committed
contracts, prints the deployer balance in xDAI and the admin, then simulates. Use that simulation's
estimate to fund the deployer. Type `deploy` to broadcast (`--yes` skips the prompt). It deploys the
linked libraries, Game implementation, UUPS proxy and PasskeyDirectory, and requests source
verification through [Gnosis Blockscout](https://gnosis.blockscout.com) without an Etherscan key.

The script writes `deployments/gnosis.json`: chain ID, public RPC, Game/directory addresses, first
receipt block and commit. It writes this before explorer verification, so a verification outage
does not lose a successful deployment record. It refuses to overwrite an existing deployment. Commit that file. The
deployer has no continuing role unless it holds one; if `ADMIN` was empty, hand the admin role to
the intended Safe with `proposeRole(1, safe)` and, from the Safe, `acceptRole(1)` (and the same for
the operator, 2, and the arbiter, 3, if they defaulted to the deployer).

## Roles, upgrades and freeze (B-17)

Three roles, read with `roleHolder(role)`: admin (1), operator (2), arbiter (3). The admin Safe
assigns any role at once with `setRole(role, account)`, for example to replace a lost or compromised
operator key. A holder hands its own role over with `proposeRole(role, successor)` and the
successor's `acceptRole(role)`; the admin Safe moves to a new Safe this way, never with `setRole`,
so a mistyped address cannot lose it.

The admin Safe upgrades with `upgradeToAndCall(newImplementation, data)` on the Game proxy. Before
proposing one, `pnpm test` must pass on the commit being deployed: it includes the storage layout
check against `contracts/storage-layout.json`. After the first deploy, never record a layout with
`--force`. When the game is final, the Safe calls `setRole(1, address(0))`: the freeze. It cannot be
undone: no more upgrades or role assignments, while the operator and the arbiter keep their powers
and can still hand them over.

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
directories.

## Keeper

```bash
KEEPER_PRIVATE_KEY=0x... HIDDEN_PROVER_URL=https://... HIDDEN_PROVER_TOKEN=... RPC_URL=https://... \
  pnpm --filter @vendetta/web keeper ../../deployments/gnosis.json
```

Run it continuously with access to its RPC and certificate service. It verifies chain identity,
requires a funded keeper key, and processes one mission per advance transaction. The service
returns `{ "certificate": "0x..." }` after preparing the consumer's H3 state. Service, proof or
RPC failures are retried, never converted to invalidity. No mission deadline or forfeit route exists.

Use a dedicated signer and one keeper process per signer/Game. `KEEPER_STATE_DIR` selects
an exclusive persistent directory (default: `$XDG_STATE_HOME/vendetta/keeper`, or
`~/.local/state/vendetta/keeper`). Keep it outside web/static serving roots and preserve it
across restarts: signed transactions are journaled privately
before broadcast and an ambiguous send is settled before reading missions or signing the
next action. RPC calls have a 15-second deadline and receipt waits 60 seconds. The keeper
simulates Game calls and signs them with a 12M gas limit to cover the drain reserve; only
consumed gas is charged. It rebroadcasts the same bytes after a timeout and does not
replace fees or cancel nonces automatically. Do not delete an unresolved journal to unblock
the keeper; an externally replaced or indefinitely pending nonce requires operator recovery.
A receipt records inclusion, not finality. The ciphertext index checks block hashes and
rebuilds from deployment on a reorg. Full keeper/H3 reorg histories remain a local-release
check, separate from these journal/index tests.

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
it does not validate a production bundler, sponsorship policy or proof service.

Without an indexer, reports scan up to 241,920 recent blocks (about two weeks), newest first, in
chunks of at most 5,000 blocks, stopping at the latest 100 battles. Choose a read provider that
supports that range. World loading still reads entities individually and grows with the world.
Drand/prover outages leave missions pending at their original queue position. They never expire;
progress requires the dependencies eventually recovering.
PasskeyDirectory is ownerless and not upgradeable: replacing it requires a new deployment/address.

### Local state ownership

The experimental producer and keeper require Linux and util-linux `flock` on
a trusted PATH. Use private, stable directories on a local filesystem with
working `flock` semantics. Each producer cache and each keeper state directory
permits one cooperating owner, even when deployments differ. Set a distinct
`KEEPER_STATE_DIR` for each simultaneous keeper; defaults are unchanged so existing
journals remain discoverable. Use a dedicated signer per instance: locking does
not prevent the same signer being configured with another directory.

The persistent `.vendetta-state.lock` file must never be removed or replaced,
including during cache cleanup. Its existence does not indicate a running owner;
the kernel lock does. Native producer children inherit the lock, so a killed
parent cannot allow a successor to overlap a surviving child. A hung orphan can
keep the directory unavailable until it exits. An idle Go worker exits on stdin EOF;
a busy orphan can exit on a broken output pipe or later EOF and can leave a
complete proof or a partial `.tmp` file. Existing proofs are revalidated before
reuse; partial files are not accepted and can remain until their path is reused.
Inspect ownership with
`fuser -v /path/to/state/.vendetta-state.lock` and identify the process before any
manual termination; deleting the file bypasses protection. Normal producer close
waits for HTTP, queued jobs and native children before releasing ownership. This
protects local state coordination; it is not cryptographic verification or setup
approval. Production deployment remains blocked.

Signed transaction journals shared by the producer and keeper now synchronize
a fresh temporary inode and its publication directory before any send or retry,
and synchronize directory removal after a confirmed receipt. An `fsync` failure
prevents broadcast. Recovered signed bytes are republished through a new temporary
file before retries; this does not substitute a new nonce. Failed writes can leave
unused `.tmp-*` files, which are never accepted as settled journals. A failure to
synchronize deletion reports the already settled transaction status explicitly.
Storage writeback errors require diagnosing the storage before relying on it.
Provision the stable state directory durably before use;
these operations do not synchronize newly created ancestor directories or prove
power-loss behavior of the storage hardware. No physical power-cut test was run.

### Service supervision preparation

The [persistent service operation guide](service-operations.md) describes direct
Node entry points, cooperative shutdown and the inert systemd templates. Repeated
SIGINT/SIGTERM/SIGHUP request one cleanup; HUP does not reload configuration.
Certificate fetch cancellation does not invalidate a mission. Published transaction
journals settle or remain for the next instance, with the lease held until work ends.
Native worker/inspection environments now inherit only runtime settings, not H3
keys or service tokens. This does not sandbox a trusted binary from every file.
The user-systemd synthetic probes are operational evidence only, with fixture
resource limits; production host hardening/capacity, secure setup provenance and
all real-network deploy gates remain pending. Nothing here installs or enables a
production service.
