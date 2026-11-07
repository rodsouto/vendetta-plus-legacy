# Review of the ephemeral local Anvil implementation

**Verdict: the race fix and cancellation exit are correct as written. There's one possible blocker to check in `processes.ts`, plus two CI test gaps and some small leftovers.** Nothing here needs recovery restored.

I reviewed only the pasted source and ran nothing. I haven't seen `processes.ts`, `dev-hidden-v2.sh`, or the acceptance results, and I didn't see the three production files, so the advice on them is general.

## Check before accepting
**A failed `forge` run may be ignored (`stack.ts`, `runForge`).** It races `command.closed` but discards the result, and the test mock resolves that promise to `{ code, signal }`. Unless `processes.ts` rejects on a non-zero exit, these failures go unnoticed:
- **`forge build`:** this fails later with a misleading missing-artifact error.
- **`forge script`:** this is the dangerous case. If it fails after a partial broadcast, `run-latest.json` can still contain the proxy and directory. `verifyDeployment` only checks the consumers and that the directory has code, so a partly configured world could pass.

**Fix:** if `closed` doesn't reject, throw when `code !== 0` or `signal` is set, unless shutdown is already in progress. Add a test where `script` writes a valid broadcast file but exits 1.

## Add to CI
1. **Race fix:** the fixture always writes the listening line, and its `check()` does nothing. Add a case with no listening line and a failed child, then assert that `getChainId`, `sendTransaction`, and `deployContract` are never called. Also cover a line with the wrong port.
2. **Cancellation exit:** `local-hidden-cli.test.ts` only covers bad arguments, and the lifecycle test stops at the function boundary. Add a CLI test that sends a real signal during startup and asserts exit code 1. The current acceptance run won't protect this later.

## Minor fixes
- **Stale smoke text:** `local-hidden-smoke.ts` still says "existing players are preserved".
- **Crash recovery docs:** `pids` only exists once `stack.json` is written, so a crash during startup leaves no recorded PIDs. Tell users to find the owner with `ss -ltnp` and check the command line.
- **`consumers.json` read-back:** `verifyDeployment` rereads a file it just wrote. Keep the file as a diagnostic, but pass `{ opening, point }` directly and remove `regularJson`.
- **Resume leftovers:** remove the bare `{ ... }` deployment block and merge the two `mkdir` loops.
- **CLI test timing:** arguments are validated after importing Vite and viem, so the 15-second test could flake. Validate after the environment scrub but before the import.
- **Key test coverage:** the leak test only checks `h3Key` in four files. Also check `keeperKey` and `deployKey`, and include `deploy.log` and the broadcast output.
- **Final search:** check active scripts for `anvil_dumpState`, `anvil_loadState`, `--dump-state`, and `--load-state`. That includes `snapshot-opening.ts` and `run-producer-game.ts`, which I haven't seen. Decide on `evm_snapshot` hits individually, since reorg tests may need them.

## Confirmed by reading
- **Port collision:** `pub.getChainId` only runs after the exact listening line appears in this run's `anvil.log`, and funding comes after that. If Anvil can't bind, no RPC call is made. This assumes `check()` reports the child's exit.
- **Startup cancellation:** `stack` stays undefined, so the exit code is 1 at every startup stage, including cancellation before the directory exists.
- **Stopping a running stack:** a normal stop exits 0, and cleanup failures still exit non-zero.
- **Directory reuse:** `mkdir` runs before the `try`, so `EEXIST` can't write receipts into the old directory.
- **Run path:** parent symlinks are canonicalized, and a symlink at the final path fails on `mkdir`.
- **Shutdown order:** the order is intact, and `failed.json` being written after lease release is harmless now that directories can't be reused.

## Production critical path
Removing local recovery means the local stack no longer exercises restart behavior. Staging must now prove it, without adding anything back locally.

1. **Finish independent review and freeze inputs.** Do this before any ceremony, because a circuit change invalidates Phase 2. Freeze the circuit source, R1CS hashes, prover and compiler versions, and `solc` version.
2. **Have the owner write the trust policy.** Code can't settle these decisions:
   - Which Phase 1 artifact is accepted, pinned by hash
   - Who contributes, the minimum count, and what counts as independent (I'd require 1-of-N honest, with several contributors outside the project)
   - Who coordinates, how a bad or missing contributor is handled, and which final beacon is committed in advance
   - Who independently verifies the transcript, and who can approve a release
   - Who controls consumer or verifier changes on Game, and under what delay
3. **Run the external ceremony.** Publish the transcript, have the named verifier check it from scratch, and rebuild the verifiers reproducibly from the outputs.
4. **Implement the importer in `prover/setup.ts`, only after the policy exists.** Production status must come from verifying the transcript against the policy, never from a manifest field.
   - Bind the R1CS, Phase 1 hash, transcript, contributors, beacon, proving and verifying key hashes, and verifier runtime hash.
   - Give experimental manifests no conversion path, and reject their known digests.
   - Add a negative test that relabels the current keys and must fail transcript verification.
5. **Add approval bindings to `Deploy.s.sol` and `deploy-gnosis.sh`.** Approval should come from the policy's approver, not the deployer, and cover the exact digests, chain ID, and consumers. Both should fail closed, and the deployment should verify on-chain runtime hashes afterward.
6. **Rehearse on staging with the final keys.** Run a real keeper → producer → consumer mission, since that path has never run end to end through the launcher. Also drill keeper and producer restarts and reorgs against their journals, then decide on Gnosis.

**Next step:** fix or rule out the `forge` exit issue, then add the two CI tests. Hold steps 4 and 5 until the owner has written the trust policy, because that policy defines what they must bind.
