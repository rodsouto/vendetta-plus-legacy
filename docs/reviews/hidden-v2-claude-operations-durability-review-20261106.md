**Verdict:** the normal sequence is correctly ordered. A crash at any point before or after broadcast is safe, but I'd fix finding 1 because a retry after `fsync` failure can still broadcast without a durable journal. This review is from the supplied code only: I ran nothing and did not see `prepare`, `receipt`, or the lease code.

## Findings

### 1. Medium: a successful retry after `fsync` failure doesn't prove durability
`recoverTransaction` treats a later successful `syncFile` as proof that the earlier failure was resolved. Linux doesn't guarantee that. After a writeback error has been reported, a new descriptor's `fsync` can return 0 even though the data never reached disk, while reads still succeed from page cache.

The failure path is:
1. `syncFile(file)` or `syncFile(dirname(file))` fails with `EIO`.
2. The retry reads the journal from cache, both syncs return 0, and the transaction is broadcast.
3. Power loss removes the journal.
4. On restart, `ENOENT` leads to `prepare()`, which may use a new nonce. That breaks the "never another nonce or another advance" guarantee.

The exposure is narrow. A fresh journal's contents were already synced through the temp file, so its main risk is directory publication. Recovered legacy journals are exposed to both file and directory failures. Some filesystems also abort or go read-only after such an error, which would make the retry fail safely, but that behavior isn't portable.

**Fix:** before any broadcast of a recovered journal, republish the validated bytes through a new temp file: write, sync, close, rename, then sync the directory. This creates new writes rather than relying on a retried `fsync`. For the strictest guarantee, treat `EIO` as fail-stop and require operator action.

### 2. Low to medium: deletion sync failure hides the transaction result
`syncFile(dirname(file))` runs after `rm` but before the status check, so a failure there has two effects:
- A successful transaction is reported as failed.
- A reverted transaction surfaces as an `fsync` error rather than a revert.

The journal is already gone from the live directory, so a retry goes to `prepare()`, not rebroadcast. This is the same exposure as a crash just after `rm`, so `prepare` or `simulate` must already reject a completed action. The keeper has `simulate` for this, but I can't confirm the equivalent for H3.

**Fix:** capture the deletion sync error and report it separately, keeping the settled result. A resurrected journal is safe because it resolves again by hash.

### 3. Liveness: some journals can block forever
These behaviors are fail-safe, but each needs operator action:
- **Unmineable transaction:** all broadcast errors are swallowed, and only a receipt clears the journal. If the fee is too low, the transaction is dropped, or its nonce is consumed by another transaction, every retry fails the same way.
- **Corrupt journal:** a truncated legacy journal fails closed, which is correct because it may already have been broadcast. Recovery still needs a manual chain and nonce check.
- **Valid but damaged hex:** this passes validation, then waits on a hash that will never appear. A checksum would catch it, but that's optional.

## Crash behavior

| Crash point | Result | Safe? |
|---|---|---|
| Before rename | Stale temp file is truncated on retry, and `prepare` runs again | Yes, never broadcast |
| After rename, before directory sync | Journal may or may not survive | Yes, never broadcast |
| After directory sync, around broadcast | Same bytes are rebroadcast | Yes |
| After `rm`, before directory sync | Journal may return, then settles again by hash | Yes, but a revert is reported again |
| After settlement, before caller sees result | Caller retries through `prepare` | Only if the on-chain precondition check holds |

## Limitations
- **Missing journal:** `ENOENT` is treated as proof that nothing is in flight. An empty, unmounted, or restored-from-old state directory breaks that assumption, so it depends on your stable-directory premise.
- **Reorgs:** the journal is deleted on the first settled receipt. Reorg safety depends on what `io.receipt` waits for, which isn't shown here.
- **Hardware durability:** this code can only request durability through `fsync`. It can't prove that the device honors flushes, and no power-loss testing is represented here.

## Test gaps
- **Retry coverage:** the `journal` and `directory` retry cases show the control flow only. The mock's second sync succeeds trivially, so they can't catch finding 1 and may suggest more assurance than they provide.
- **Deletion sync failure:** add success and reverted cases, including which error is surfaced.
- **Rename failure:** add a case asserting no broadcast.
- **Recovered journal order:** assert the full `sync:file`, `close:file`, `sync:dir`, `close:dir` sequence before broadcast. The current test only shows that broadcast didn't happen, and `expect(vi.mocked(open)).toHaveBeenCalled()` adds very little.