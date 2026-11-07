## Verdict

**Build persistent resume, limited to chain snapshots taken after the writers stop.** I found no confirmed recovery defect in the supplied code that should come first. Startup cancellation, signal handling, process-group cleanup, failure propagation, and cleanup receipts hold up on inspection. I reviewed only the pasted sources and ran nothing.

## Code-supported findings

### 1. A non-chain failure destroys the chain (highest value)
This is a design limitation, not a bug:
1. The keeper starts as a daemon, so any unexpected exit reaches `processes.fail()`.
2. `stack.failure` rejects, and `local-hidden.ts` calls `stack.close(failure)`.
3. `close()` stops Anvil, which is the only copy of the chain.

The chain could still be healthy, but losing the keeper loses the world and strands the journals. Resume can fix both this and a normal stop without adding a keeper supervisor.

### 2. `close()` already has the right snapshot point
Keeper and producer stop before Anvil, so a snapshot can go between `web.close()` and `processes.stop(anvil)`. Taking it there keeps the chain at or ahead of every journal write. Periodic snapshots could leave the chain behind the journals, so don't use `--state-interval` or reuse an older snapshot.

A clean exit reason isn't the right resume gate, because a keeper crash should still be resumable. The gate should be that writer shutdown succeeded and Anvil was alive for the snapshot.

### 3. Pending transactions need flushing
`--block-time 1` means a transaction can still be pending when the keeper stops. Mine a block after the writers stop and before the snapshot, unless the spike shows pending transactions survive.

### 4. Signer continuity is smaller than the docs imply
`Deploy.s.sol` receives no H3 or keeper address, so the deployment step doesn't appear to bind those signers. Even so, persist `h3Key` and `keeperKey` in a mode-600 file before funding, in case the journals depend on them. `deployKey` isn't needed on resume, and `producer-clients.json` already keeps the token.

### 5. Files and tests assume one start
- **Files:** `wx` writes for logs, `inputs.json`, `deployment.json`, `producer-clients.json`, `stack.json` and `closed.json` all block a second start. Keep the world files once, and put logs and receipts in an exclusively created `generations/N/`.
- **Tests:** the `LocalProcesses` mock has a `failure` promise that never rejects and a no-op `check()`, so these lifecycle tests can't exercise runtime failure. The new tests need a controllable mock.

## Work line

1. **Spike with a real Anvil and a trivial event contract.** This needs no MPC, setup, or proving. After restore, check:
   - head number and historical block hashes, which matter because the keeper has reorg logic
   - `eth_getLogs` from `fromBlock`, receipts and nonces
   - monotonic timestamps and continued block production
   - whether `anvil_dumpState`/`anvil_loadState` or `--load-state` works better

   **If hashes or logs don't survive, stop here and keep sessions single-use.**
2. **Read the unsupplied sources.** Check `keeper.ts`, `prover/recovery.ts`, `prover/jobs.ts`, `prover/worker.ts`, and `prover/service.ts` for:
   - any journal binding to signer, token, or chain head
   - how a journaled transaction hash that no longer exists is handled
   - whether `producer.close()` is safe when the server never started listening
3. **Save the snapshot on close.** Use temp file, fsync, rename, then directory fsync. Record `chainSaved` and the reason in `closed.json`.
4. **Add `--resume <session>`.**
   - Reuse `loadLocalStackConfig`, which only checks pins, and require them to match `inputs.json`.
   - Re-hash `bin/producer` and verify `hiddenConsumers`.
   - Skip the forge build, deployment, funding, and binary copy.
   - Refuse a `gameAbi` hash that differs from the session's, because the web and keeper run current repo code against the old chain.
5. **Invalidate the snapshot immediately before the producer starts.** A resume that fails earlier can retry. After that point, only a new snapshot can make the session resumable, so a SIGKILL or host crash ends in a clear refusal.
6. **Update the docs.** Replace the single-use section and state the limits: Anvil crash, SIGKILL, and host crash remain unrecoverable. `smoke:hidden-v2` stays one-shot, and production gates don't change.

## Focused tests

| Scenario | Expected result |
|---|---|
| Normal close | Order is keeper, producer, web, mine, snapshot, Anvil; this updates the current order test |
| Runtime keeper exit | Snapshot saved, reason recorded |
| `producer.close()` rejects | No snapshot, resume refused |
| Anvil already dead | `chainSaved: false`, resume refused |
| Interrupted snapshot write | No valid snapshot is visible |
| Resume with a missing or consumed snapshot, or changed pins or ABI | Refused before any Anvil, forge, funding, or deployment event |
| Resume start | Same persisted signers, no forge, funding, or deployment events |
| Failure before or after producer start | Snapshot kept before, consumed after |
| Second generation | First-generation logs and receipts stay byte-identical |
| Pending fake-binary job across resume | Same job continues with no real proving |

## Done when

On a fresh local session with a fake-binary job, stop and resume keep the same Game address and restored chain history, and the keeper and producer continue from their journals. A failed keeper leaves a resumable session, and a session without a valid snapshot is refused. All writes stay inside the session directory, so archived artifacts are untouched.

Keeper auto-restart, health monitoring, periodic checkpoints, and crash-consistent recovery are out of scope.
