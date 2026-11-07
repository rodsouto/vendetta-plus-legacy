# Unsafe local staged phase 2

This adapter reduces simultaneously retained point tables while preserving the
pinned gnark v0.16.4 phase-2 equations. It is an experimental local adapter, not
the unmodified native `Phase2.Initialize`, a production ceremony or an audit.

`lagrange.go` derives from the Apache-2.0 Consensys implementation in
`github.com/consensys/gnark@v0.16.4/backend/groth16/bn254/mpcsetup/lagrange.go`.
The FFT butterflies, kernels, normalization and bit reversal are retained.
Only inverse twiddles are built, matching the native table bytes; unused forward
and coset tables are omitted. Input vectors are transformed in place; an ordinary local parallel loop
replaces gnark's inaccessible internal scheduling helper. Dependencies remain
pinned in the parent Go module; the installed module cache is never edited.

The adapter processes tau G1, alpha G1, beta G1 and tau G2 in separate passes.
It accumulates C + alpha*B + beta*A in two passes, then distributes the same
result into public, private and commitment bases. Group arithmetic is unchanged;
addition order differs from the native temporary-array implementation. Decoded
CS memory is released before assembling the final phase-2/evaluation objects.
`Prepare` streams the in-memory CS to SHA-256 and checks the store context
before using fresh or resumed cache vectors. The CLI also checks the CS pin;
this package-level check protects direct callers. Keep exclusive ownership of
the CS during preparation.

After successful preparation the store keeps a private deep copy of the wire
layout. `Assemble` rejects a caller-modified layout or a store that has not
successfully prepared, including a newly resumed store. Preparation must still
run to bind that store to the compiled CS; it reuses completed cache vectors.

Each transformed vector and accumulator is stored with its dimensions and hash.
Every completed vector publishes a new exclusive `index-NN.json`, binding the
algorithm version, CS hash, sealed commons hash and domain. Resumption requires
an explicit index path and SHA-256 pin; source files are never overwritten.
Partial files without an indexed successful write are not reused. Use a fresh
output directory and pass `--staged-initialization --resume-cache INDEX
--resume-cache-sha256 PIN` to the pipeline's `phase2-init` command.

Each commons pass checks its entire framing and digest, but only decodes the
selected vector into checked native curve points. Cached vectors have fixed
length/byte limits, hashes checked before and during decoding, and a checked
allocation header. Failed G1/G2 loads return nil, including decoder and
checkpoint callback failures. A cache is trusted local work authenticated by an explicit
pin; it does not independently prove that all initialization equations were
executed. Independent reproducibility remains a production requirement.

The tests compare exact serialized initial states, evaluation caches and sealed
keys against native `Initialize`/`VerifyPhase2`, for several circuit dimensions
and zero, one or two commitments. They also generate and verify actual Groth16
proofs, reject substituted public inputs, resume after every persisted boundary
and reject changed cache contexts/content. Process tests exercise both paths,
key export/load, native contribution verification and full-cache resumption.
These are regression checks, not a full-domain equivalence proof or an audit.

The final seal uses `mpcstream.ReadSealCommons`: it retains alpha[0], beta[0],
betaG2 and the native alpha slice length, the only commons fields accessed by
pinned `Phase2.Seal`. Other points are streamed through the pinned guard.
This partial object must never be used for initialization or phase-1 checks.

For opening (domain 2^23), the original full commons has about 3 GiB of point
payload and all four Lagrange tables total 2.5 GiB. The staged FFT retains one
0.5 GiB G1 or 1 GiB G2 table at a time. CS, FFT twiddles, accumulators, Go heap
and arithmetic temporaries add memory: these numbers are not a measured peak.
The staged worker targets 4 GiB Go memory with GOGC=25, and keeps an address-space limit, CPU/wall limits, a Go memory target
and the existing host-pressure stop. The staged path starts with 10 GiB
available, preserving the 4 GiB host-pressure floor. The completed v6/v7 game-domain measurements are recorded in
`docs/benchmarks/timelock-opening/local-mpc-staged/README.md`; they describe
those frozen binaries, not a new measurement of later source changes.

`Seal` filters A/B/B2 in their existing buffers, then delegates the beacon
contribution, domain, commitment keys and VK construction to native
`Phase2.Seal` with empty wire vectors. It fills the same public PK vector and
infinity-mask fields afterward. This avoids three full wire-vector clones
(about 1.64 GiB of point payload for opening). The caller relinquishes its
in-memory evaluation vectors; the original evaluation cache is unchanged.
Native key-byte comparisons, proving tests and separate-process export/load
checks cover this adapter too. Invalid dimensions or inconsistent G1/G2 B
infinity masks fail before the beacon update. This remains an experimental
adapter requiring independent review before production.

Seal also checks domain/commitment/basis counts, public commitment translations
and the full wire partition before compacting vectors or updating the beacon.
These shape checks do not authenticate the provenance of caller-supplied objects.

After a completed initialization, the sequence controller can resume directly
with `--resume-initialization23 STAGE --resume-initialization23-sha256 PIN`,
alongside pinned commons23/keys22. It verifies initialization context and both
body hashes before contributions; no FFT or initialization assembly is repeated.
The optimized contribution/verification/seal profile requires 10 GiB available,
targets 5 GiB Go memory and samples a 5.5 GiB worker RSS stop every 100 ms. The
4 GiB host-pressure floor and kernel address-space/CPU/file limits remain.
The replay profile requests 5 GiB Go memory, GOGC=25 and four threads, with
10 GiB initial headroom. The completed v6/v7 runs measured these profiles;
the sampled RSS stop and Go target are not kernel memory quotas.

The [internal boundary review](../../../../../../docs/reviews/hidden-v2-staged-boundaries-internal.md)
records the subsequent CS-binding and failed-load corrections. It is not an
independent audit and does not change the status of the experimental keys.
