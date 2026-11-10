# Persistent producer and keeper operation

These are deployment preparations, not a production release. Setup provenance and
all real-network deploy gates remain blocked. The owner chose Codex and Claude
reviews without external collaborators; that choice does not supply independent
participation or certify the experimental keys. Do not install these units as a
way to bypass application policy. Local Anvil worlds remain ephemeral.

## Process lifecycle

Run the Node entry points directly with the installed TypeScript loader. The
systemd templates in [scripts/systemd](../scripts/systemd/) show the exact command
shape; do not put pnpm or a shell wrapper in front of the main process. Paths in
the templates are examples: verify Node version, release root, state, deployment
and credential locations for the target host.

Both entry points handle repeated SIGINT, SIGTERM and SIGHUP as stop requests.
SIGHUP stops; it does not reload credentials. Handlers stay installed through
cleanup. No signal handler forces exit. Before the producer constructor returns,
a stop is remembered; the returned service closes without opening its listener.
The producer validates its port before constructing the service. Bind failures,
unexpected listener errors and cleanup errors produce a nonzero exit; an operation
error and a cleanup error are both retained.

The keeper stops scheduling new work at safe asynchronous boundaries, interrupts
its retry sleep and cancels certificate HTTP waits, including response bodies.
The 120-second certificate deadline remains in force when no stop is requested.
A historical ciphertext scan checks for stop between RPC reads; an in-flight RPC
can still take its configured 15-second deadline. There is no race that releases
the state lease while a tick is still running.

Before returning new signed bytes to the journal owner, both producer and keeper
check for stop before preparation, before signing and after signing. Bytes not
published can be discarded. Once a signed transaction is published to its journal,
shutdown does not abort the broadcast/receipt operation. It settles, or its receipt
deadline fails and leaves the journal intact. A stop-time operation failure exits
nonzero; the next instance must recover the same signed bytes. Never delete an
unresolved journal or replace its chain to unblock it. These changes improve
operability; the existing journal/lease protections already handled abrupt exits.

Before the last signing check, a stop can prevent publication. An operation that
has already passed that check may still publish and broadcast after the signal;
shutdown waits for that owned operation rather than pretending it was cancelled.
Post-job cache cleanup cannot replace the primary job failure or discard a valid
certificate: combined failures are aggregated; maintenance-only failure marks
cache.healthy=false and the next job must pass its pre-job prune before generating.
Shutdown aggregates all resource failures plus lease-release failure.

Caught service crash/retry logs expose only bounded error categories, errno codes and
an allowlist of static application messages. Arbitrary third-party messages,
stacks, request bodies and provider URLs can contain credentials and are omitted.
Diagnose with those categories, reviewed private configuration and authenticated
metrics; no raw-error logging bypass is provided. Uncaught runtime faults remain
outside this caught-path policy and may use Node default diagnostics. Error objects still propagate
unchanged inside the program and remain available to tests/callers.

## Native process environment

The certificate service filters both resident-worker and inspection subprocess
environments, including explicit nativeEnv overrides. Allowed settings are PATH,
HOME, TMPDIR, LANG, LC_ALL, TZ, GOGC, PROVER_THREADS and PROVER_MEMORY.
GOMAXPROCS/GOMEMLIMIT derive from PROVER_THREADS/PROVER_MEMORY (defaults 8/6GiB);
empty or whitespace-only values use those defaults.
H3/keeper keys, HTTP tokens, database credentials, NODE_OPTIONS and LD_PRELOAD are
not inherited. The native verifier does not need those service credentials.
This limits accidental inheritance; the native binary still runs under the same
OS account and is not sandboxed from all files or parent process data.

## Supervisor templates

[vendetta-producer.service](../scripts/systemd/vendetta-producer.service) and
[vendetta-keeper.service](../scripts/systemd/vendetta-keeper.service) are inert
system-service templates. Nothing installs, enables or starts them automatically.
They use separate vendetta-producer and vendetta-keeper accounts/groups, private
state directories, UMask=0077 and StateDirectoryMode=0700,
read-only release/config paths, private temporary files and no core dumps.
EnvironmentFile paths are required and must be privately provisioned; do not put
secrets in unit text, command arguments, Git, browser assets or review prompts.
The manager reads EnvironmentFile; the service UID reads its deployment, clients
file and keys. Keep the bearer clients file readable only by the producer account
(or root for provisioning), and keep keeper credentials separate.

Producer configuration needs HIDDEN_PROVER_BIN, HIDDEN_PROVER_KEYS,
HIDDEN_PROVER_RUNTIME, HIDDEN_PROVER_CLIENTS_FILE and HIDDEN_H3_PRIVATE_KEY.
Keeper configuration needs KEEPER_PRIVATE_KEY, HIDDEN_PROVER_URL and
HIDDEN_PROVER_TOKEN. Each needs its correct RPC/deployment. State paths default in
the templates to /var/lib/vendetta-producer and /var/lib/vendetta-keeper. Startup
rejects a cache/state path that differs from systemd STATE_DIRECTORY, including an
EnvironmentFile override. Change StateDirectory and the matching configured path
together; do not redirect only the environment. Reserve STATE_DIRECTORY for the
manager and never define it in an EnvironmentFile; this check detects stray path
overrides, not a hostile administrator editing both settings. ProtectSystem is an
additional write-access backstop. Keep one private state directory
per dedicated signer/Game.
ProtectHome means artifacts under a user's home will not be available: provision
reviewed artifacts under the release/config tree instead. Stable HTTPS, funding,
finality/reorg policy, backups and provider availability remain deployment work.

KillMode=mixed sends the initial stop to the Node main process, preserving its
worker shutdown order, then kills remaining descendants when the main process
exits or the timeout expires. A separate process group does not escape the cgroup.
See the [systemd kill procedure](https://www.freedesktop.org/software/systemd/man/latest/systemd.kill.html).
TimeoutStopSec 150 is an escalation budget, not a proven graceful-stop SLA; receipt
waits can use 60s plus RPC work, and hung filesystem I/O has no graceful hard bound.
The supervisor is the hard-stop backstop. Failed exits retry every 30s with no
start-rate lockout, so a short RPC outage does not leave the service permanently
failed after a few attempts. A clean stop does not restart. Integrate journal and
metrics alerts for repeated failures/restarts and, where appropriate, an OnFailure
notification unit. No notifier or alert destination is configured by these templates. Type=exec confirms exec, not HTTP
readiness: use authenticated metrics and keeper logs for application health.

MemoryMax, MemoryHigh, CPUQuota, TasksMax and storage capacity must be selected in
an operator drop-in against actual workload/hardware. The templates deliberately
do not invent production resource budgets. GOMEMLIMIT is a runtime target, not a
cgroup limit. Supervision/resource-policy preparation is not proof of capacity or
remote availability, and restarting is not an alerting system.

## Verified scope

On this host, systemd 259 syntax verification passed after substituting the actual
Node executable for the template's /usr/bin/node. No target-host provisioning or
hardening acceptance is claimed. A real user-manager probe used temporary synthetic
Python parent/child services, mixed kill mode and an inherited flock. It exercised
normal stop, main-process SIGKILL followed by restart without overlap, and a
stubborn process killed at the stop deadline. Detached children stopped and the
lease was reacquired. Its 128MiB/32-task/1s budgets are fixture settings, not
production recommendations. The temporary units were collected/stopped afterward. A system-manager sandbox
probe was refused for lack of noninteractive authorization; distinct users and
ProtectSystem/ProtectHome/StateDirectory have not been accepted together on a
target host. No privileged installation was attempted.

Producer entry-source fixtures substitute only the service factory, using a fake
HTTP server, Node worker and real flock; they do not load game setups. Keeper
child tests use synthetic RPC data and journals, including stop while awaiting an
already published transaction's receipt. There is no game replay, native proving,
new setup or real-network deployment in these checks. The review/handoff and
external receipt preserve exact sources, original Claude responses and results.

A real standalone producer entry (without factory substitution) also started on a
fresh local real-consumer Anvil using existing pinned artifacts, reported zero
requests/proofs, exited naturally on stop and released its cache lease. A real
keeper process cancelled an in-flight certificate response against synthetic
RPC/log/view data without signing or broadcasting. These do not establish hidden
mission correctness or production sandbox acceptance.

Cached proof JSON that is empty, truncated, malformed or bound to another setup/
statement is evicted as a cache miss. Deterministic consumer rejection
(InvalidProof/WrongStatement/NonCanonicalWord/InvalidExhaustionClaim/MismatchedScalar) also evicts it; RPC outages, UnfinishedPrefix and unknown revert selectors
retain the cache. Other storage errors remain errors. Generated
artifacts are checked with the same structural/binding policy; consumers still
verify every proof. This avoids retrying a broken private cache entry until age
pruning. No archived setup, receipt or verifier artifact is modified. Maintenance
warnings preserve safe error categories/errno; dynamic mission diagnostics carry
only a validated numeric mission ID. Certificate submission is logged only after
an action was actually dispatched.

Deterministic proof rejection increments proofRejections and emits only the circuit
kind and a fixed rejection category before eviction. This makes repeated regeneration
visible without dumping proof bytes or provider errors; an operator still needs
alerts and an explicit retry/availability policy. Canonical word bounds match the
consumers (128-bit words and the four opening booleans), preventing malformed cache
values from overflowing H3 assembly before reaching a consumer. A false opening
validity result is legitimate authenticated invalid plaintext, not a rejected proof.

The final acceptance executionSources field is a selected runtime file set, not a
complete transitive import closure. The final source bundle inventories the whole
modern working tree separately. Startup with zero certificate requests does not
exercise rejection handling; that handling is covered by synthetic unit tests.


## Certificate response transport

The keeper/client retains at most 64 KiB of decoded HTTP response bytes before
UTF-8/JSON parsing, independent of Content-Length. Larger bodies are cancelled
without waiting for EOF. Error-status bodies are cancelled without parsing. The
existing certificate limit remains 16 KiB of hex-decoded bytes; the field must be
an actual string. These are transport limits, not cryptographic verification.
Only on-chain consumers decide certificate validity. A malformed/oversized body
remains an operation failure for retry, never evidence that a mission is invalid.

The current producer's artifact guard requires a 384-byte proof before encoding
it with 55 opening or two invalid-point public inputs. Both ABI envelopes fit
within the existing certificate cap and the new response cap. Compatibility tests
use synthetic proof bytes with the real HTTP handler; they do not prove a mission
or authenticate setup provenance. The existing 120-second fetch deadline and caller
stop signal still cover headers and response-body reads. A caller stop observed
before reporting an error, including during response cleanup, wins unless the
timeout signal already won; no certificate is returned after an observed stop.
Cleanup releases readers
and cancels unsuccessful responses. Safe logs distinguish authentication, forbidden
access, rate limiting, generic unavailability and response overflow using static
messages, without provider URLs, bodies or arbitrary remote error text.

The byte cap bounds retained decoded payload, not fetch/decompression buffers,
JSON overhead, CPU or process RSS. Compressed responses are still supported; a
compressed body can incur decompression work before overflow rejection. These
checks do not select production capacity, alert thresholds, remote TLS/finality
policy or target-host acceptance. The transport review and closure are recorded
in [the November 10 review](reviews/hidden-v2-claude-certificate-transport-20261110.md).
