**Verdict: I found no blocking defect in the pasted code, but I can't confirm closure yet.** One E2E cleanup claim looks doubtful, and your final abort, crash, metrics and browser checks are still running.

This session doesn't include my earlier review or findings list, so I checked the fixes against your description. I ran nothing. I also didn't see `serve.sh`, `stack.ts`, `processes.ts`, `networks.ts` or the service handlers, and I'm taking the test-restoration report as you described it.

## Likely defect
**Implicit E2E run directories may not be cleaned (`apps/web/playwright.config.ts`).** The `webServer` config has no `gracefulShutdown`, and current Playwright then sends SIGKILL to the process group. If `serve.sh` cleans up through a shell trap, that trap never runs, so each implicit run leaks `/tmp/vendetta-e2e-*`.

This doesn't affect test correctness, only the "implicit ones cleaned" claim. To check, run the suite once without `VENDETTA_E2E_RUN_DIR` and look for leftovers. If that's the cause, add `gracefulShutdown: { signal: "SIGTERM", timeout: 5000 }` and make sure `serve.sh` handles TERM.

## Confirm in the files I didn't see
1. **Vite cache:** the launcher wipes the environment, so `cacheDir` falls back to the repo default unless `stack.ts` passes its own. Without that override, the guide's "caches stay inside the session" is false, and the cache is shared with other dev sessions.
2. **`counters.proofs`:** `stats()` also returns separate local `proofs` and `cacheHits` values. Seeding would hide a missing `metrics.increment("proofs")`, leaving that counter permanently 0. The impact is low because `requests === 0` still rules out proofs, but the recorded `proofs` field would mean nothing.
3. **Canary check:** Vite only injects env values into modules that use `import.meta.env`. If `networks.ts` doesn't use it, `shellViteCanaryAbsent: true` proves nothing about env exposure.
4. **Signal during startup:** Ctrl-C exits 0 only if `startLocalHiddenStack` rejects with the exact `signal.reason`. A wrapped error exits 1, which is safe but noisy. Your abort run should show which one happens.

## Minor, non-blocking
If a runtime failure is followed by both a cleanup failure and a failed `closed.json` write, the CLI throws the cleanup error instead of the original failure. Unless that aggregate includes the reason, the root cause is lost from both stderr and disk, and a full disk could cause exactly this sequence. The exit code is still nonzero.

## Checked, no defect found
- **CLI:** signal, fatal and cleanup failures are ordered correctly, and later fatals still exit 1. Listeners are removed before the final rethrow, and a late `stack.failure` rejection stays handled.
- **Playwright run path:** workers inherit the path because it's set before they fork, so the helper and server use the same run.
- **Worker:** I found no race between close, abort, timeout and job start, since the last `check()` and `start()` run synchronously. SIGKILL is awaited through `close`, and stale output is removed on failure.
- **Service close:** a repeat `server.close` still calls its callback, so the embedding path can't hang. `allSettled` ensures the lease is released, and only after the worker has exited.
- **Beacon:** the timeout covers both the fetch and the body read, and the size limit is enforced.
- **Metrics and smoke:** seeding is correct, and hash-route navigation keeps the `pageerror` listener attached. The canary result is reported honestly, as `null` when no canary was supplied.
- **Guide:** the shutdown wording matches the code shown, with no hard bound claimed for filesystem hangs.
- **Lifecycle tests:** they cover the scenarios you listed, and the `contracts/.env` mock is narrow.

## Closure
Closure needs the E2E cleanup check, confirmation of the first item above, and passing final runs. This review isn't production approval, and it adds no new real proving or replay evidence.