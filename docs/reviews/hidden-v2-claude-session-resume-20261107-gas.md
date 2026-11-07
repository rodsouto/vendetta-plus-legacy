**Verdict:** the fix is reasonable and narrow, but the supplied evidence doesn't yet confirm the diagnosis, so reconcile the gas numbers first. This review is based only on the text you pasted. I ran nothing, and my viem and Anvil notes come from memory because the installed versions aren't visible.

## Blocking: the gas numbers disagree
`transactionGas: 0x2b56e` is **177,518**, not 173,038. The metadata's `gas: 173038` looks like gas used, so it may have been recorded as the limit by mistake.

Compare raw `eth_getTransactionByHash.gas` with the receipt's `gasUsed`:
- **Both are 177,518:** this fits top-level out-of-gas, and the trace or summary field needs correcting.
- **Limit is 177,518 and receipt is 173,038:** 4,480 gas was left, so this was not top-level out-of-gas, which would consume the full limit. It also doesn't fit a simple inner out-of-gas failure bubbled up, because 1/64 of this limit is at most about 2,774. Look for an empty `REVERT`, or a subcall with explicit gas.

The 190,493 success still suggests the limit was too low, assuming it took the same path. That supports the fix, but "confirms gas underestimation" is too strong until this is resolved. The headroom would give 366,277 gas, or 359,557 if the estimate really was 173,038.

## Suggested change
```ts
export const gasWithHeadroom = (estimate: bigint) =>
  estimate + (estimate + 1n) / 2n + 100_000n;

// Inside the existing try, so an estimate revert still maps to RevertedError(name, i):
const request = {
  abi: c.abi,
  address: c.to,
  functionName: c.functionName,
  args: c.args,
  account: wallet.account!,
};
const estimate = await clients.public.estimateContractGas(request as never);
hash = await wallet.writeContract({
  ...request,
  chain: wallet.chain,
  gas: gasWithHeadroom(estimate),
} as never);
```

- **Sender:** `account` is required here because estimating without it would run the call under the wrong `msg.sender`.
- **Error handling:** keep the existing `catch` unchanged, and leave a non-revert error such as an RPC failure to rethrow as it does now.

## Edge cases
- **Scope:** `sendPlain` also serves `PasskeySigner`'s local `admin` path. The 4337 operations are untouched, but passkey mode's admin transactions do change, so "passkeys untouched" needs that caveat.
- **Upper bound:** the formula has no cap. It exceeds a 30M block limit for estimates above about 19.9M, and the 16,777,216 per-transaction cap above about 11.1M if that cap is active. Check the largest local estimate, and only add a clamp if it gets close.
- **`gasleft()`:** check that no contract path changes behavior based on `gasleft()`, since the limits are now much higher.
- **Better revert names:** a late `Backlog` that used to run out of gas first can now revert by name and reach the existing retry. That's an improvement, but it's a behavior change to test.
- **Existing replay assumption:** `revertName` says Anvil mines one transaction per block, which isn't guaranteed with block-time 1. It replays at the block's end state, so a busy block could lose or change the name. This is separate from this fix, but the comment should be corrected.
- **Freeze claim:** excluding account sources supports "no onchain change", but it doesn't cover everything. New runs get different gas limits and transaction hashes, and the web bundle changes. Check that no evidence binds those values, including `hidden-v2-completed-evidence.py` and `test-evidence.ts`. Existing journals stay valid only if none do.

## Tests
`clientsFailingAt` injects failures through `writeContract`, and its `pub` has no `estimateContractGas`. Both current dev-account tests will fail with a `TypeError` until the injection moves to the estimate.

**Unit tests:**
1. `gasWithHeadroom` handles odd and even estimates, including 173,039 → 359,559 and 177,518 → 366,277.
2. The estimate receives the exact call and sender, and the write receives the computed `gas`.
3. An estimate rejection gives `RevertedError` with the right name and index, and nothing is written.
4. A non-revert estimate error is rethrown unchanged.
5. A mined revert still gives its name and index.
6. In a batch, each estimate happens after the previous receipt.
7. The `sendBehindQueue` no-resend test still passes with rejection at the estimate.

**Anvil integration tests, block-time 1:**
1. Run `register` immediately followed by `queueRoom`, and assert success with `gas > gasUsed`. Repeat it, because the failure depends on timing.
2. Trigger a real `Backlog` at the estimate and assert its decoded name. A fake can't prove viem's error shape from `estimateContractGas` matches the one from `writeContract`.

The reproduction should also test whether estimating in the same timestamp as `register` skips a later storage write. The roughly 13–17k gas gap makes that plausible, but it's only a hypothesis.

The other limits hold: a margin doesn't guarantee future inclusion, and a failed construction diagnostic isn't a cryptographic replay. Nothing here needs to weaken a production gate.
