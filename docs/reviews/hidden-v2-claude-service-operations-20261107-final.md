**Verdict:** this line isn't ready to close yet. I found no state-safety defects in the pasted code, and the logging policy is sound, but three small code fixes and a few doc and test corrections remain. This is a source review only: I ran nothing, so it isn't independent evidence and doesn't authorize any gate.

## Mandatory fixes

1. **False success log in the keeper (`keeper.ts`):** if a stop arrives after the certificate returns, `call()` returns without sending. The next line still logs `certificate submitted`. Have `call()` return whether it sent, or check `stop.requested` before logging.

2. **A corrupt cached proof can stall the keeper for up to 7 days (`service.ts`):**
   - **Cause:** `writeProducerJSON` is atomic if a process dies, but it doesn't fsync, so a power loss can leave a truncated or empty proof.
   - **Impact:** `JSON.parse` then fails without `ENOENT`, so every retry fails the same way until the file is pruned. The keeper's tick also throws, so later missions and `advance` are blocked.
   - **Fix:** delete the file and treat it as a cache miss when a cached proof fails parsing or `Invalid producer artifact` validation. This stays in TypeScript, so the Go binary doesn't change, and a fake worker can test it without proving.

3. **Allowlist gaps make failures hard to diagnose (`service-errors.ts`):**
   - **Startup config errors:** an empty `HIDDEN_PROVER_TIMEOUT_MS=` or `HIDDEN_PROVER_CACHE_MAX_*=` becomes `0` and fails closed. It then logs only `{"type":"Error"}` and restarts every 30s, as do other unlisted config errors.
   - **Retry reasons:** queue full, beacon not arrived, mission not awaiting evidence, producer closing and packet not indexed all look identical. Allowlist the static messages, and make the dynamic keeper messages static, with any mission ID in a separate numeric field.
   - **Missing errnos:** add at least `EROFS`, which `ProtectSystem=strict` makes likely, plus `ECONNRESET`, `ENOTFOUND`, `EAI_AGAIN` and `EPIPE`.
   - **Cache cleanup warning:** log `serviceErrorSummary` for the failure, because the current warning drops the errno.

## Doc and test corrections

- **Logging claim:** the policy covers caught paths only. Uncaught exceptions and unhandled rejections still use Node's default output, including the stack. I found no reachable secret-bearing path in this paste, but several modules weren't included. I recommend a small `uncaughtException` handler in both entry points that logs the summary and exits 1.
- **`STATE_DIRECTORY` claim:** the comment says this value is independent of `EnvironmentFile`. From memory, env-file values override it, so a file that sets both variables would pass the check. Reword the comment and docs to cover a stray single override, and name `ProtectSystem` as the backstop.
- **File permissions:** PID 1 reads `EnvironmentFile`, but the service UID reads `HIDDEN_PROVER_CLIENTS_FILE`, the deployment file and the keys. The docs should say the clients file must be readable by the producer only.
- **Test isolation:** both new test files spread `...process.env`, so an inherited `RPC_URL` overrides the fixture and sends the request to that endpoint. Set `RPC_URL` explicitly.
- **Summary tests:** the paste has no unit test for `serviceErrorSummary` covering secrets in messages, nested causes, aggregates or depth limits. The CLI tests only cover the startup outage, so add one if it doesn't already exist.
- **Doc formatting:** restore the missing spaces, such as `mode0077`, `TimeoutStopSec150` and `every30s`.

## Optional cleanup

- `cacheHealthy` is briefly false during every normal pre-job prune, so an alert on it could flap. Set it to false only on failure.
- `proof!.destroyed` may race the socket close, and process exit would destroy the socket anyway. The real cancellation evidence is exit 0 well before the 120s deadline, so use `vi.waitFor` or drop that assertion.
- A `.proof.json.tmp` file left by a SIGKILL isn't pruned. It's small, and a retry of the same job removes it.

## Confirmed closed

| Area | Result |
|---|---|
| **Lease ordering** | `closing` is set synchronously and the handler has no `await` before `enqueue`, so `drain()` sees the final tail. The lease is released last. |
| **Queued jobs** | They fail at `assertOpen`, and the tail intentionally swallows ordinary job errors because callers still receive them. |
| **Beacon** | The 15s deadline covers the body, and `assertOpen` runs after the fetch. |
| **Journal retention** | The prune regex can't match `h3-*` or the lock file. |
| **Cleanup errors** | Primary, cleanup and lease failures are all kept, and maintenance-only failures keep the valid certificate. |
| **Native environment** | Both native paths use the filtered environment, and empty limits fall back to the defaults. |
| **Unit separation and restarts** | Users and groups are distinct, and transient outages no longer cause a start-rate lockout. |
| **Logging policy** | Names, codes and messages are exact-match, nesting is bounded, and worker stderr is discarded. No bypass exists. |
| **Evidence labels** | The `null` addenda fix the N/A ambiguity and preserve the original runs. |

## Target-host acceptance (not code defects)

- Disposable system-scope run covering `User=`, `ProtectSystem`, `ProtectHome`, `StateDirectory` and the real Node/`tsx` entry together
- Account creation, Node version, production `tsx` install and secret file permissions
- `STATE_DIRECTORY` precedence on the target systemd version
- Resource drop-ins, alert destination, HTTPS, funding, reorg policy, backups and provider availability
- Real stop durations, since 150s stays an escalation budget and not a graceful-stop SLA

## Outside this line or prohibited

- MPC, FFT and setup work, plus secure setup provenance, which stays blocked in application code
- Proving, replay and real deployment
- Hidden mission correctness and circuit soundness

Codex and Claude reviews don't supply independent participation, and nothing here changes a production gate.

**Next:** after these fixes, rerun the unit tests and both typechecks, and refresh the source hashes. Keep the existing real-entry evidence labeled with its old hashes unless the owner allows that local run again, because `service-errors.ts`, `service.ts` and `keeper.ts` will all change.
