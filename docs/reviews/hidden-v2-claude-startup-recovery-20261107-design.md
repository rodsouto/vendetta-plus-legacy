# Design review: post-consumption startup recovery

**The design is sound, but it needs the corrections below before implementation.** The main gaps are outcome reporting, consumption ambiguity, and a fixture that can't prove journal correctness. This review is based only on the pasted code: I ran nothing and didn't inspect `worker.ts`, `jobs.ts`, or `state-lease.ts`.

## Eligibility rule
Replace the snapshot's `ready` gate with `worldEligible`, leaving the loader and checkpoint schema unchanged.

| Session | `worldEligible` becomes true |
|---|---|
| Fresh | Immediately after `certificateProducer()` resolves and `producer` is assigned, before the next `check()`. `producer-clients.json` is already written by then. |
| Resume | Immediately after `consumeCheckpoint()` resolves, and only if all hidden validation passed. |

A snapshot also requires all of the following:
- `errors.length === 0`
- Anvil is alive
- The pending pool has drained
- Anvil exits with code 0
- `saveCheckpoint()` succeeds

**Authorization:** a checkpoint counts as saved only if `saved && closed.json was written && cleanupErrors === 0`. That matches what `loadCheckpoint` accepts.

**Resume order:**
1. Run `verifyRestored`.
2. Read `deployment.json`, `consumers.json`, and the token from `producer-clients.json`.
3. Check the on-chain consumers and directory bytecode through private `pub`.
4. Run the port check.
5. Consume the checkpoint.
6. Show the gateway and enable writes.

Remove the post-consumption block-hash recheck, since it becomes redundant.

## Code-supported risks
1. **Outcome is reported too early:** the "world was not saved" wrapper and `failed.json` are both created before `close()`. Write only the original cause to `failed.json`, then build the final error after `close()` settles.

2. **`chainSaved` can overstate the result:** it can be true while the checkpoint is unusable, for example if `gateway.close()` fails after the save or `closed.json` can't be written. Conversely, if `lease.release()` fails after the receipt, the checkpoint is usable even though `close()` rejects. Keep the outcome in a closure variable so the startup catch can read it even when `close()` rejects.

3. **Consumption can be ambiguous:** `.used` may exist even if `consumeCheckpoint()` throws, because the write or fsync can fail after creation. Track `none | attempted | durable`. If it is `attempted`, leave the world ineligible and report the source as `unknown`, never reusable.

4. **Fresh cancellation can exit 0:** `local-hidden.ts` suppresses an error that is exactly `signal.reason`. Wrap every failure once `worldEligible` is true, not just after consumption, or a fresh checkpoint could be saved with exit 0.

5. **Don't move the producer constructor before consumption:** it calls `pruneCache()`, which can change the digest-covered `cache` tree and invalidate the source checkpoint. It also uses the public RPC, which is hidden at that stage.

6. **Existing saved worlds won't resume on the new code:** `local-hidden` and `prover` are both in `sourcePaths`, so editing them changes the digest. Resume is refused before consumption, so those checkpoints stay intact, but acceptance needs a new session. Old receipts don't prove the new behavior.

7. **The lifecycle fixture has blind spots:**
   - `sha256File` returns a constant, so journal and snapshot drift can't be detected.
   - `LocalProcesses.check()` and `fail()` are no-ops, so child failures during startup never propagate.
   - The producer mock bypasses the real `close()`.

## Constructor and prelisten close
- **Constructor failure:** `producer` stays undefined and no producer writer has been exposed. Resume can still save, because the source world passed this gate and the config is pinned. A fresh session stays ineligible.
- **Lease handling:** a `lease.release()` failure in `certificateProducer` masks the constructor error, but the startup still fails. Given your no-production-changes constraint, leave this as is.
- **Worker check:** confirm that `new ProducerWorker()` doesn't spawn eagerly. If it does, a later constructor throw could leak a worker.
- **Prelisten `close()`:** from memory, Node should call the `server.close()` callback, but `closeAllConnections()` before `listen` may depend on the Node version. A synchronous throw there would happen before `shutdown` is assigned, leaving the lease unreleased. That fails closed but strands the world, so test the real service on your pinned Node version, including `worker.close()` and `enqueue.drain()` when idle.

## Test matrix

| # | Injection | `.used` | New checkpoint | Result |
|---|---|---|---|---|
| 1 | Consumer mismatch, or missing directory code | Absent | No | Nonzero; original retry works |
| 2 | Malformed deployment, consumers, or token file | Absent | No | Nonzero; original retry works |
| 3 | Abort or occupied port after validation, before consumption | Absent | No | Abort exits 0, port failure is nonzero; original reusable |
| 4 | `.used` write or sync throws | Present or absent | No | Nonzero; source `unknown`; no gateway or writers |
| 5 | Abort during consumption | Present | Yes | Nonzero and names the path |
| 6 | Constructor, prover listen, or readiness failure | Present | Yes | Keeps cause; retry uses new checkpoint |
| 7 | Keeper crash or timeout | Present | Yes | Same; requires a fixture that propagates failure |
| 8 | Vite, web listen, or `stack.json` failure | Present | Yes | Same |
| 9 | Journal mutated after consumption, real hashes | Present | Yes | New digest matches; source still refused; `.used` bytes unchanged |
| 10 | Keeper stop or producer close error | Present | No | Nonzero, unsaved |
| 11 | Anvil dead, pending pool stuck, or nonzero Anvil exit | Present | No | Nonzero, unsaved |
| 12 | `saveCheckpoint` failure | Present | No | Nonzero, unsaved |
| 13 | `closed.json` write fails | Present | Artifacts only, unauthorized | Reported unsaved; loader refuses |
| 14 | Cleanup error after save | Present | Artifacts only, unauthorized | Reported unsaved despite `chainSaved: true` |
| 15 | Lease release fails after receipt | Present | Yes | Nonzero, reported saved; loader accepts |
| 16 | Fresh failure before or during constructor | n/a | No | Nonzero |
| 17 | Fresh Vite failure or abort after constructor | n/a | Yes | Nonzero through the real launcher; resume works |
| 18 | Real producer closed before listen | n/a | n/a | Resolves and releases the lease |

Rows 5–8 also need to assert that the source artifacts are byte-identical and that a second retry from the source is refused. Add launcher-level tests for rows 3, 5, and 17, because exit behavior lives in `local-hidden.ts`.

**Existing tests to update:**
- `reports cancellation after consumption as an unsaved resume failure` now expects a saved checkpoint.
- Fresh tests for Vite and readiness failures now produce one too.
- Final error messages must keep the original cause text, since `toThrow("injected Vite failure")` depends on it.

## Decision for you
Should a `failed.json` write failure block the snapshot? I recommend **no**: report it, but let `saveCheckpoint` and `closed.json` decide. It's an unsynced diagnostic file, and blocking on it could strand a healthy world whose source is already consumed. If "storage errors" was meant to include diagnostics, set `worldEligible = false` on that failure instead.

## Docs to update
Update `docs/local-hidden-v2.md` wherever it says that:
- Failure after consumption can leave no usable checkpoint.
- Fresh cancellation has no world.

Also document that `checkpoint.json` without an authorizing `closed.json` must never be repaired by hand. SIGKILL, host crashes, and Anvil crashes remain unrecoverable.
