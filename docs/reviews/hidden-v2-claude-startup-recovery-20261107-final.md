**I withdraw the base-head hypothesis.** Your probe refutes it on Anvil 1.8.6, so no wait-for-head is needed. After a compact restore, state at the dump head stays readable once that block is no longer head, and only pre-dump state is unavailable.

I ran nothing, so all test results here are as you reported them. I reviewed only the pasted files, not `session.ts`, `rpc.ts`, `processes.ts`, `recovery.ts` or the Game contract.

## Confirmed defects
I found no state-correctness defect in the pasted production code. There are two smaller issues, and neither changes production policy or equations:

1. **The pinned nonce assertion can't fail (fix before relying on it):** `local-hidden-chain-recovery.test.ts` reads `target`'s nonce at h+1 and expects `0`, which a missing account would also return. Pin the sender instead:
   ```ts
   expect(await pub.getTransactionCount({
     address: wallet.account.address,
     blockNumber: nextBlock.number,
   })).toBe(nonce + 1);
   ```
   The `slot1=9` check is sound, so pinned storage stays covered. If the probe read the same address, its nonce result is equally empty. If `sourceDigest` covers tests, make this edit before the acceptance run.

2. **One dual-release path was missed (non-blocking):** in `stack.ts`, the catch around resume and session setup does `await lease.release(); throw error;`. A release failure there replaces the original error. This only affects diagnostics, so it doesn't justify reopening the freeze by itself.

## Essential acceptance checks
1. **Prove the head is past the real base:** `checkpoint.blockNumber` is not the state base. The stack reads `h`, then stops Anvil while 1s mining continues, so the dump head `h'` can be above `h`.
   - Read `h'` from the dump (`best_block_number`) and assert the captured head is greater than `h'`. A 2.2s delay or `head > h` doesn't prove that.
   - Don't pin state reads at `checkpoint.blockNumber`. If `h < h'`, the probe's pre-dump behavior suggests that read can fail legitimately. The synthetic test can't show this because it has `h == h'`.

2. **Run a second generation (A → B → C):** close the resumed attempt with a new checkpoint, resume that, and repeat the same comparisons. The synthetic test restores once, so it never dumps from a restored chain, and later resumes all depend on that. The earlier passes used preserved state, so they don't cover it.

3. **Run this through the real stack path:** the synthetic test omits `--block-time 1` and `--hardfork cancun`, and its restored Anvil doesn't use `--load-state` and `--dump-state` together. Only the real run covers those flags.

4. **Report an empty `CiphertextIndex` as empty:** unless registration or queued construction emits ciphertext logs, matching results only show that catch-up ran. Log retention then rests on the synthetic test, and no hidden-mission logs are covered.

## Limits, not blockers
- **Anvil version:** the boundary result applies to 1.8.6. `anvilSha256` only pins a session after it is created, so a new session on another version is unverified.
- **512MiB cap:** a long or busy world can still fail to save. As far as `stack.ts` shows, a failure after resume leaves the source consumed and no new authorized generation. Document this as a possible loss of resumability, not just a failed save.
- **Other refused saves:** any cleanup error refuses the checkpoint, which is conservative but has the same resumability cost.
- **Uncertain consumption:** if `consumeCheckpoint` fails ambiguously, the outcome is reported as unknown and needs manual handling.
- **`revertName`:** recovery remains best-effort, with the generic error caveat you plan to document.
- **Coverage not claimed:** this excludes hidden-mission population, proving and Game cryptographic replay. The compact run also isn't evidence for production readiness or a safe session length.
- **Older evidence:** label the journal, failure, cancel and unknown-receipt runs as coming from the preserved-state version, unless the compact run repeats them. The H3 and keeper journal recovery does have compact coverage from the synthetic test.

The only item that needs action before acceptance is the nonce fix, along with including checks 1–4 in the run. After that, compact acceptance can proceed on the frozen source.
