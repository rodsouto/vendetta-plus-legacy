**Verdict: preserve both errors.** I see no reason not to, and the narrow correction is sound. However, `close()` has the same defect, and I'd fix it under this same source pin. This is based only on the pasted code; I haven't run anything.

## Why the change is safe
- **Behaviour:** startup still rejects, and the success path doesn't change. It adds no retry, and the memoized `release` should stay that way, because closing the fd number again could hit a reused descriptor.
- **Lock contention:** `acquireStateLease` runs before the `try`, so "already in use" is never wrapped.
- **Caller compatibility:** only the double-failure case changes the error shape. Any code matching on message, `code` or type would stop matching there, so this needs checking.

```ts
} catch (startupError) {
  try {
    await lease.release();
  } catch (releaseError) {
    throw new AggregateError(
      [startupError, releaseError],
      "Producer startup and state lease release both failed",
      { cause: startupError },
    );
  }
  throw startupError;
}
```

## Check before merging
- **Top-level reporting:** if `prover.ts` logs only `.message`, the aggregate hides both underlying errors. In that case, the fix doesn't achieve its goal until the handler prints them. If it prints more than `.message`, make sure that doesn't expose an RPC URL or other sensitive error fields.
- **Static message:** keep the aggregate message static, as above, so it can't pull in error details.
- **Compile target:** `scripts/tsconfig.json` needs `es2021` for `AggregateError` and `es2022.error` for `cause`.

## Same defect in `close()`
If `lease.release()` rejects in `close()`, the `throw failure.reason` line never runs, so a worker or queue shutdown failure is lost. This is more reachable than the startup case because every shutdown takes this path. Since final acceptance has to rebind anyway, fixing it now avoids a second rebind:

```ts
const failure = results.find((result) => result.status === "rejected");
try {
  await lease.release();
} catch (releaseError) {
  if (failure?.status === "rejected")
    throw new AggregateError(
      [failure.reason, releaseError],
      "Producer shutdown and state lease release both failed",
      { cause: failure.reason },
    );
  throw releaseError;
}
if (failure?.status === "rejected") throw failure.reason;
```

`state-lease.ts` has a smaller version of this: `closeSync(fd)` in its `catch` can replace the acquisition error. It's reasonable to defer, but record that decision. `keeper.ts` may also have the pattern if it uses the lease, so check it too.

## Essential tests
1. **Both fail:** your proposed test is the key one, and it fails against the current code. Wrap the real lease using a partial `vi.mock` of `../scripts/state-lease.js`:

   ```ts
   const startupError = new Error("RPC offline");
   const releaseError = new Error("synthetic release reporting failure");
   mock.chain.mockRejectedValueOnce(startupError);
   lease.acquire.mockImplementationOnce(async (directory: string) => {
     const real = await lease.actual(directory);
     return {
       ...real,
       release: async () => {
         await real.release();
         throw releaseError;
       },
     };
   });

   const failure = await start().catch((error: unknown) => error);
   expect(failure).toBeInstanceOf(AggregateError);
   const { errors, cause } = failure as AggregateError;
   expect(errors).toHaveLength(2);
   expect(errors[0]).toBe(startupError);
   expect(errors[1]).toBe(releaseError);
   expect(cause).toBe(startupError);
   await start(); // real fd closed; state can be reacquired
   ```

2. **Only startup fails:** tighten the existing test, because `toThrow("RPC offline")` would also pass for a wrapper with the same message. Use `await expect(start()).rejects.toBe(startupError)`.
3. **`close()` fails twice, if you fix it:** use `mock.close.mockRejectedValueOnce(...)` with the same assertions. Set `producer = undefined` after `start()`, or `afterEach` will await the memoized rejection and fail.

Name the injected failure as synthetic in the test title, as you proposed. It proves error reporting and reacquisition, not physical `close` behaviour.

## Acceptance
`acceptance2` remains useful history, but it doesn't validate the new code. Rerun runtime acceptance on the final pin, and make sure it includes the bind, constructor, web, signal retry and journal recovery cases, with no requests or proofs.
