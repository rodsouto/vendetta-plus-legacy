# Local experimental hidden v2 game

`pnpm dev:hidden-v2` starts an ephemeral local Anvil, real verifier/consumer contracts, Game,
HTTP certificate producer, keeper and web app. It reuses existing experimental
setups and compiled verifier artifacts. It does not run MPC, generate setup keys,
compile the final verifiers, create missions or request proofs at startup.
The hidden mission path has not been rerun end to end through this launcher
(keeper → producer → real consumers); that cryptographic evidence remains the
previous archived Game/H3 replay.
Production gates remain unchanged. This is a local session using unsafe setups.

## Start a session

Requirements: Linux, a private stable local filesystem with working `flock` and
`fsync`, Node/pnpm dependencies, Foundry and solc 0.8.28. The existing native
producer binary, both key directories and their previously compiled EVM verifier
artifacts must already exist. The archived handoff records this machine's paths
and pins; missing artifacts are a configuration error, not permission to regenerate
setups. The indexer, Docker, bundler and passkey stack are not started here. Remove
`contracts/.env` before starting: the launcher refuses it so Foundry cannot load
project-local deployment settings. Real mission proofs require outbound access
to drand. The historical three-proof replay took about10min43s with sampled native
RSS about5.82GiB; those are previous measurements, not a startup or per-proof SLA.
This launcher uses4 threads, a5GiB Go runtime memory target and GOGC25; the target
is not a hard RSS quota. Provision enough free memory beyond that target.

Copy [the configuration example](examples/hidden-v2-local-stack.json) outside Git.
Replace every path and SHA-256 placeholder. `verifierArtifacts` is the existing
workspace containing `out/opening.sol/Verifier.json` and
`out/invalid-point.sol/Verifier.json`. Pins refer to the native binary, each
`manifest.json`, and the runtime metadata JSON. `sha256sum` of those files does
not read the proving keys. Use the metadata associated with those verifier
artifacts, not an unrelated build. `unsafeLocalSetup` must literally be `true`.

```bash
bash scripts/dev-hidden-v2.sh /absolute/private/config.json /absolute/private/new-session
```

`pnpm dev:hidden-v2` is also a convenience alias. For scripts and terminal Ctrl-C
status, use the direct command above: pnpm9 can mask a child's cancellation exit.
Cancellation during startup exits nonzero; a normal stop of a running session exits
zero unless cleanup fails. Neither exit status means the world has been saved.

The configuration and session paths must be absolute. The session's parent must
exist; the session itself must not exist and must be outside the repository,
key trees and verifier workspace. Defaults are RPC18545, producer18787 and web15173,
all bound to `127.0.0.1`. Anvil listens directly on the configured RPC port. Startup waits for its own
listener announcement before funding or deployment. Configured ports must be distinct and free. Existing
listeners are left alone. WSL/Windows networking can impose additional port
restrictions even when a Linux loopback bind succeeds.

Open the printed web URL. Use the local development accounts and Workshop. A new
random deployer produces a new Game address for each session, keeping browser
mission drafts distinct between worlds. The Workshop's roles remain on Anvil
account0; separate fresh funded accounts sign H3 and keeper transactions.

The launcher compiles current Game/consumer Solidity into the new session only,
then deploys the existing final verifier artifacts. It binds the producer to the
on-chain verifier runtimes and setup digests. Compiler output, broadcasts,
deployment JSON, native binary copy, caches and journals stay inside the session.
It never writes `apps/web/public/deployment.local.json` or archived setup outputs.

## Time and hidden missions

Blocks advance once per second. There is no accelerated clock in this launcher.
Authentic drand beacons follow wall time: the Workshop's time skips do not publish
future beacons. Hidden missions using unpublished rounds remain waiting until
the beacon exists. A keeper/RPC/prover failure remains retryable; it is not a
certificate of invalidity. Native proofs are generated only when real pending
missions require them; startup and the smoke command below do not generate them.

The existing `pnpm dev:local` and Playwright player fixture use test consumers.
Their explicit mock certificates are separate from this real-consumer route and
are not accepted as proof evidence for it.

## Check the browser connection

On a fresh running session:

```bash
pnpm smoke:hidden-v2 /absolute/private/new-session
```

This command uses Chromium to register local account1 at25:25:100, queue its
training-room construction, and open missions/reports/ranking. It checks injected
network configuration, HTTP authentication and zero certificate requests. It
writes `smoke-result.json` exclusively in that session directory and reads its
private producer credential there. The player counter must be zero before Chromium
launches; use this smoke once in a fresh world.
It does not send a hidden mission or claim a new cryptographic replay. Install
the project's Playwright Chromium if it is unavailable.

The full player mission flow remains tested separately with explicit trusted
mock certificates. Alternate ports and fresh external output directories avoid
colliding with other developer sessions or replacing their artifacts:

```bash
VENDETTA_E2E_RPC_PORT=18555 VENDETTA_E2E_WEB_PORT=15199 \
VENDETTA_E2E_RUN_DIR=/absolute/private/new-browser-fixture \
VENDETTA_E2E_SCREENSHOT_DIR=/absolute/private/new-browser-captures \
pnpm --filter @vendetta/web exec playwright test e2e/flow.spec.ts \
  --output /absolute/private/new-browser-results
```

## Stop and inspect

Ctrl-C, SIGTERM and SIGHUP request ordered shutdown: keeper, producer jobs, web,
then Anvil. Repeated signals do not bypass cleanup. The launcher owns only
its child process groups. Native jobs are aborted with SIGKILL on close, including a process ignoring
SIGTERM. An outstanding RPC transaction receipt can keep shutdown waiting for
roughly a minute while Anvil and the state lease remain available. There is no
claim of a hard bound for hung filesystem I/O.
If a service exits unexpectedly or the orchestrator encounters an uncaught error, the session stops and
records the reason. A storage failure while recording that error still triggers
cleanup.

`stack.json` records public addresses, URLs, owned PIDs and `ephemeral: true`.
`inputs.json` records paths/pins. `build.log`, `deploy.log`, `anvil.log` and
`keeper.log` retain diagnostics; `failed.json`/`closed.json` record startup and
cleanup results. They do not authorize restoring or reusing a session.
`producer-clients.json` contains a bearer credential and stays private with mode600
inside a mode700 session. No credential is injected into the browser. H3/keeper
private keys live only in process memory/environment and are not saved for reuse.

## Ephemeral worlds

Every invocation creates a new chain, Game, service signers and private output
directory. There is no resume flag, checkpoint, chain dump, startup recovery or
pending-pool drain for persistence. Stopping or losing Anvil discards the world.
After a crash, start with a new session directory; never reuse old cache/journals
against a replacement chain. Producer and keeper journals still protect signed
transactions within the live session and remain required for persistent networks.

Logs, build outputs, caches and diagnostics remain after exit; ephemeral refers
to the chain lifecycle, not automatic deletion. The launcher never cleans existing
directories or kills processes belonging to another session. If an abrupt parent
exit leaves owned children, inspect current recorded PIDs/ports and command lines
before terminating them; old archived PIDs are not authority to kill anything.
`stack.json` is published only after startup completes; before then, use
`ss -ltnp` to identify the current listener and inspect `/proc/<pid>/cmdline`
before taking action. An occupied port or existing output directory refuses a new start.

Earlier checkpoint/resume receipts are historical evidence of the retired feature.
They remain intact, but the current launcher cannot resume those worlds. Production
setup provenance and all real-network deployment gates remain unchanged.
