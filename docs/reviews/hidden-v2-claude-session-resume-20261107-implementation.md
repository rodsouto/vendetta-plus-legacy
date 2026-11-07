# Review: same-session checkpoint and resume

**Verdict:** I found no journal rollback path. Writers stop before the snapshot, `.used` is durable before Anvil starts, and old checkpoints can't be reused. The main remaining risk is **losing a healthy session**, because a checkpoint is consumed before it's proven loadable.

This comes from reading the pasted code only. I didn't run anything, and `config.ts` and `jobs.ts` weren't included.

## Confirmed issues

### High
1. **Anvil's time limits don't match the 512 MiB snapshot cap.**
   - `LocalProcesses.stop` sends SIGKILL after 5s, even if Anvil is still dumping state. The exit code is then `null`, so the checkpoint is refused.
   - The resume RPC wait is 15s, and a slow load fails after `.used` already exists.
   - With 1s blocks, the dump keeps growing, so long sessions are the most exposed.
   - **Fix:** add a per-process stop timeout for Anvil, and scale the startup deadline to snapshot size or lower the cap to a tested value. Warn before the cap is reached, because an oversized dump is only rejected at shutdown.

2. **A snapshot can be consumed without ever being proven loadable.**
   - `saveCheckpoint` only checks for a non-empty regular file, so a truncated dump would be accepted if Anvil still exits 0.
   - The Anvil binary isn't pinned either: `configIdentity` only records the path or `"anvil"`, so a PATH upgrade can break the load.
   - **Fix:** before `consumeCheckpoint`, load the snapshot in a scratch Anvil on the reserved RPC port, without `--dump-state` and with no writers. Verify the block and head, stop it, then write `.used`. Also record `anvil --version` in `session.json`.
   - This moves corrupt-snapshot and version failures into the reusable validation path, and it re-tests the RPC port just before consumption.

3. **Ctrl-C during resume startup kills the session but exits 0.**
   - After consumption, `check()` throws `signal.reason`, and `local-hidden.ts` treats that as a normal stop.
   - The result is no checkpoint, a consumed source, and a success exit code with no message.
   - **Fix:** exit non-zero and say the session wasn't saved. Failing closed is your design choice, but this reporting is still a bug.
   - **Optional:** on resume, replace the `ready` gate with a `chainVerified` flag set after the block and consumer checks. The same writers-stopped-then-snapshot path would stay safe.

### Medium
4. **Resume verification doesn't prove the head or signer state.** It only compares the hash at block N. Anvil keeps mining until SIGTERM, so the snapshot head is normally above N. Before starting writers, check that `latest >= N`, and compare keeper and H3 nonces recorded in the checkpoint.

5. **The required `closed.json` receipt isn't fsynced.** Everything else in the checkpoint is, so a power loss after a clean shutdown can invalidate a good checkpoint. Use `exclusiveJson`, and update the `writeFile` failure mock in the lifecycle test to match.

6. **Browser transactions aren't covered by the writer shutdown.** Closing Vite doesn't stop an open tab, because it talks directly to Anvil's RPC.
   - A transaction accepted after the drain check and left unmined at SIGTERM is lost. Journals aren't affected.
   - A nonce-gapped browser transaction blocks the checkpoint, which ends a resumed session. You chose that behavior, but it's easier to hit than the keeper or producer cases.

### Low
7. **A mistyped `--resume` directory leaves a trap.** `acquireStateLease` recursively creates the directory, and the leftover then makes a fresh start fail with `EEXIST`. Check that the directory exists before taking the lease.

8. **The next checkpoint path is never printed.** After the first resume, it's under `attempt-<uuid>/`, so print it after a successful close.

## Could not verify
- **Real config loader:** the lifecycle tests mock `loadLocalStackConfig`, so nothing shows it accepts an existing session directory on resume. If it rejects one, the real CLI can't resume at all.
- **Vite file access:** `server.fs.allow` isn't set, so Vite's default workspace-root access applies. If the session directory can be inside the repo, `session.json` may be reachable through `/@fs/`, and it now holds long-lived keys. Restrict `fs.allow` or require the directory to be outside the repo.
- **Anvil continuity after load:** your probes don't cover next-block linkage, timestamps or base fee. Base fee matters most: if it resets higher than the fee cap in a journaled raw transaction, recovery could stall in a retry loop.

## Missing tests
The current lifecycle fixture can't exercise several protections, because `sha256File` always returns the same value and the pool, block hash and Anvil exit code are all fixed.

| Priority | Test | Must prove |
|---|---|---|
| 1 | Real-hash `session.ts` tests | Tampering with `chain-state.json`, a journal, `session.json` or `bin/producer` is refused, and no `.used` is created |
| 2 | Receipt and path rejection | Rejects a missing receipt, `cleanupErrors > 0`, another generation's `closed.checkpoint`, symlinks and paths outside the session |
| 3 | Consumption ordering | `.used` exists when Anvil starts, and a binary or config failure leaves the source reusable for a later successful resume |
| 4 | Two consecutive resumes | Resume works from `attempt-*/checkpoint.json`; today's test only resumes from the root checkpoint |
| 5 | Shutdown refusal | Pending or queued timeout, non-zero Anvil exit, and SIGKILL after the stop timeout all publish no checkpoint |
| 6 | Restored hash mismatch | Startup fails before the producer or keeper starts |
| 7 | Real `LocalProcesses` lease | A child keeps the root lease after the parent closes its descriptor, and a second session fails until the child stops |
| 8 | Real Anvil journal recovery | A journal written but not broadcast mines the same hash on resume; a journal already mined settles without using a new nonce |
| 9 | Real Anvil continuity | Next block links to the head, timestamp and base fee behave as expected, and `getLogs` works from `fromBlock` |
| 10 | Signal during resume startup | Exit is non-zero and the output states the session wasn't saved |
| 11 | Secret canary scan | Keys and tokens are absent from logs, `failed.json`, `closed.json`, `stack.json`, `inputs.json` and the chain state |

I'd fix 1–3 first, then add tests 1–4, since they cover the session-loss paths and the checkpoint guarantees you're relying on.
