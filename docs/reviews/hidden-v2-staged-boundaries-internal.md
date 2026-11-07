# Internal review: staged adapter input boundaries

Date: 2026-11-05. Base commit: `fe95eab`. Scope: the public `mpcstaged`
package entry points and cache-result handling, with caller inspection in
`cmd/mpc-local-pipeline/phase2_init.go`. This is a local code review by the
implementing agent, not independent audit or approval of the adapters or setups.
No game-domain setup, FFT or Groth16 proof was rerun.

## Findings and corrections

### CS identity was enforced by the CLI but not by Prepare

`NewStore` binds its index to a declared CS digest. Previously `Prepare` only
checked that the supplied compiled CS fit the domain; it did not compare the
actual CS bytes with that digest. A caller could pass a different same-shaped
relation. With a complete resumed cache, `Prepare` returned successfully without
opening commons, so a mismatch need not trigger any later recomputation.

The existing CLI reads the CS through `mpcstream.ReadCompiledCS` and derives its
shape with `mpcinspect.ShapeFromCS` before calling `Prepare`; both check the CS
pin. This finding does not establish a bypass in the completed CLI runs.
It matters for direct reuse of the package, including a future importer.

`Prepare` now streams the supplied CS through SHA-256 and compares against the
store context before any cache use, commons read, event emission or FFT. It
rejects a nil store as an error. The hash authenticates correspondence to the
supplied pin, not the provenance or correctness of the relation. It does not
allocate a serialized CS buffer. Callers must retain exclusive ownership of the
CS during the call; this is not a concurrency barrier against mutation after
hashing. The extra pass has not been benchmarked on game-domain sources in this
revision; historic capacity measurements describe the pinned v6/v7 binaries.

Regression: mutate a coefficient while preserving dimensions, once against a
fresh store and once against the final pinned index of a small completed cache.
Both cases were accepted before the fix. Both now fail before any commons open
or cache callback.

### Failed vector loads exposed partial results

`LoadG1` and `LoadG2` previously returned the decoder's allocated slice together
with an error. An invalid encoding with a matching index pin could return partial
points, and a failed post-decode checkpoint callback could return all points.
Existing initialization callers check the error; this review found no successful
initialization based on these failed results.

Both exported loaders now return nil points on every error. Regression tests
supply malformed native encodings with matching hashes so rejection exercises
the decoder rather than just digest checking; separate tests fail the callback
after valid G1/G2 decoding. All four paths returned points before the fix and
return nil after it. This is an API misuse defense, not transcript verification.

## Validation and remaining boundaries

### Subsequent descriptor-opening correction

The cache's shared `regular` reader used `Lstat` followed by `Open`, leaving a
replacement window for a final symlink or blocking FIFO. It now opens with
`O_NOFOLLOW|O_NONBLOCK`, checks the opened descriptor with `Stat` and closes it
on rejection. Both resumed indices and vector readers use this helper. A new
test failed before the patch because the opened descriptor lacked nonblocking
mode; it now passes alongside regular-file acceptance and rejection of symlink,
FIFO, directory and missing paths. No adversarial game-cache replacement is
claimed to have occurred in the historical runs. Parent directories remain
trusted and immutable; this does not establish an atomic filesystem snapshot.

The separate evidence JSON reader received the same correction, with a
deterministic pre-patch reproduction of final-symlink substitution. Its 36-test
dossier wrapper and original-proof-JSON hash checks pass. These are file-opening
defenses, not a new cryptographic verification of game artifacts or provenance.
External evidence is preserved under
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-{evidence-open,cache-open}/`.
The descriptor patch passed 82 test/subtest events in `mpcstaged` (57) and
`cmd/mpc-local-pipeline` (25), plus offline vet. Tests only exercised small
fixtures; no game-domain computation, cache rewrite or measurement was repeated.

### Subsequent supervisor hash boundary

The later pipeline review also found `fileHash` using unrestricted `os.Open` /
`io.Copy` after the supervised worker had exited. It now reuses the protected
regular-file opener, rejects empty inputs or initial size above 2 GiB, and reads
at most initial-size+1 to reject truncation/growth. The external source paths
and parent directories remain trusted; this is not a hostile-filesystem sandbox
or a wall-time/I/O quota. The symlink regression failed before correction; the
complete pipeline suite subsequently passed 32 test/subtest events and vet.
Sparse size fixtures test rejection without allocating or reading large bodies.
Historical workers/binaries, cache files and measurement pins remain untouched.

### Earlier validation of CS identity and failed loads

Offline commands from the repository root, using the installed pinned SDK:

```bash
export GOPROXY=off GOTOOLCHAIN=local GOFLAGS=-mod=readonly
/home/rodrigo/.cache/vendetta-tools/go/bin/go -C apps/web/scripts/experiments/opening-zk test ./mpcstaged ./mpcstream ./mpcinspect ./cmd/mpc-local-pipeline -count=1 -json
/home/rodrigo/.cache/vendetta-tools/go/bin/go -C apps/web/scripts/experiments/opening-zk vet ./mpcstaged ./mpcstream ./mpcinspect ./cmd/mpc-local-pipeline
/home/rodrigo/.cache/vendetta-tools/go/bin/go -C apps/web/scripts/experiments/opening-zk mod verify
```

158 passing test/subtest events across those four packages, zero failures.
Coverage includes exact small native initial/evaluation/key bytes, positive and
negative small Groth16 tests, resume at persisted boundaries, decoding guards,
separate-process export/load and resource-stop regressions. These tests use small
circuits; the three game proofs and their original setups remain untouched.

This scoped review does not establish correctness of the FFT or accumulation
math for all dimensions, authenticated independent participants, a post-closure
unpredictable beacon, secure artifact provenance or production capacity. Cache
pins authenticate local bytes but do not prove the computations that produced
them. Layouts and compiled CS are still trusted compiler outputs; arbitrary
untrusted CS deserialization is not made safe by these changes. The existing
production barriers stay active, with independent review and the externally
chosen approval policy still required by the
[review preparation](../proposals/hidden-v2-review-preparation.md).
