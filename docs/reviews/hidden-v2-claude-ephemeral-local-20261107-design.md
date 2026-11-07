# Review of the local Anvil removal plan

**Verdict: the plan is sound, with one fix required before removing the gateway and four items to check during implementation.** I reviewed only the pasted code and ran nothing. I didn't see `config.ts`, the tests, `package.json`, `serve.sh`, CI scripts, or the evidence validators.

## Fix before removal
**The gateway also holds the RPC port, so removing it can let startup use a foreign chain.**

- **Current protection:** `localRpcGateway` fails if `config.ports.rpc` is already taken.
- **New risk:** `assertPortAvailable` runs before `forge build`, which can take up to 120 seconds. If another local Anvil takes the port in that window, our Anvil fails to bind, but `waitForAnvil` can still get `31337` from the other node. Funding and deployment could then start there before `processes.check()` sees the exit.
- **Fix:** drop `--silent` and treat Anvil as ready only when its own `anvil.log` shows it listening on the configured port, as keeper startup already does. Confirm the exact line on the installed Anvil, and expect a larger log.
- **Avoid:** don't use a per-run mnemonic to prove identity. `key0` is hardcoded, and the `dev` browser accounts probably rely on Anvil's default accounts.

## Check during implementation
1. **Run directory safety:** the resume branch held the only `realpath` check visible in `stack.ts`. Confirm `config.ts` enforces a canonical external path, including symlinked parents, and has no resume-only allowance for existing directories.
2. **Fixed output paths:** `mkdir` now correctly fails with `EEXIST` on reuse, so any script or doc with a fixed output path will fail on its second run. Check `package.json`, `serve.sh`, `ci-local.sh`, and the docs.
3. **Orphans after SIGKILL:** Anvil will now hold the configured port, and a detached keeper can keep writing to it. The next start fails on the port check, which is safe, but the recovery steps should be documented. Keep `pids` in `stack.json`, noting it's only written after startup completes.
4. **Startup interruption exit code:** without `LocalStackStartupError`, an abort rethrows `signal.reason`, so `local-hidden.ts` exits 0 at every startup stage. Today that only happens before the wrapper becomes active. Set a non-zero exit code when `stack` is undefined.

## Keep these
| Item | Why it stays |
|---|---|
| `producer-clients.json` | Smoke runs in a separate process and reads the bearer token from it |
| `deployment.json` | Passed to the keeper as an argument |
| `verifyDeployment` and `consumers.json` | Real binding check; make it unconditional and keep the write before the check |
| `closed.json`, `failed.json`, `stack.json`, `inputs.json` | Diagnostics; remove only the checkpoint fields |
| `bin/producer` copy and hash check | Binary pin, currently mixed in with `!checkpoint` logic |
| Close order | Keeper, producer, and web stop before Anvil; only the freeze and checkpoint steps go |
| Dynamic import in `local-hidden.ts` | It must stay after the environment scrub |

`h3Key` and `keeperKey` can safely become memory-only because nothing restarts a service within a run.

## Mechanical cleanup
- **`stack.ts` naming:** replace `generation` with `run`, and watch for the `attempt` and `checkpoint` names shadowed inside `close`.
- **`stack.ts` removals:** remove `backendPort`, point `pub` at `rpc`, and drop the `60000` Anvil stop timeout. Remove `producerAccess`, `ProducerClient`, and the other unused imports.
- **Close results:** remove `LocalStackCloseResult` and the `Object.assign(..., closeResult)` call.
- **`executableIdentity`:** remove it, and spawn `config.anvil || "anvil"` directly. A missing Anvil will now fail after the build and use up that run directory, which is acceptable.
- **`session.ts`:** keep only `syncPath`, `exclusiveJson`, and `regularJson`, and use `syncPath` in place of `syncDirectory`. I'd rename it `receipts.ts` unless an archived pin names the file.
- **`processes.ts`:** no changes needed.
- **Smoke:** remove the `attempt-` branch and reword the "existing players are preserved" message, but keep the unplayed-world assertion.

## Check before deleting
- **Uncommitted work:** the worktree is heavily modified, and the truncated status doesn't show whether the `local-hidden` files are tracked. Check first, because deleting an untracked `rpc.ts` or `session.ts` can't be undone through git. Avoid `git checkout` and `git stash` here.
- **Evidence validators:** `hidden-v2-completed-evidence.py`, its test, and `manifest.json` may depend on `sessionDirectory`, `resumed`, `snapshotPolicy`, `chainSaved`, or these file paths. Keep archived evidence and its validation working.
- **Mixed test files:** remove recovery tests case by case, since those files may also cover process groups, leases, or environment isolation.
- **Remaining references:** search for these terms, then update active docs but leave archived records alone:
  - `--resume`, `checkpoint`, `session.json`, `attempt-`, `chain-state`
  - `localRpcGateway`, `unusedLocalPort`, `sourceDigest`, `sourcePaths`, `executableIdentity`, `LocalStackStartupError`

## Accepted differences
- **CORS:** the gateway handled it before. Anvil allows all origins by default, so this should match, and the browser smoke will confirm it.
- **Direct RPC exposure:** the gateway already forwarded all methods once writes were enabled. It did not forward WebSocket connections, which Anvil accepts on the same port. Its 1 MiB request limit and 15-second upstream timeout also go away. This stays on localhost, so I wouldn't add anything back.
- **Disk use:** retained run directories now grow without limit, because each one keeps its own cache, build output, and producer binary.

## Verification after implementation
None of these checks request a certificate or proof:
1. Run the typecheck and the remaining keeper, prover, and local stack tests.
2. Start a fresh stack and run the browser smoke.
3. Start again with the same directory and confirm it's refused.
4. Occupy the RPC port after the initial port check and confirm startup fails before any funding transaction.
5. Send SIGINT and confirm no managed process remains, the lease is released, and logs and cache are still there.
