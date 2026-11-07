**Verdict:** there's one small mandatory defect left, so this line isn't ready to close yet. The instrumentation fix is correct, and I found no state-safety defects. This was a source review only: I ran nothing, recomputed no hashes, and can't confirm the test results or archived-output check. It isn't independent evidence and doesn't change any gate.

## Mandatory fix

**Two deterministic opening rejections are still missed (`service.ts`, `proof-cache.ts`):**
- **Cause:** `MissionV2Consumer` also reverts with `InvalidExhaustionClaim` and `MismatchedScalar`, but neither is in `openingAbi` or the rejection allowlist. Neither name can decode, so neither rejection gets a reason.
- **Reachable case:** on an exhausted prefix, an artifact with a zero scalar but non-zero `x[14]` or `x[50]` can pass the local scalar check, assuming exhausted state stores scalar 0 (see the contract check below). `check` then reverts with `InvalidExhaustionClaim`. This takes a prover fault or a corrupt cache entry that's still well-formed, so it's the same fault class as the last fix.
- **Impact:** the artifact is retained and `proofRejections` stays at 0. The same cached artifact fails on every retry until age pruning. Each failure also aborts the keeper's `tick()`, so later missions and `advance` are blocked too.
- **`MismatchedScalar`:** the local `Prefix scalar mismatch` check should already catch this one, assuming statuses 2 and 3 are the terminal states. Add it anyway so the ABI and allowlist match every artifact rejection the consumer can raise.
- **Fix:** add both errors to `openingAbi`, `ProofRejection` and the allowlist. Keep `UnfinishedPrefix` retained, because it isn't an artifact rejection.
- **Docs:** update the rejection list in `docs/service-operations.md`.
- **Test:** the current tests build their own ABI, which is why they couldn't catch this. Export the real `openingAbi` and `pointAbi`, encode each consumer error from those, and assert that it's evicted and counted exactly once. Assert that `UnfinishedPrefix` and an unknown selector are retained. This stays synthetic, with no proving.

## Contract check required

`H3Prefix.sol` wasn't in the paste, so I can't call this a defect. Confirm these two points:

1. **Status values:** `ACCEPTED` and `EXHAUSTED` must be exactly 2 and 3, as `prefix()` assumes.
2. **Exhausted scalar:** `states(receipt)` must return scalar 0 once exhausted. If it can be non-zero, a valid exhaustion proof with `supplied == 0` fails `Prefix scalar mismatch`, which now evicts it and forces a re-prove on every retry. In that case, compare scalars only for `ACCEPTED`, and let the consumer enforce the exhaustion rules.

## Confirmed closed

| Area | Result |
|---|---|
| **Rejection reporting** | `proofRejections` starts at 0, and the callback runs before eviction and logs only `{kind, reason}`. |
| **Error preservation** | The original rejection and any observer or eviction failures are all kept. |
| **Verifier failures** | Both consumers wrap them as `InvalidProof`. |
| **Point consumer** | Its three errors all match `pointAbi`. |
| **Opening `false`** | It's a legitimate result: it's returned only after the proof verifies, with `valid = x[50] == 1`, so it shouldn't evict. |
| **Word bounds** | The 128-bit limit and boolean indices 14, 45, 46 and 50 match the opening consumer, and the 128-bit limit matches the point consumer. |
| **Doc corrections** | `UMask=0077`, `StateDirectoryMode=0700`, `systemd 259` and the caught-path policy now read correctly. |

I accept skipping the timing-sensitive keeper test, since the guard is correct by inspection. I also accept not adding a force-exit handler on the stated caught-path rationale. Neither is mandatory.

## Evidence impact

This fix changes `service.ts` and `proof-cache.ts`, so the acceptance run on the frozen code won't match the final source. Let it finish as a historical record, or stop it. After the fix:
1. Rerun the unit tests and both typechecks.
2. Rerun the local full-factory acceptance with `state-lease.ts` pinned.
3. Refresh the pins.

Unless the contract check finds a problem, I don't expect another code round to be needed.

## Still open, no production approval

- The cross-UID root sandbox, target-host resource bounds, alerts and provenance acceptance remain gaps.
- Hidden mission correctness and circuit soundness aren't established, and these reviews don't supply independent participation.
