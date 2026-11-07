**Verdict:** this line still isn't quite ready to close, because the eviction fix needs one small addition. All three previous mandatory fixes are correct, and I found no state-safety defects in the pasted code. This was a source review only: I ran nothing and didn't recompute any hashes, so it isn't independent evidence and doesn't change any gate.

## Mandatory fix

**Proof rejection is silent and can repeat indefinitely (`proof-cache.ts`, `service.ts`):**
- **Cause:** `withProofVerification` evicts a rejected proof without recording it anywhere. `serviceErrorSummary` also strips the decoded error name, so `InvalidProof` (evicted) and `UnfinishedPrefix` (retained) can both reduce to the same summary.
- **Impact:** if a consumer keeps rejecting a proof, each keeper retry repeats the beacon fetch and native proving, with no limit. Before this fix, that case stalled cheaply. It needs a prover or verifier fault, since startup binds the setup to the verifier, but operators still couldn't see or distinguish it.
- **Fix:** add a `proofRejections` counter and a static warning on eviction, with only the error name from the three-name allowlist and the circuit kind. A retry cap isn't needed for this line.
- **Test:** use a synthetic rejection, with no proving.

## Check against the contracts

The Solidity wasn't in the paste, so I can't call either of these a defect:

1. **Error names:** confirm that a bad proof reverts through `check` as exactly `InvalidProof`, `WrongStatement` or `NonCanonicalWord`. The test uses a synthetic error. If the verifier's own error bubbles up under another name, the proof is retained and the stall remains for that case.
2. **Ignored opening result:** the point path checks the returned `bool`, but the opening path discards `(bool, bytes)`. Confirm that `false` is a legitimate outcome and not a rejection. If it is a rejection, it needs the same handling as the point path. The keeper's simulation or the consumer should still stop a bad submission, so this is a retry and diagnosis issue, not a safety one.

## Test and evidence corrections

- **Missing tests:** the pasted tests don't cover `WrongStatement`, `NonCanonicalWord`, the three local rejection messages, or the eviction-failure aggregate. One parameterized test would cover them.
- **Missing keeper test:** nothing exercises the stop-after-certificate path where `call()` returns false. The code is correct, but it's untested.
- **Evidence pins:** `executionSources` omits `state-lease.ts`, yet the result claims `cacheLeaseReacquired`. Add that file to the pins on the next run.
- **Doc wording:**
  - `state directories, mode 0077` describes a umask. Read literally as a directory mode, it would deny the owner, so state the real `UMask` and directory mode from the unit.
  - `systemd259` still needs its space.

## Non-blocking

- **Uncaught-exception rationale:** draining journals isn't a valid reason to skip the handler, because Node's default uncaught behavior already exits without draining. Skipping it is still acceptable, since the journals are built to survive abrupt exits and no leak path is known. Just don't record that reason.
- **Malformed generated JSON:** it throws before the validity check and leaves the file in place. The next retry evicts it, so this heals itself.
- **`proofs` metric:** it increments before validation, so it counts invalid artifacts too.

## Confirmed closed

| Area | Result |
|---|---|
| **Keeper log** | It logs only when `call()` returns true, and the stop check runs first. |
| **Cache eviction** | Empty, truncated, wrong-shape and wrong-binding files become misses, while other I/O errors still propagate. |
| **Verification** | The shared wrapper covers cached and fresh proofs, and `walk` reaches the reverted error through viem's wrapper. |
| **Retained errors** | RPC outages, closing and unfinished prefix keep the cache. `begin` and `advance` write failures can't trigger eviction. |
| **Logging** | Every message thrown in the pasted code is allowlisted, and `missionId` is validated as numeric. Unknown values are omitted. |
| **Test isolation** | `RPC_URL` is explicit in both child test files, and the `destroyed` assertion now waits. |
| **`STATE_DIRECTORY` docs** | They now claim only stray-override detection. |

## Still open, no production approval

- The root-manager sandbox run and the target-host bounds, alerts and provenance gaps remain open.
- MPC, setup, proving, replay and real deployment remain out of bounds.
- Hidden mission correctness and circuit soundness aren't established, and these reviews don't supply independent participation.

**Next:** make the fix, complete the two contract checks and rerun the unit tests and both typechecks. Then rerun local acceptance, since `proof-cache.ts`, `service.ts` and probably `metrics.ts` will change, and refresh the pins with `state-lease.ts` included. Unless a contract check finds a problem, I don't expect another code round to be needed.
