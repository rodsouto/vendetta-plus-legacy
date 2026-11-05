# Completed local staged MPC and Game/H3 replay

Both game circuits completed the unsafe local MPC protocol on this PC. The new
keys generated three real Groth16 certificates through the HTTP producer, actual
Solidity consumers, Game admission/receipts and H3 on private Anvil. The full
World matched for punctual and delayed execution, including cache revalidation
and H3 restoration after Anvil revert. There was no real-network deployment,
independent ceremony or production approval.

| Measured operation                                  |                       Peak RSS |                          Elapsed |
| --------------------------------------------------- | -----------------------------: | -------------------------------: |
| Opening initialization, staged v6                   | 3,132,063,744 bytes (2.92 GiB) |               5 h 8 min 22.786 s |
| Opening phase-2 native verification, largest sample | 5,370,855,424 bytes (5.00 GiB) |                   2 min 52.532 s |
| Opening key extraction, reduced copies              | 4,877,393,920 bytes (4.54 GiB) |                  11 min 38.594 s |
| Resident producer replay, sampled native peak       | 6,249,586,688 bytes (5.82 GiB) | 10 min 42.787 s for three proofs |

These are per-operation/process measurements. Phase-1 verification previously
reached about 8.43 GiB; the 2.92 GiB initialization result is not a ceiling for
all stages. Replay RSS was sampled every second and can miss peaks. Go memory
targets and sampled stop thresholds are not kernel RSS quotas. Hardware, swap
configuration and other projects' servers were not changed.

`completed-results.json` collects the final result, source evidence paths/digests,
three actual proof hashes and setup identities. `replay-results.json` records
real integration assertions; `replay-worker-results.json` contains resource
samples and per-proof measurements. `replay-verifier-runtime.json` binds deployed
verifier code hashes to the new manifests. Original proof artifacts and large
transcripts/keys remain outside Git at the recorded paths; previous setups and
benchmark evidence are preserved. Raw report copies retain their original bytes.

The opening manifest is
`e1c210611c3c110ff45027f7fc7f2459c2b065ee3ffcb3a1b9ed38a4dfcc1455`;
invalid-point is
`c4798b4f3ddc81c535c680a420b437fec9107ea007bc5c39c9504ff86a13a2c8`.
The replay used both new keysets and exactly one native worker at a time. The
second opening proof reused loaded artifacts; invalid-point used a separate
worker after the opening worker exited. The short replay does not establish
prolonged load, production throughput or remote RPC/beacon availability.

Implementation and arithmetic provenance are documented in
`apps/web/scripts/experiments/opening-zk/mpcstaged/README.md`. V6 computes and
persists one powers/FFT vector at a time, builds only inverse twiddles and releases
the decoded CS before final assembly. V7 filters seal A/B/B2 in their own buffers,
preserving native beacon/remaining key construction and exact key bytes on the
reference test circuits. These are experimental adapters requiring independent
review before production. They do not replace independent participants or an
unpredictable post-closure beacon; fixed known beacons and unsafe flags remain.

Validation: 149 passing Go test/subtest events in four packages, 31 Python tests,
Go vet, exact small-circuit native initial/evaluation/key-byte comparisons,
positive/negative Groth16 tests, cache corruption/context rejection and recovery
from every persisted boundary. Separate workers cover export/load and complete
cache resumption. Race instrumentation was unavailable without cgo/CC; no tools
were installed. V6/V7 binaries reproduced offline with identical SHA-256 from
their frozen source archives. Launch/reproduction receipts retain commands/pins.

Historical attempts are preserved. Native v4 initialization stopped under probable
host pressure; staged v5 stopped when host-available memory fell below 4 GiB.
`v5-memory-stop.json` retains its true stop sample; the original final failure
field was overwritten by a later RSS-observation race, corrected in v6. V6
completed initialization; its controller was then intentionally stopped while
waiting for the old 12 GiB preflight. V7 reused the completed initialization and
finished contributions/verification/extraction with the optimized profile.
