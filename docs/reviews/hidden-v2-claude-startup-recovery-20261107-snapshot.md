**Verdict: acceptable, with one correction and one blocking probe.** I found no required path in the supplied code that needs pre-snapshot historical state. However, the unavailable range also includes the restored head, and the probe doesn't yet prove that pinned reads work on blocks mined after restore. This comes from reading the supplied code only; I ran nothing.

## Consumer audit

| Consumer | What it needs after restore | Result |
|---|---|---|
| Keeper and `CiphertextIndex` | Latest views/simulation, old headers and logs | Safe |
| `recoverTransaction` and keeper journals | Latest nonce, raw send, receipts | Safe; rerun the recovery test without the flag |
| `verifyRestored`, `verifyDeployment`, close path | Old header, latest nonces, views and pool | Safe |
| `readReports` | Logs and headers | Safe |
| `pendingFor` | Headers, logs and latest `getInvite` | Safe; hash checks depend on preserved headers |
| Producer `generate` | Views pinned to captured latest `n` | Safe if post-restore pins work; failure happens before any write and the keeper retries |
| `loadWorld` | Many views pinned to captured latest | Same dependency; recovery depends on the unsupplied caller |
| `revertName` | `eth_call` at the receipt block | Best effort, see below |

**`revertName`:** an out-of-range error carries no revert data, so the result is a generic revert, never a wrong name. The cost is narrow but real: if a tab keeps waiting across restart for a transaction that reverted before the snapshot, a `Backlog` revert can't be named, so its `advance()` retry won't run. Document that.

## Correction: the boundary is the restored head
Pinned state is only proven while restored head `h` is still the head. Once `h+1` mines, `h` is probably out of range too, and with `--block-time 1` that happens quickly.

**Fix:** in `verifyRestored`, capture the restored head and wait for a higher head before `consumeCheckpoint` and `gateway.show()`. A timeout then leaves the source checkpoint untouched, and new clients can't pin `h` through the gateway. Tabs already holding an old pin must still fail and retry cleanly.

## Blocking probe
Restore, let `h+3` mine, then read `h+1` while it's no longer head. Check a storage slot not written since restore, plus a nonce.

Every `loadWorld` that crosses a block boundary depends on this. If it fails, resumed worlds will fail those loads repeatedly, and removing the flag isn't acceptable as proposed.

Add to `local-hidden-chain-recovery.test.ts`:
- **Allowed:** the `h+1` read above returns correct values.
- **Known limitation:** a pinned read at `h` fails once a later block exists.
- **Same flags:** use one shared Anvil argument builder, or the test only proves a copy of the stack's flags.

## Remaining checks
- **Unsupplied code:** search for `blockNumber:`, `blockTag`, `getStorageAt`, `getProof`, `getBalance`, `getCode`, `debug_`, `trace_`, `evm_revert` and `anvil_` in `apps/web/src`, `apps/web/scripts` and `rpc.ts`. Include `state/game.tsx`, and confirm that it retries a failed `loadWorld`.
- **Local signer:** confirm `VITE_NETWORK=local` resolves to the dev signer in `networks.ts`.
- **Log coverage:** acceptance should run the real ranged `eth_getLogs` queries for `HiddenMissionSent`, `ControllerInvited` and `Battle` across the restore boundary.
- **Mission coverage:** without proving, `generate` isn't exercised end to end. The acceptance world needs at least one mission so `loadWorld` covers pinned `getMission` and `getHiddenEvidence`.
- **Dump contents:** assert `historical_states` is null, and that headers and transactions match the chain.

## Data-loss wording
This reduces the risk but doesn't fully close it. Blocks and transactions still accumulate, and the 512MiB check still refuses the save after Anvil has stopped. On a resumed session, the source checkpoint is already consumed by then, so that world can't be resumed.

Keep the cap, report the measured compact dump sizes, and describe this as a lower growth rate with a remaining failure mode. Don't claim a safe session length.

## Other scope
- **Existing checkpoints:** changing `stack.ts` changes `sourcesSha256`, so they're refused without being touched, as you intended.
- **Reporting follow-up:** the `AggregateError` fields look right. `refusedCheckpoint` is only in `closed.json`, and the error itself reports `unsaved`, which is accurate and not a blocker.
- **Production gates:** this is unchanged and adds no secure provenance.
