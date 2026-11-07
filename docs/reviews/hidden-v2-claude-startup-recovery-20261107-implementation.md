I reviewed this by reading the code only and ran nothing. I found one test defect that should fail the newest tests, and one runtime reporting defect. `processes.ts` wasn't included, so its stop and failure behavior is assumed.

## Confirmed defects

### 1. Test state leaks into the last three tests
`beforeEach` in `apps/web/test/local-hidden-lifecycle.test.ts` doesn't reset `failConsumption`, `failRootLeaseRelease` or `failGatewayClose`. As written, these should fail in file order:

| Test | Leaked state | Result |
|---|---|---|
| `reports saved when only the later lease release reporting fails` | `failConsumption = "after"` | Fails at consumption, so `chainSaved` is false instead of true |
| `reports unsaved when gateway cleanup invalidates snapshot authorization` | `failRootLeaseRelease = true` | The first `await stack.close()` rejects during setup |
| `does not authorize a completed snapshot whose closed receipt cannot be written` | `failRootLeaseRelease` and `failGatewayClose` | The first `await stack.close()` rejects during setup |

**Fix:** add these resets to `beforeEach`:

```ts
state.failConsumption = "";
state.failGatewayClose = false;
state.failRootLeaseRelease = false;
```

With the leaks removed, I traced all three tests and they should pass.

### 2. An ambiguous `closed.json` is reported as not saved, but the checkpoint can still load
`exclusiveJson` can throw after the complete JSON is already in the file, from `file.sync()`, `file.close()` or the directory sync. In that case:
- `errors` becomes non-empty, so `closeResult` stays unsaved.
- The CLI error and `failed.json` both say the world was not saved.
- `closed.json` can still contain `chainSaved: true`, `cleanupErrors: 0` and the checkpoint path, so `loadCheckpoint` accepts it.

This doesn't risk a rollback, because the source remains consumed and the new checkpoint is valid. The problem is that the operator can be told a recoverable world is lost. It's the same uncertainty you already model for `.used`.

**Fix:** track the receipt as `none | attempted | durable`, and report an unknown outcome with the candidate checkpoint path if a save was eligible and the write throws. Don't report that as `chainSaved: true`; `loadCheckpoint` stays the authority.

**Test:** the current fixture only throws before writing, so add one that throws after the real write. It should assert the unknown outcome and that `loadCheckpoint` resolves.

### 3. Receipts can disagree after a post-snapshot cleanup error (low)
If `saveCheckpoint` succeeds and `gateway.close()` or `stopAll()` then fails, `closed.json` says `chainSaved: true` with `cleanupErrors > 0`. `failed.json` and the thrown error say `chainSaved: false`.

Authorization is still correct because `loadCheckpoint` refuses the non-zero `cleanupErrors`. To remove the contradiction, write `chainSaved: saved && errors.length === 0` and record the snapshot separately, for example as `snapshotWritten`.

## Behavior to account for
- **`untouched` never reaches the exception:** failures before consumption throw the raw error, so that value appears only in `failed.json`. I'd keep this, because wrapping would add a misleading "world was not saved" message, but the type and docs shouldn't imply otherwise.
- **Cancellation now exits non-zero after eligibility:** the wrapped error no longer equals `signal.reason`, so the CLI rethrows it. That surfaces the checkpoint path, but acceptance should expect exit 1. Cancellation before eligibility still exits silently with status 0.
- **`AggregateError` hides the structured fields:** `chainSaved` and `checkpoint` are on `.cause`, so any harness must read that or `failed.json`.

## Checked with no defect found
- **Consumption order:** there are no constructor calls or public writes before durable consumption. Hidden validation failures leave the source reusable.
- **Ambiguous consumption:** a `.used` write failure leaves eligibility false, starts no writers and never removes the marker. A later load fails closed if the marker exists.
- **Late close failure:** `closeResult` is set before lease release and survives a late rejection. An earlier cleanup error prevents authorization, and a `failed.json` error doesn't revoke it.
- **Error cause:** the original cause is preserved through `LocalStackStartupError`, and that error is the `cause` of the `AggregateError`.
- **State writers:** the keeper stops first, then the producer and its queue drain before the gateway freezes. The producer therefore keeps RPC access until it finishes, and the digest runs after Anvil and all writers stop.
- **Failed producer listen:** the worker is lazy, and the server should be in the same state as your pre-listen close test. The real `EADDRINUSE` run will confirm that.

## Acceptance traps
- **Port blockers:** on resume, a blocker bound before the hidden port preflight fails with the source `untouched` and no new checkpoint. Bind it after `.used` appears, or the web listen case won't test recovery.
- **Journal injection:** the file must land after `.used` but before `saveCheckpoint` computes its digest. A fast constructor failure makes that window small, so hold the constructor failure open or synchronize on a clear signal. Otherwise the run can flake or capture a checkpoint without the journal.
- **Digest coverage:** the fixture mocks `sha256File` to a constant, so Vitest can't prove the digest tracks journal content. Only the real run covers that claim.
