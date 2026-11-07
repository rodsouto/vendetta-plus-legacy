**Verdict:** I found no state-safety defects in the pasted code, but this line isn't ready to close. There are three template fixes, two small code fixes, and one stop-budget check to make. I reviewed the paste only and ran nothing, so this isn't independent evidence and doesn't authorize any gate.

## Confirmed defects

### Fix before closing
1. **Both services share one UID:** `User=vendetta` is used in both units. Either service can read the other's state, and because they run under the same UID, a compromised keeper can normally read the producer's `/proc/<pid>/environ`, including `HIDDEN_H3_PRIVATE_KEY`. `StateDirectoryMode=0700` doesn't separate them, so use separate users.
2. **A short RPC outage can leave a service down:** failed startup RPCs exit nonzero. With `RestartSec=10`, `StartLimitBurst=3` and `StartLimitIntervalSec=300`, the unit stops restarting after about 30 seconds and stays failed with no alert. Keeper startup also falls outside the retry behavior promised at the top of `keeper.ts`. Use a longer or stepped restart delay, and document `OnFailure=` or equivalent alerting.
3. **State directories aren't actually pinned:** `EnvironmentFile=` overrides `Environment=` regardless of line order. A stray `HIDDEN_PROVER_CACHE` or `KEEPER_STATE_DIR` in an env file therefore moves the lease and journal path. `ProtectSystem=strict` will probably make that fail closed, but it's still misleading. Either reject a mismatch with `$STATE_DIRECTORY` at startup or document the restriction.

### Small code fixes
4. **Shutdown errors are dropped:** `results.find(...)` in `service.ts` keeps only the first failure, so a worker failure can hide a drain failure, or the reverse. Collect all rejected results, then add any lease-release failure.
5. **Cache pruning can replace the job result:** a `pruneCache` failure in the job's `finally` overrides the primary error. It can also discard a successful certificate. This predates the change, but it's the same error-aggregation problem.

### Lower priority
6. **Crash paths may log secrets:** the keeper's retry path logs only the first line, but its stop-time rethrow and the top-level crash paths print the full error. From memory, viem errors can include the RPC URL and request body, so check this. Provider URLs often contain API keys, and these logs would go to journald.
7. **Empty limits disable the defaults:** `PROVER_MEMORY=` bypasses `??`, so `GOMEMLIMIT` is empty and Go applies no limit. `PROVER_THREADS=` similarly leaves `GOMAXPROCS` empty, so Go uses its default. Treat empty values as unset or reject them.

## Boundaries that hold

| Area | Result |
|---|---|
| **Before publication** | A `prepare` throw writes no journal, so aborting there is safe. |
| **After publication** | Broadcast and receipt ignore the stop signal, and a timeout retains the journal. |
| **Bounded settling** | The keeper makes one settle attempt, then exits with the journal intact. |
| **Publication race** | Bytes that pass the last check may still publish and broadcast after a stop. This is safe, but docs shouldn't promise no broadcast after a signal. |
| **Certificate abort** | Only caller-won aborts are normalized, and default callers are unchanged. |
| **Index scan** | The cursor commits only after chunk checks, so aborting between reads can't corrupt it. |
| **Serve errors** | Startup, bind and cleanup failures are preserved, and handlers stay until cleanup ends. |
| **Native env** | Both native paths use the filter, assuming `worker.ts` and `jobs.ts` replace the environment rather than merge it. |

## Still unproven

- **Stop budget:** `TimeoutStopSec=150` isn't justified for the producer yet. `fetchBeacon` gets no abort signal, so its deadline matters if `drain()` waits for it. Add `assertOpen()` before `settlePending()` as well, so a stopping job doesn't start a new settle.
- **Lease ordering:** `enqueue.drain()` must wait for the running job. Otherwise the lease can be released during receipt handling, journal deletion or the final prune. This is the most important check left.
- **Torn proof files:** a partial proof fails `JSON.parse` with no `ENOENT` code, so that mission keeps failing until the file is pruned. Confirm the writer uses atomic rename, or treat corrupt cache entries as misses.
- **Journal retention:** confirm `pruneCache` can never delete `h3-*.json`.
- **Runtime paths:** the templates don't prove the `/usr/bin/node` version, and a production install must include `tsx`.

## Test and evidence gaps

- **Keeper wiring:** the signing test rebuilds the `prepare` closure, and the child test only stops during an index read. Add a child-process case that stops during an in-flight certificate request, using the real `keeper.ts`.
- **Sandbox behavior:** the real units were only syntax-checked, and the supervisor tests used synthetic Python services under the user manager. `User=`, `ProtectSystem`, `ProtectHome`, `StateDirectory` and the real Node/`tsx` entry remain unexercised together. A disposable system-scope run with the fake factory would cover this without a production install.
- **Evidence schema:** `listenerNotOpenedAfterEarlyStop: false` and `restartWithoutOverlap: false` mean "not applicable" in some cases but read as failures. Use `null` or omit them.
- **Producer exit:** the real `certificateProducer` hasn't been shown to exit naturally, because the entry fixture replaces it.
- **Docs:** I only saw the unit headers, so the systemd docs remain unreviewed. They should cover separate users, env-file restrictions, restart recovery, secret file permissions and the fact that 128 MiB and 32 tasks were synthetic test values.

**Next:** send `jobs.ts`, `beacon.ts`, `cache.ts`, the proof writer and the systemd docs. Those can settle every source-level check above, leaving only the disposable sandbox run.
