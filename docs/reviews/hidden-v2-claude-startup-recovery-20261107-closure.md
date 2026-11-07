**I found no confirmed defect that can authorize, revive or roll back the wrong world.** I did find two confirmed reporting defects and one data-loss risk to measure before closing. This comes from reading the pasted source only; I ran nothing and didn't see `processes.ts`, `config.ts`, `state-lease.ts`, the keeper, or the producer service.

## Confirmed defects (both fail closed)
1. **`unknown` is not reported on normal runtime shutdown.** `closeResult` only reaches the operator through `LocalStackStartupError` and `failed.json`.
   - After startup succeeds, `close()` throws a plain `AggregateError`, and `local-hidden.ts` has no access to the outcome. A Ctrl-C shutdown that hits an ambiguous receipt therefore reports neither `checkpointStatus` nor `candidateCheckpoint`.
   - The new test only covers the startup path, so "explicit" is true for startup failures only.
   - The operator can still try `--resume <attempt>/checkpoint.json`, and `loadCheckpoint` will decide safely.

2. **`candidateCheckpoint` is not limited to ambiguous receipts.** `closed.json` also sets it when `saved && !canAuthorize`, which is a definite refusal. That checkpoint can never load, yet the raw receipt calls it a candidate. A separate name such as `refusedCheckpoint` would fix this.

**Recommendation:** don't reopen acceptance for these alone. Either change happens in `local-hidden/`, which changes `sourcesSha256`, so the running world would refuse to resume. Narrow the closure claim to the startup path and record both as known limitations. If `stack.ts` changes for another reason, fix both and rerun acceptance.

## Unconfirmed risk to measure
**Snapshot growth could lose a world.** Anvil mines every second with `--preserve-historical-states`, and the 512 MiB cap is only checked in `saveCheckpoint`, after Anvil has stopped. Going over the cap means no new checkpoint, and a resumed world's source is already consumed.

I don't know how fast the dump grows. Compare `chain-state.json` size against block number across your acceptance generations, then record the estimated safe session length. If that is short for how you actually run it, this becomes a real defect.

## Checks for the current acceptance
- **Source identity:** confirm that no `sourcePaths` file changed during the run and that `session.json` matches the current digest. `local-hidden-smoke.ts` is outside `sourcePaths`, so record its hash separately.
- **Played-world refusal:** `smoke-result.json` should contain the "Smoke requires an unplayed world" error, and `counters[1]` should be above 0 in that same world. This is the first proof that the counter detects a played world, since earlier evidence only showed the baseline of 0. Any other failure doesn't count as a refusal.
- **Never-played attempt:** confirm the smoke ran on a resumed `attempt-*` directory with its receipt there, and that the session root is unchanged.
- **Repeat cases:** check each one against the new `checkpointStatus` values, not just the old `chainSaved` field.

## Evidence limits to state
- **`unknown` receipts:** these are fixture-tested only, which is fine if the closure says so.
- **Hash pins:** the lifecycle tests mock `sha256File`, so they don't exercise the snapshot, journal or digest pins. Only real acceptance or other tests can cover those.
- **`failed.json` vs `closed.json`:** in the `unknown` case they can legitimately disagree (`chainSaved: false` vs `true`). Treat `loadCheckpoint` as the authority.
- **Hard crashes:** SIGKILL, power loss or an Anvil crash during a resumed session leaves no replacement checkpoint, and the source is already consumed. That follows from the no-rollback rule, but it isn't in your acceptance list, so document it as accepted world loss.
- **Consumption write failure:** the same applies if `.used` exists but its write reported an error.

## Optional smoke fix
The `networks.ts` canary fetch doesn't check the response status, so an error page would pass the "secret absent" assertions. The later browser import shows the module loads, but not that this fetch returned it. Adding a 200 assertion doesn't affect resume, but it does change the smoke hash, so it would need a fresh smoke run.
