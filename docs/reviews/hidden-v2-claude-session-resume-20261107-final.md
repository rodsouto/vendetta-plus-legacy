**Disposition: I found no blocking defects in the runtime code of this patch.** There are two small test corrections to make before closure and two low-severity follow-ups. This comes from reading what you pasted only: I ran nothing and make no claim about the final gas-smoke. I also didn't see `processes.ts`, `session.ts`, `rpc.ts`, the CLI wrapper or the Missions source.

## Trace
The trace supports your corrected attribution:

| Check | Result |
|---|---|
| Intrinsic gas | 21,000 + 344 calldata = 21,344 |
| Top-level limit | 177,518 − 21,344 = 156,174 (`0x2620e`) ✓ |
| Gas left at the end | 177,518 − 173,038 = 4,480 |
| Gas held back under EIP-150 | Proxy 2,364 + Game 2,187 = 4,551 |
| Accounting for the difference | 71 gas of revert overhead (the Game frame ends with 2,152, so 35 there and 36 in the proxy) ✓ |

- **Root frame:** `gasUsed` (`0x2a3ee`) is larger than `gas` (`0x2620e`) only because `gasUsed` includes intrinsic gas and `gas` doesn't. This is worth a short note wherever you cite the trace.
- **Out-of-gas point:** about 80.5k gas remained in the library frame after the nested call returned, and all of it was consumed.
- **Limit of the evidence:** the trace proves where the transaction ran out of gas, but not why the estimate was low. "State changed between estimate and inclusion" is still an inference, as is the later success at 190,493, because that ran on different state. Word it that way in the docs.

## Fix before closure
1. **Pre-broadcast rejection after a landed call is untested (`signer.test.ts`):** `clientsFailingAt` still throws from `writeContract`, but with explicit `gas` the real rejection now comes from `estimateContractGas`.
   - "names the call rejected at its gas estimate" and the `sendBehindQueue` test both take a path the real code no longer uses. The new no-broadcast test only covers index 0.
   - The runtime catch is shared, so this is a coverage gap, not a bug. Move the `failAt` throw into `estimateContractGas`, then assert `failed: 1`, `sent` equal to `["train"]`, and one recorded gas value.
2. **The fixture repeats the old misattribution:** `estimateContractGas: async () => 173038n` uses the receipt's `gasUsed` as the estimate. Use `177518n` and expect `366277n`.

## Low severity, not blocking
3. **`revertName` docs and replay:** the comment says Anvil mines one transaction per block, which is false under this stack's `--block-time 1`, as your new `sendPlain` comment acknowledges.
   - The replay also runs on the block's post-state, so a real `Backlog` may go unnamed if another transaction shared the block.
   - The result is a generic revert with no `advance()` retry, and `failed` stays correct. This predates the patch, so correcting the comment or documenting the caveat is enough.
4. **Resume failures that aren't aborts:** the "world was not saved" wrapper only applies when `error === signal?.reason`. A keeper timeout after `consumeCheckpoint` also loses the world, but reports only the raw error. `closed.json` does record `chainSaved: false`, and removing that condition fixes the message.

## Confirmed correct
- **`sendPlain`:**
  - The margin arithmetic is right, and a rejected estimate cannot broadcast.
  - Explicit `gas` stops viem estimating again, and non-revert errors still propagate.
  - For the observed transaction, the 366,277 limit comfortably covers the later 190,493 if the estimate matches. The comment correctly says this isn't a bound.
- **`close()`:** once `ready` is true, every path now ends in either `saved = true` or at least one error, so the silent exit 0 is gone. Writes are frozen before the snapshot, and `pub` still reaches the backend port directly, so the pool check and nonce reads work during the freeze.

## Remaining caveat
Because `processDue` reads `gasleft`, the larger limit can process more missions than the estimate run did, so mined `Backlog` may become rarer locally. Check that nothing in the gas-smoke depends on a mined `Backlog` occurring. This also means the local results say nothing about gas margins on the 4337 path, which your documented caveat already covers.
