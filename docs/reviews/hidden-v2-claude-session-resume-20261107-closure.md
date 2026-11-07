**One confirmed defect remains: it can report a lost world as a clean exit.** I reviewed only the pasted code. I ran nothing and didn't inspect `processes.ts` or the keeper and producer internals. All test and real-run results below are as you reported them.

## Defect: Anvil death during ordered shutdown exits 0

**Location:** `close()` in `apps/web/scripts/local-hidden/stack.ts`, at the `ready && errors.length === 0 && anvil && !anvil.finished` guard.

**Failure path:**
1. A signal wins the `Promise.race` in `local-hidden.ts`, so `failure` stays unset.
2. Anvil dies while `close()` is stopping the keeper or draining the producer. The docs say an outstanding receipt can hold shutdown for about a minute.
3. The later `processes.failure` rejection goes unobserved because the race has already settled.
4. The save block is skipped without adding an error, so `close()` resolves.

**Result:** the process exits 0 with `chainSaved: false`, `cleanupErrors: 0` and no message. On a resume, the checkpoint was already consumed, so the world is unrecoverable. This is the same status-masking class you just fixed for cancellation after consumption.

The test `does not publish a checkpoint when Anvil is already dead` currently locks this in by expecting `close()` to resolve.

**Fix:**

```ts
if (ready && errors.length === 0) {
  if (!anvil || anvil.finished)
    errors.push(new Error("Anvil exited before the world was checkpointed; world was not saved"));
  else
    await attempt(async () => { /* existing drain, stop and save */ });
}
```

Change that test to expect `cleanup failed` and `cleanupErrors: 1`. Add a variant where Anvil dies during a delayed `producer.close()` after a signal, then assert a nonzero exit.

No other correctness defects turned up in the hidden gateway, consumption ordering, freeze and drain, checkpoint pinning, or the pre-mkdir identity checks.

## Doc corrections
These go beyond the wording updates you already listed:
- **Exit status:** exit 0 does not mean "saved". Cancelling a fresh start exits 0 with no world saved, and cancelling a resume before consumption also exits 0 with the checkpoint still reusable. Tell operators to read `closed.json` or `failed.json`, and to use `chainSaved` when `closed.json` exists.
- **Shutdown order:** the Stop section omits the gateway. The actual order is keeper, producer, gateway freeze, web, pending-pool drain, then Anvil.
- **Source pin:** "Documentation/test changes do not change the source pin" is only true outside the pinned directories. A test file inside `packages/rules/src` or `apps/web/src/chain`, for example, would change it.

## Essential closure checks
1. **Apply the fix before real-run6:** `stack.ts` is a pinned source, so any evidence from before the fix doesn't cover the final code. Rerun the focused tests and typecheck first.
2. **Add a real cancellation before consumption:** the single-Anvil validation branch is only mock-covered so far. In real-run6, use a test-only preload to pause before `.used` is created, then send the group SIGINT. Assert the following:
   - `.used` is absent.
   - The public RPC stayed at 503 and exposed no head.
   - The discarded Anvil's dump stays in its attempt directory.
   - A retry from the same checkpoint succeeds.
3. **Make the browser poller assert, not just observe:** across every stop, hidden window and resume, record each status and head. Fail on any head regression, or on any 200 response before `.used` is durable.
4. **Bind the evidence to the exact code:** the worktree is uncommitted, so `sourcesSha256` should be recorded with the run. Anvil's hash and the final tree identity should go with it, including `scripts/dev-hidden-v2.sh`, which is outside `sourcePaths`.

Once the fix and these checks pass, I see nothing else blocking closure of this experimental scope. Production stays blocked.
