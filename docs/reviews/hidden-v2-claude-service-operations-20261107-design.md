**Verdict:** this is the right next line, with one correction to its framing and two plan changes needed. I reviewed the pasted source only and ran nothing. This review isn't independent evidence and doesn't authorize any gate.

**Framing:** these are availability and operability gaps, not state-safety holes. A hard kill drops the `flock`, journals are written before broadcast, and `close()` kills the worker early. A keeper that skips `finally` loses little, because it has no children and the kernel releases the lease. The main gains are no new work after a stop, bounded stops and accurate exit status, so the docs shouldn't call this a safety fix.

## Plan changes needed

1. **Make keeper stop abort `requestCertificate`.** This is the biggest gap. Proof generation can outlast any stop window, and checks at async boundaries can't interrupt it. The keeper then gets SIGKILLed, or it submits after the stop if the certificate arrives first.
   - Pass a `fetch` wrapper that combines the stop signal with any existing one, since `requestCertificate` already takes `fetch` as a parameter.
   - The producer can keep its own job, and the proof stays cached.

2. **Put the last stop check inside the `prepare` callback.** A check before `call()` still allows simulate, sign and broadcast after a stop.
   - Check at the top of `prepare` and again after signing, both in `keeper.ts`.
   - Treat journal publication as the line: before it, abort freely; after it, never abort.
   - This leaves journal code untouched if a `prepare` throw writes nothing, which needs confirming in `recovery.ts`.
   - Add the same `assertOpen()` to the producer's `write` `prepare`, which currently checks only before `recoverTransaction`.

3. **Bound "let it settle".** After a receipt timeout, the keeper should exit with the journal intact for the next process to recover. It shouldn't keep looping until the transaction confirms. Check whether `send` or `recover` can rebroadcast repeatedly after a stop.

4. **Race only the sleep, never `tick()`.** The lease must outlive every state writer. The retry `catch` should also check for stop, so a stop doesn't log "will retry".

## Producer lifecycle

- **Validate the port first:** check `HIDDEN_PROVER_PORT` before acquiring the lease or making RPC calls. Keep the listen `try/catch` as well.
- **Keep an `error` listener:** the current `once` leaves a second `error` unhandled during cleanup. An `error` after listening should also trigger close and a nonzero exit.
- **Test the new stop paths on the pinned Node version:**
  - `closeAllConnections()` before `listen`.
  - A stop between `listen()` and the bind. If the socket can still bind after `close()`, memoized close won't close it, so recheck in the `listening` handler.
- **Use one shared primitive:** something like `installStopSignals()`, exposing an `AbortSignal` and `dispose()`, can serve both services. Consider adding SIGHUP for manually run processes.
- **Don't add a force-exit path:** repeated signals should only log. The supervisor's timeout is the backstop, and manual runs need SIGKILL.

## systemd templates

Add them, because the docs already rely on a supervisor to clean up orphans that the code can't.

- **Use `KillMode=mixed`, not `control-group`:** both clean up all descendants, but `control-group` also sends SIGTERM to the worker, racing the Node-owned stop order. With `mixed`, leftovers should get SIGKILL straight after an abrupt parent death, which is worth proving in a test.
- **Don't use `pnpm` in `ExecStart`:** with `mixed`, a wrapper as the main PID gets the SIGTERM, and if it exits early the real Node process is SIGKILLed before cleanup. Run Node directly, and make the signal tests use that exact command.
- **Keep the H3 key away from the worker:** without `nativeEnv`, `ProducerWorker` receives all of `process.env`, including `HIDDEN_H3_PRIVATE_KEY`. Fix this first with an allowlist, and check what `runProducer` inherits.
- **Set secrets and limits safely:** use a private `EnvironmentFile=` rather than `Environment=`. Leave out resource limits rather than inventing values, and require an operator drop-in where `MemoryMax` exceeds `GOMEMLIMIT` (soft) plus Node's own memory.
- **Derive `TimeoutStopSec` from a worst-case budget:** include the 60-second receipt wait, RPC deadlines, cache pruning and `fetchBeacon`. If `fetchBeacon` has no deadline, stop time is unbounded, so give it one.
- **Keep them inert:** no install script, plus a header saying deployment is blocked.

## Tests

No network or proving is needed:

- **Lifecycle:** run a child-process fixture with a fake factory, covering:
  - a signal during construction
  - repeated signals during close
  - stop before listen
  - bad port and `EADDRINUSE`
  - aggregated startup and cleanup failures
  - listener removal and exit codes
- **Keeper:** extract the loop from `keeper.ts` with injected dependencies, since the top-level script can't be tested as it stands. Cover:
  - stop during certificate fetch, which must send nothing
  - stop before and after signing
  - stop after journaling, which must settle or retain the journal
  - lease release only after `tick` ends
- **systemd:** run `systemd-analyze verify` on the rendered units. Add a gated test that SIGKILLs a fake parent and asserts its child is gone. It needs systemd, which WSL2 may not have enabled, so report a skip as a skip.

## Still to check

I didn't have `http.ts`, `jobs.ts`, `recovery.ts`, `keeper/transactions.ts`, `certificates.ts` or the `CiphertextIndex` implementation. Before finalizing, confirm:

- `serialQueue.drain()` fails queued jobs quickly.
- `requestCertificate` has no internal retry that ignores abort.
- `catchUp()` can't block a stop for too long during a reorg rebuild, because a rebuild from deployment has no overall time limit.
