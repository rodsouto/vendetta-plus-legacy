# Design review: `pnpm dev:hidden-v2` (local playable experimental stack)

**Verdict:** The design is sound. It needs a handful of concrete fixes before you implement it. Four of them are real hazards that the current code would hit: stale journal reuse, terminal-signal ordering, Vite env leakage, and forge writing into `contracts/`. The rest are integration details the code forces on you. I checked everything against the files you pasted; I did not open anything else in the tree, so items marked *confirm* depend on code I haven't seen.

## Must fix

**1. Deterministic addresses make every journal and stored value ambiguous across runs.**
On a fresh Anvil, the same deployer and nonce sequence produce the same Game address every time. These are all keyed only by chain and address:
- the producer's H3 journal (`h3-31337-<game>-<h3addr>.json`)
- the keeper journal (`keeper-31337-<game>-<addr>.json`)
- the browser's localStorage for origin `127.0.0.1:15173`

A fresh run directory protects the journals only if nothing falls back to a shared path. `keeper.ts` defaults to `~/.local/state/vendetta/keeper` when `KEEPER_STATE_DIR` is unset. Fixes:
- Always set `KEEPER_STATE_DIR` explicitly.
- Create the run directory with non-recursive `mkdir` so an existing directory fails with EEXIST.
- Use a fresh random deployer key per run (via `DEPLOYER_PRIVATE_KEY`, funded from account 0), with `ADMIN`/`OPERATOR`/`ARBITER` explicitly set to account 0. Account 0 keeps the B-17 Workshop roles that `dev:local` gives it. The Game address then becomes unique per run, so stale browser state and journal collisions go away without new code.

**2. Ctrl-C reaches every child at once, which defeats the teardown order.**
pnpm, the orchestrator, Anvil, and the keeper share the terminal's foreground process group. SIGINT hits all of them simultaneously, so Anvil can die before the keeper or producer.
- Spawn Anvil and the keeper with `detached: true` (own process group). Only the orchestrator should receive terminal signals.
- Handle SIGINT, SIGTERM, and SIGHUP (closing a WSL terminal sends SIGHUP).
- Give each teardown step a time bound, then SIGKILL that child's own process group only.
- The cost: if the orchestrator is SIGKILLed, the children are orphaned. That is acceptable here, because the next run fails the port check and the old run directory's logs record the PIDs. Do not add PID-file cleanup logic.

**3. Vite would pull root `.env` values into the browser bundle.**
`envDir: "../.."` loads the root `.env`, which holds deploy secrets and `VITE_PIMLICO_API_KEY`. Any `VITE_*` value there that you don't override ships to the browser. Also, Vite silently moves to the next port unless `strictPort` is set. Recommended inline config:
- `configFile: false` with `react()` imported directly. This avoids the `test` block and the temporary bundled-config file. It may drift from `vite.config.ts` later; that is the trade-off.
- `envDir: <run>/vite-env` (an empty directory).
- `server: { host: "127.0.0.1", port, strictPort: true }`.
- `cacheDir: <run>/vite-cache`.
- `clearScreen: false`.

Set `VITE_NETWORK=local`, `VITE_DEPLOYMENT=<json>`, and `VITE_INDEXER_URL=""` in `process.env` before calling `createServer`.

**4. `forge script` compiles into `contracts/out` and `contracts/cache`.**
`FOUNDRY_BROADCAST` and `FOUNDRY_CACHE_PATH` alone still leave the compile output in the repo. Also, consumers taken from a possibly stale `contracts/out` could differ from the Game that `forge script` recompiles.
- Run one `forge build` with `FOUNDRY_OUT`, `FOUNDRY_CACHE_PATH`, and `FOUNDRY_BROADCAST` all pointing under the run directory.
- Run it *before* starting Anvil, so slow or failing compiles happen first.
- Deploy the consumers from that output, then run `forge script` against the same output. It will be a cache hit, and the consumer and Game builds will be consistent.
- This compiles the game contracts, not the final verifiers, so it stays within your constraint.

## Integration details the code forces

**Producer (`service.ts`)**
- Pass `runtimeFile` explicitly. The default `openingKeys/../verifier-runtime.json` is the wrong place; `compileProducerVerifiers` writes it at the root of the verifiers directory.
- Pass `allowUnsafeLocalSetup` only when the config's opt-in is literally `true`.
- Never pass `beacon`; the authentic drand path must be the only one.
- `startProducer` reads `hiddenConsumers` and checks verifier runtime and setup digests. It must therefore start after deployment, and it is your end-to-end binding check. Don't duplicate it.
- One cheap pre-deploy check is still worth doing: compare `keccak(Verifier.json.deployedBytecode)` against the pinned runtime metadata, and reject a non-empty `linkReferences`. The creation bytecode needs no separate pin, because the on-chain runtime hash is what gets checked.
- *Confirm* whether `producerServer` listens on its own. The orchestrator should call `listen(port, "127.0.0.1")` and treat a server `error` event (such as EADDRINUSE) as a startup failure.
- `ProducerWorker` receives `{...process.env}`, so the orchestrator's whole environment, including any secrets in your shell, reaches the native binary. Reduce `process.env` to an allowlist at orchestrator startup (`PATH`, `HOME`, `LANG`, `PROVER_THREADS`, `PROVER_MEMORY`), and drop `NODE_OPTIONS`.
- The 8-thread / 6 GiB defaults may exceed a WSL2 memory cap. Make them config fields and warn when `GOMEMLIMIT` exceeds the `MemTotal` in `/proc/meminfo`.

**Keys and accounts**
- Use three distinct senders: the deployer, the producer's H3 key, and the keeper. Generate fresh random keys and fund them from account 0. Keeper key `0x2a87…` is Anvil account 9, which the UI's dev accounts might also use; *confirm* which accounts the web app exposes. Nonce collisions between the keeper, the producer, and browser players otherwise cause intermittent failures.
- Keep the keys in memory and pass them to the keeper through its environment. Write no key material or token to logs or files.

**Deploy (`Deploy.s.sol`)**
- Build the forge environment from an allowlist and set explicitly every variable the script reads: `DEPLOYER_PRIVATE_KEY`, `ADMIN`, `OPERATOR`, `ARBITER`, both `HIDDEN_*_CONSUMER`, and `FOUNDRY_PROFILE=default`.
- Foundry auto-loads a `.env` from the project root, and dotenv fills only unset variables. Explicit values win, but *confirm* whether `contracts/.env` exists; if it does, refuse.
- Use the address from `--rpc-url http://127.0.0.1:<port>` only, and ignore `ETH_RPC_URL`.
- After broadcast, read `<broadcast>/Deploy.s.sol/31337/run-latest.json`. Then verify on chain that `hiddenConsumers()` matches the consumers you deployed and that the Game and directory have code. Set `fromBlock` to the Game deploy receipt's block, not the latest block.
- *Confirm* the consumers' constructor arguments, and whether the opening consumer deploys its own `prefix()` cache. If a consumer needs the Game address, you have a circular dependency and need CREATE-address prediction. That is much easier with a dedicated deployer key.

**Anvil and ports**
- Spawn `anvil` directly (no shell) with `--host 127.0.0.1 --port P --chain-id 31337 --block-time 1`.
- Readiness requires three things, in this order:
  1. Your own child prints its listening line and is still alive.
  2. Only then make the first RPC call, confirming `chainId == 31337`.
  3. `eth_getTransactionCount(account0) == 0`, which proves the chain is fresh and yours.
- Bind failure makes Anvil exit, so no separate pre-probe is needed.
- Use the literal `127.0.0.1` in every URL (deployment JSON, `HIDDEN_PROVER_URL`, `RPC_URL`), never `localhost`. Node resolves `localhost` to `::1` first, which could reach another listener.
- Validate ports as integers in 1024–65535 that are pairwise distinct.
- On WSL, your loopback checks don't prove the Windows browser can reach the ports. Hyper-V's excluded port ranges, or a Windows process in mirrored networking mode, can block them. Add one line to the docs; no code.

**Run directory**
- Resolve the config path against `INIT_CWD`, because `pnpm --filter` changes the working directory. Alternatively, require absolute paths.
- After `realpath`, the run directory must be outside the git worktree, every key tree, and the verifiers directory. Reuse the `relative()` containment logic from `compile.ts`.
- Reject `/mnt/*` (drvfs/9p). There, `0700`/`0600` modes and the flock leases behave unreliably.
- Set `umask 077` at startup.
- Pass the keeper `<run>/deployment.json`, never `apps/web/public/`.

**Binary pin**
- Hashing the binary and then executing it lazily, possibly hours later, leaves a time-of-check/time-of-use gap. Copy it into `<run>/bin` with mode `0500` and hash the copy; that is simpler than any fd trick.
- The key trees are too large to copy. Soundness doesn't depend on them anyway, since a wrong proving key yields proofs the on-chain verifier rejects.

## Keys-unchanged and clock checks

- **Keys stay unchanged.** *Confirm* that the native prove path (`mpcstaged/cache.go`) never writes caches into the setup directories. Then, as a cheap read-only check, snapshot `{path, size, mtime}` of both key trees before startup and compare it at teardown.
- **Beacon binding.** Verify that the manifests' beacon chain is quicknet (genesis 1692803367, period 3, matching the constant in the producer and keeper). Otherwise real beacons will never open the circuit's ciphertexts.
- **Clock.** No accelerated clock is the right call. Also make sure nothing in the started processes calls `evm_increaseTime`. *Confirm* whether the local-network UI exposes a time skip. Jumping ahead passes the producer's `block.timestamp` gate but stalls on unpublished drand rounds. If the Game has any evidence deadline, a jump could also expire it.
- WSL2 clock drift after sleep shifts Anvil timestamps relative to drand. It is harmless, since the keeper retries, but a one-line startup warning that compares system time to drand's latest round is reasonable. Optional.
- **Long proofs.** undici's default `headersTimeout` is 300 s. A slow opening proof will make the keeper's fetch fail and retry. The producer's keyed queue and cache should absorb this; *confirm* `serialQueue` joins an in-flight key instead of starting a second proof.

## Readiness and smoke scope

- **Producer:** an authenticated metrics call returns 200, and an unauthenticated one is rejected.
- **Keeper:** its `certificate keeper for …` line appears and the process is still alive.
- **Vite:** `/` returns 200.

That plus your UI/registration smoke is enough. I agree that no new Groth16 run is needed: the producer's startup check already proves the deployed verifier runtime matches the pinned setup.

## Leave out

- No run manifest or provenance JSON beyond `deployment.json` plus logs. The pins live in the config you already wrote.
- No new lock: the fresh directory and port binding already give exclusivity, and the producer and keeper take their own leases.
- No stale-process cleanup.
- No indexer or Docker path.
- No resume. Anvil is in memory, so a run directory is single-use, and the docs should say so.