# Hidden v2 negative acceptance harness

Candidate: `104f0310cae165fc0eddc7e16e4780d6818426aa`, branch
`feat/hidden-v2-local-mpc-review`. The acceptance below was run locally on that
candidate plus the regression tests and harness. The repository now includes the
sanitized harness, not private session data or cryptographic setup artifacts.

## Requirements and isolated clock

A clone alone cannot generate these proofs. It needs Linux, the repository's
Node/pnpm dependencies, Foundry, curl, Python 3, Playwright Chromium, and the
original native producer binary, CS/PK/VK, setup manifests, compiled final verifier
artifacts and runtime pins described in `docs/local-hidden-v2.md`. None of those
private or large artifacts is included here. Supply the pinned local configuration
as the first argument; no setup, keys or verifier regeneration is needed.

This is the sanitized code exported from Rodrigo's acceptance. It uses Anvil's
public unlocked accounts, not embedded development private keys. The runner still
selects Rodrigo's original opening/point key directories under
`/home/rodrigo/.cache/vendetta-audit/`; those directories must exist with the pinned
artifacts, or the two path assignments in the runner must be adapted to the local
inventory. The evidence-packaging utility also uses the recorded Rodrigo-local
repository/session paths; it is not a generic packager for arbitrary new runs.

`contracts/acceptance/LocalAcceptanceClock.sol` is a template outside Foundry's
production `src` tree. `acceptance-clock.ts` copies it into a private overlay and
patches that overlay only. The template is byte-identical to the accepted local
copy and retains its chain-31337 restriction. The normal contracts and deployment
script are not accelerated. The full duplicated Solidity snapshot is not checked
in; the generator reconstructs it from the production sources and this template.

Committing this harness is not approval to run it, create a chain or generate
proofs. The commands below distinguish offline preflight from explicit execution.

## Running the harness

The entry point is `apps/web/scripts/experiments/run-negative-v2.ts`. `preflight`
only reads and hashes the original binary, CS/PK/VK/verifier files, manifests and
runtime bindings, and writes a new evidence directory. It never starts Anvil,
executes the native binary, generates a proof or changes a key tree. The original
opening and point public directories override the replay copies in the old config;
all four manifest file hashes and the existing manifest/runtime pins must match.
It uses Python 3's zipfile module, without a system zip dependency.

```bash
pnpm --filter @vendetta/web exec tsx scripts/experiments/run-negative-v2.ts \
  preflight /absolute/previous-config.json /absolute/new-evidence-directory
```

**Do not run the following until the owner explicitly approves a fresh Anvil,
local ephemeral contract deployment and new proofs.** The flag records that
approval; it is not a mechanism for granting it to yourself. No remote deployment,
push, setup/MPC/key generation, verifier compilation or binary rebuild is allowed.

```bash
pnpm --filter @vendetta/web exec tsx scripts/experiments/run-negative-v2.ts \
  run /absolute/previous-config.json /absolute/new-evidence-directory \
  --approved-new-anvil-and-proofs
```

The owner subsequently requested shorter **contract durations**, while keeping
Anvil and drand on wall time. Pass `--time-scale=100` after the approval flag to
use that explicitly accelerated local Game. `acceptance-clock.ts` copies the
contract sources and deployment script into the new private session, adds a
chain-31337-only `LocalAcceptanceClock`, and changes only room/research/training
and mission duration calculations to `max(1, floor(seconds / 100))` (zero remains
zero). Costs, map coverage, commitment, packet format, circuit relation, original
CS/PK/VK, native binary and final verifier artifacts are unchanged. The repository's
production Solidity files are never patched. The overlay paths, exact replacements
and source hashes are recorded in `acceptance-clock.json` and `stack.json`.

The source overlay copies only the production deployment script; the first
overlay attempt failed at compile time because an unrelated test deploy script
required excluded test helpers. That attempt started no chain or proof and its
logs remain in the run2 directory.

The first scaled execution completed all five U cases with fresh proofs and full
World equality. Its healthy opening HTTP wait then failed at exactly 300 seconds
(Node fetch's header deadline) and the session closed with zero cleanup errors.
That infrastructure failure is recorded as a failed attempt, never INVALID.
The harness now reuses the loopback-only `benchmarkFetch` transport already used
by `run-producer-game.ts`, with a 30-minute total deadline and an explicit stop
signal. Passing `--opening-cases-only` after the scale flag executes only the
remaining eleven opening cases and four recovery cases in a fresh chain/cache;
it does not regenerate the five completed U proofs. The combined matrix must
retain each case's original session/Game/statement and the previous failed attempt.
A subsequent opening-only session stopped before any native proof because the
Node beacon fetch failed before the fake-signature injection hook. This was
correctly retained as a failed infrastructure attempt, not counted as an injected
signature test. The acceptance hook now fetches authentic HTTPS drand responses
using curl with strict round/shape checks, bounded size/time, three attempts and
recorded transport failures; it checks connectivity before starting a chain.
The native producer still cryptographically authenticates every successful opening
signature. No fixture or mock beacon substitutes for a failed remote request.
No World is compared across chains and no journal or proof is reused on another
chain. Benchmark transport/config/packet/overlay checks now pass 28 offline tests.

The scaled run still chooses future rounds and waits for authentic drand
publication with no EVM warp. Initial construction takes 56 seconds, training 14,
and a one-grid journey takes 41 seconds. Cryptographic proving time is not reduced.
The harness checks the admitted on-chain duration against the same scaling of
the TS preview. Once queues finish, the full-World punctual oracle uses those
actual admitted durations; all other simulator rules remain the original ones.
This establishes the negative lifecycle on a **temporarily accelerated local
Game**, not acceptance of the unmodified production timing formulas. The first
unscaled attempt was stopped during construction, before any proof request;
its original directory, logs and orderly close receipt remain intact.

Run from this repository with dependencies already installed. Both paths must be
absolute. Every invocation requires a nonexistent output directory. The existing
launcher creates its session underneath it; previous journals/caches are never
read or reused. Its shutdown, process groups, leases and transaction journals
remain active. The optional acceptance mode suppresses the automatic keeper so
the harness can inspect PENDING and control submission order. The ordinary
launcher still starts the keeper. This run tests harness → producer → real
consumers → Game; it does **not** establish keeper or browser submission acceptance.

The run registers two players at 25:25:99 and 25:25:100, builds the training room,
trains one unit and waits for construction, training, cooldowns, drand publication
and returns using wall time. There is no warp, storage injection, chain snapshot,
archived signature substitution or mock certificate. Construction and travel can
make this substantially longer than proving alone. Proof HTTP waits are bounded
at 30 minutes; exceeding them is a failed acceptance attempt, never INVALID.
Stop signals cancel waits/HTTP and invoke the launcher's orderly cleanup.

`negative-v2-cases.ts` creates fresh encrypted packets before admission. Invalid U
uses public point encodings from the existing invalid-point vectors; no archived
file key or signature is imported. MAC/tag are computed after replacing U.
Semantic cases use fresh authentic MAC/tag and a correct commitment except in the
explicit wrong-commitment case. Authentication tests damage exactly the MAC or
the final tag byte. File keys are never returned, written or bundled.

The 16 mission cases cover five U boundaries; MAC/tag; commitment; city,
neighborhood and slot bounds; same origin; cover; cargo on ATTACK; TRANSPORT with
cargo; maximum salt. Four recovery cases inject a false signature, an authentic
signature of the preceding round, a beacon outage and an unavailable producer
HTTP endpoint. The producer outage is a transport failure, **not** a worker crash
or keeper recovery test. Beacon authenticity for successful proofs is checked by
the original native producer. Failed signature jobs must reach the injection hook,
produce no proof, and leave the entire World unchanged and PENDING. Recovery
passes only after the healthy request completes and its mission finishes.

Each certificate must have the real 55/2 schema; opening validity word 50 must
match the case. A damaged proof is submitted and must revert while retaining
PENDING. A successful certificate must emit exactly one HiddenEvidenceRecorded
with the expected validity. Duplicate submissions must not emit another record.
Consumption must retain original arrival/seq, complete the return, remove the
mission and avoid double credit. Complete Worlds are compared with the TS oracle
that resolves at the original arrival. The oracle's trusted receipt insertion is
only a model input; the EVM path always verifies the real new proof. Existing
H3 modeled/exhaustion tests retain their narrower scope; this does not claim a new
SHA exhaustion preimage or full-domain game exhaustion proof.

Requests, packets, ABI context, statements, certificate/proof bytes, receipts,
events, complete Worlds, real beacon signatures, a public harness transcript and
hashes are written at the evidence root. The private session retains native logs,
builds/cache/journals and credentials for diagnostics. The ZIP includes only
harness-written public root JSON and the browser screenshot; it excludes the
session tree, private keys, credentials, native inputs, setup files and journals.
A final Chromium screenshot is explicitly browser **observation**, never evidence
that the browser sent a mission. The initial screenshot is not asserted to show
per-mission lifecycle UI. `results.json` distinguishes PASS/FAIL/NO EJECUTADO;
HTTP/RPC errors, rejected proofs, timeouts and incomplete H3 are never INVALID.

Offline checks:

```bash
PATH=/home/rodrigo/.cache/vendetta-tools/go/bin:$PATH bash scripts/test-hidden-v2-crypto.sh
forge test --root contracts --match-path 'test/hidden/*.t.sol'
forge test --root contracts --match-contract HiddenMissionsTest
pnpm --filter @vendetta/web exec vitest run test/negative-v2-cases.test.ts test/local-hidden-config.test.ts
pnpm --filter @vendetta/web typecheck:scripts
```

Preparation on 2026-11-11: the three requested suites passed (crypto: 375.067s;
hidden Solidity: 13 tests; HiddenMissions: 12 tests). The static differential
checked 672 cases (94 valid/578 invalid). The offline helper/config suite passed
24 tests. `keeper-reorg.test.ts` reproduced the missing `Keeper transaction reverted`
log assertion; it was not changed. Running that test inadvertently started its
fixture Anvil before approval; it finished and generated no new native proof.
No further chain is authorized by that mistake. `storage-layout.mjs` passed with
the artifacts present after Forge compilation; Amp's CoreStateLayout lookup
failure remains recorded as a previously reported, environment-sensitive issue.
Neither issue is repaired or suppressed by this harness.

## Completed local accelerated acceptance — 2026-11-11

The final matrix is **20/20 PASS**, with **16 new complete native proofs**: five
invalid-point proofs from `hidden-v2-negative-real-clock100-20261111-run3` and
eleven opening proofs from `hidden-v2-negative-real-clock100-20261111-run5`, under
`/home/rodrigo/.cache/vendetta-audit/`. The four recovery cases are included in the
20 and share one newly admitted opening mission; they are not four additional
proofs. Every case remains bound to its own session/Game/statement/arrival/seq.

All fourteen certifiable negatives emitted one `HiddenEvidenceRecorded(false)`;
the two controls emitted true. Damaged proofs reverted with PENDING intact,
identical duplicate certificates emitted no extra record, consumption preserved
original arrival/seq, returns completed and full Worlds matched the punctual TS
oracle. The public inputs additionally confirm capsule/MAC/tag validity for all
semantic negatives, with exactly the intended MAC or tag bit false for those two
cases. H3 states and all prior rejection candidates were checked independently
with SHA-256. Saved source signatures, including the authentic wrong-round one,
were independently checked by the Node BLS pairing verifier against quicknet.

Both evidence sessions closed with `cleanupErrors: 0`. The final package retains
the failed transport/compile/beacon attempts as history, does not reclassify them
as INVALID, and keeps original-timing acceptance marked NO EJECUTADO. The local
contract overlay factor is 100; Anvil and drand use real time, with no warp.
Browser screenshots are observations only. No completed U proof was regenerated.

Read-only progress, capture and review utilities are
`scripts/hidden-v2-negative-status.py`,
`scripts/watch-hidden-v2-negative-evidence.py`,
`apps/web/scripts/experiments/capture-negative-v2-chain.ts`,
`apps/web/scripts/experiments/observe-negative-v2.ts`, and
`scripts/verify-hidden-v2-negative-evidence.py`. The last tool takes an evidence
directory and `--allow-partial` to review a split session while preserving its
unexecuted and failed rows; the combined report selects the unique accepted
execution of each case and retains previous attempts separately.
