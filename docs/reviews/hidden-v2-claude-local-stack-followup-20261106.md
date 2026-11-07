**Verdict: not ready to close yet.** The startup and shutdown corrections hold up on the normal paths, and I found no problem in the Vite, forge race, process-group, env-stripping or passkey fixes. Five issues remain, plus gaps in the tests and guide.

This is based only on the pasted code; I ran nothing. I haven't seen `service.ts`, `keeper.ts`, `flow.spec.ts`, `package.json` or `DeployTest.s.sol`.

## Fix before closing

1. **The E2E consumer check reads the wrong build (`e2e/test-evidence.ts`).** `serve.sh` now compiles to `$work/out`, but the check still reads `contracts/out/.../HiddenConsumerMock.json`.
   - A clean checkout fails with ENOENT, and a stale build fails with a false mismatch.
   - A pass only means an older shared build happens to match, so the run isn't isolated.
   - In default mode, the test can't find the `mktemp` directory. Have `playwright.config.ts` always set `VENDETTA_E2E_RUN_DIR` to a fresh path that `serve.sh` creates, and read the artifact from there.

2. **The zero-certificate check can pass without measuring anything (`local-hidden-smoke.ts`).** `counters?.requests ?? 0` passes if the field is missing or renamed, and the same goes for `proofs`. `certificateRequests` in the result file inherits this. Assert that both are numbers, then that they equal 0, and confirm `requests` counts certificate requests rather than HTTP traffic.

3. **Real failures can exit 0 (`local-hidden.ts`).** The catch ignores any error once the signal is aborted.
   - **Hidden failures:** if a startup failure is followed by Ctrl-C during its 5s cleanup, or cleanup fails after a signal, the error is swallowed.
   - **Fix:** ignore the error only when `error === controller.signal.reason`.
   - **Related (`stack.ts`):** if writing `closed.json` fails, the collected cleanup errors are lost. Throw them together.

4. **An orchestrator crash leaves services running.** Vite and the producer run in-process, while Anvil and the keeper are detached. An uncaught exception or unhandled rejection kills Node without calling `close()`, so both keep running and hold their ports. Route both events into the same shutdown path, for example `controller.abort(error)`, and treat that reason as a failure. The guide covers SIGKILL and host crashes, but not this case.

5. **Shutdown is unproven with a proof in flight.** All the shutdown evidence comes from stacks with no jobs. `close()` awaits `producer.close()` with no time limit, and repeated signals are deliberately ignored. If that call waits on a long proof, Ctrl-C appears to hang, Anvil stays up and `closed.json` isn't written. Check `service.ts`, then bound or cancel the wait, or document the expected duration. Add one test with a fake native binary that ignores SIGTERM.

## Mocked lifecycle test credibility

The test is credible for shutdown order, idempotent `close()`, and cleanup when the failure receipt can't be written. It doesn't back several of your other claims:

| Claim | Why it isn't covered |
|---|---|
| Failures are observed during receipt polling and forge | `failure` never rejects, and `check()` and `fail()` do nothing |
| Abort stops the active command | No test uses a signal, and `closed` resolves immediately |
| Authenticated readiness happens before the keeper | The fake server returns 200 to everything, and order isn't asserted |
| `close(reason)` records the failure | `closed.json` `reason` is never asserted |
| One cleanup failure doesn't block the rest | The mocked `stop` can't reject |

Keep the existing tests and add one fixture that subclasses the real `LocalProcesses`, swapping only the spawned commands for small Node scripts. That needs four cases:
- A daemon dies during forge, and startup rejects promptly.
- An abort arrives during forge.
- Metrics returns 401, and the keeper never starts.
- `stop` rejects, and the later cleanup steps still run.

Two smaller cleanups:
- The test touches the real `contracts/.env`, so it fails on a machine that has one. Make that path injectable. `waitForTransactionReceipt` in the mock is also dead code.
- In `local-hidden-processes.test.ts`, the "does not signal" test installs its spy after the `close` handler's group kill. It only proves that nothing is signaled afterward, and it never exercises "twice", so rename it.

## Smoke and fixture gaps

- **Route checks are weak:** `main` being visible may pass on a broken route. Assert a route-specific element and fail on `pageerror`.
- **Canary result can be meaningless:** `shellViteCanaryAbsent: true` means nothing unless the launcher was started with that canary. Record whether it was supplied.
- **Vite cache is still shared:** `serve.sh` uses the default cache directory, unlike the stack, so it can collide with the 5199 server you leave running. Set `cacheDir` under the run directory.
- **`contracts/.env` can leak into the fixture:** `env -u` doesn't stop forge loading it. If `DeployTest.s.sol` reads those variables, apply the stack's refusal here too.
- **Possible hardcoded ports:** check `flow.spec.ts` and its helpers for `5199` or `8555`, and check how an unset screenshot directory behaves.
- **Stale comment:** `playwright.config.ts` says each run starts a keeper, but `serve.sh` doesn't.

## Guide gaps

- **Real mission path:** state plainly that a hidden mission has not been run end to end through this launcher's keeper → producer → consumer wiring. The current text only limits what the smoke does.
- **Requirements:** add the `contracts/.env` refusal, outbound access to drand, and expected RAM and proof time. Without those, a normal wait looks like a stuck mission.
- **Crash recovery:** `stack.json` is written last, so a crash during startup leaves no PIDs for the recovery steps. Point to the ports in that case.
- **Reused browser profile:** the web origin stays the same across sessions, but the smoke always uses a fresh browser context. Check once that a second session in the same profile has no stale account or cached state, or document clearing it.
- **Documented command:** confirm your HUP, TERM and INT runs went through `pnpm dev:hidden-v2`, not directly to the Node process. Also confirm the prompt doesn't return before cleanup finishes.

Items 1–4 are small fixes. Item 5 and the fixture cases are what will make the shutdown and failure claims rest on tests. Once the guide is updated, I'd close this without adding more checkers.