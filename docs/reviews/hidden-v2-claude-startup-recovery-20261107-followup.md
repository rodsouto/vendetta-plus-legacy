**I found no confirmed state-correctness defect in the pasted code, and acceptance can close as compact-recovery evidence for its stated scope.** Both earlier fixes are present in the pasted code: the sender nonce pin and the setup release aggregation. One concrete operating limit remains, along with one evidence gap and one unexplained snapshot count.

I ran nothing and reviewed only the JSON and pasted files, not `session.ts`, `service.ts`, `processes.ts`, `rpc.ts`, `recovery.ts` or the Game contract.

## Concrete findings
1. **The 512MiB cap can end resumability (limit):** a save over the cap after resume leaves the source consumed with no new authorized generation. Attempt `1ce4` added 1,535 bytes and one block entry at the same height, so idle growth is roughly 1.5KB per block. At one block per second, that reaches the cap in **about 4 days of uptime**. This is an estimate from one pair of snapshots, and it would arrive sooner on a busy world.

2. **The report doesn't show the new head assertion (evidence gap):** it has no `best_block_number`, source checkpoint for each world capture, or `historical_states` length. The heights fit your assertion, but the JSON can't prove it. Add those fields if this artifact needs to stand alone.

3. **`blocks` is not `best_block_number + 1` (observed, cause unproven):** the surplus grows by exactly one per generation.

| Generation | Attempt | `blockNumber` | `blocks` | Difference |
|---|---:|---:|---:|---:|
| 1 | root | 19 | 20 | 1 |
| 2 | `1ce4` | 19 | 21 | 2 |
| 3 | `c7d2` | 40 | 43 | 3 |
| 4 | `d1b4` | 41 | 45 | 4 |
| 5 | `ea2d` | 43 | 48 | 5 |
| 6 | `ee4b` | 48 | 54 | 6 |
| 7 | `e3a1` | 49 | 56 | 7 |
| 8 | `05a4` | 54 | 62 | 8 |

This order assumes one linear chain, since each checkpoint is consumed once. If `blocks` were the head plus one, `c7d2` would have dumped at 42, yet its child captured head 41. Heads can't move backward, so that reading fails.

## What this changes
- **Correction to my earlier review:** I warned that the dump head could be above `h`. That's still possible from the code, but this run doesn't show it if the extra entries are not real height.
- **Generation coverage:** block 38 falls in generation 3 and block 51 in generation 8. The matching world hash therefore spans five restarts, which is stronger than the A → B → C check I asked for.

## Speculation
- **Orphan genesis entries:** each restart may add a new block 0 entry to the hash-keyed block map. This fits the table and my memory of Anvil's storage, but I haven't verified it. The final dump should contain eight block 0 entries.
- **Block 0 could change:** if those entries reload in arbitrary order, `getBlock(0)` might differ between generations. Nothing pasted depends on block 0, so check that its hash matches block 1's `parentHash` in each generation.
- **Producer lease failure:** `close()` can't see errors from a rejected `certificateProducer` call, so the world saved even with `Producer startup and lease release failed`. That only matters if the constructor can reject while a writer is still alive, which requires checking `service.ts`.
- **Mining race at shutdown:** if Anvil removes a transaction from the pool before adding it to a block, the pool could look empty while the nonce is stale. A saved checkpoint could then fail restore validation. This window is narrow and has no evidence behind it.

## Not covered
- **Pinned reads below the dump base:** with `certificateRequests: 0` and `proofs: 0`, nothing tests a certificate or mission that needs state from before the dump. Those reads now fail by design, so this is the biggest remaining risk for hidden missions across a resume.
- **Hidden-mission recovery:** with `CiphertextIndex` empty, this run says nothing about hidden-mission logs, proving or Game cryptographic replay.
- **Fresh smoke snapshot:** the `fresh-smoke-world` checkpoint isn't listed in `compactSnapshots`, so this report doesn't show that it was compact.
