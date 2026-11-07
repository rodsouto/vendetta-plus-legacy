## Review result

I found one correctness issue that needs a change, plus two smaller lifecycle issues. This is from reading the pasted code only, so I didn't run anything or check the result of the current test run.

### Findings

**1. Medium: the public RPC exposes a discarded chain during resume (`stack.ts`, `rpc.ts`)**

The frozen gateway still forwards reads to the scratch Anvil, which mines a block every second. A tab left open can see head `H+k` from that chain, then the writable Anvil restarts at `H` and mines different blocks at those heights.

Block numbers and timestamps can therefore move backwards. Any client log cursor that reached `H+k` can skip real events mined at or below that height. I can't see the browser polling code, so that impact isn't confirmed, but the exposure is.

**Recommended fix:** remove the scratch Anvil. The gateway now provides the isolation scratch was there for, so `.used` only has to be written before public writes or journal writers start:

```ts
anvil = startAnvil("anvil.log", load, join(generation, "chain-state.pending.json"));
await waitForAnvil();
await verifyRestored();
check();
if (resumeCheckpoint) {
  for (const port of [config.ports.prover, config.ports.web]) await assertPortAvailable(port);
  check();
  await consumeCheckpoint(resumeCheckpoint);
  checkpointConsumed = true;
}
gateway.enableWrites();
check();
```

- **Benefits:** this removes the second load and the backend port rebind. A failed writable start also no longer burns the checkpoint.
- **Remaining exposure:** a failed resume can still briefly show blocks that are later discarded, but a successful resume no longer does.
- **Comment to update:** `consumeCheckpoint` currently says "Persist before spawning Anvil". The rule becomes "persist before enabling writes or starting journal writers".

**2. Low: prover and web ports aren't rechecked before consumption (`stack.ts`)**

They're checked at startup but not reserved. If another process takes one during the load, the bind fails after `.used` is written and the world is lost. The recheck above narrows that window but can't close it.

**3. Low: a failed fresh start blocks its own retry (`stack.ts`)**

`mkdir(config.runDirectory)` runs before `executableIdentity()` and `sourceDigest()`. If Anvil is missing or a source is invalid, the empty directory remains and the next run fails with `EEXIST`. Compute both identities before `mkdir`.

### Reviewed with no confirmed bug

- **Drain:** the frozen check and `forwarding.add` happen with no `await` between them, so a write can't slip past `freeze()`. A body still uploading at freeze is checked after it finishes.
- **Timed-out writes:** a late browser transaction can't desynchronize the journals, because service signers are already stopped.
- **Cancellation:** cancelling before consumption leaves the checkpoint reusable. Cancelling after it reaches the CLI as a different error, so the exit is nonzero.
- **Cleanup:** failures leave `chainSaved` false or `cleanupErrors` above zero, and either one makes `loadCheckpoint` refuse.
- **Compatibility identity:** legacy sessions fail closed because the new fields are undefined. The pasted code doesn't show the full import graph for keeper and prover, so test 8 should verify that coverage.

### Tests to add

**Lifecycle (`local-hidden-lifecycle.test.ts`)**

`sha256File` is mocked here, so hash pins are vacuous and `sourcesSha256` only covers paths. That does let these tests reach the identity branches directly.

1. **Refusal before consumption:** use `it.each` for wrong historical hash, missing block `N`, wrong H3 nonce, wrong keeper nonce and Anvil exit. Assert no `.used`, no `enableWrites` and no `producer:start`, then show a retry succeeds.
2. **Ordering:** wrap `localRpcGateway` and record events. Assert startup runs verify, consume, `enableWrites`, `producer:start`. Assert shutdown runs `producer:close`, `freeze`, `web:close`, `txpool_status`, `stop:anvil.log`.
3. **Cancellation:**
   - Abort during verification: rejects with `signal.reason`, no `.used`, retry succeeds.
   - Abort during consumption: rejects with "Resume stopped after checkpoint consumption", and the error isn't `signal.reason`.
4. **Unclean snapshot:** make `anvil.closed` return `{ code: null, signal: "SIGKILL" }`. Assert `chainSaved: false` and no `checkpoint.json` or `chain-state.json`.
5. **Txpool:** a pool that drains saves the checkpoint with the expected nonces. A pool that never drains, with stepped time, raises "Pending transactions" and publishes nothing.
6. **Identity and directories:**
   - Change or delete `sourcesSha256`, `anvilSha256` and `abiSha256` in `session.json`. Assert refusal, no process start and no `.used`.
   - A missing or symlinked resume directory creates nothing.
   - A failed `executableIdentity` on a fresh run leaves no directory.

**Gateway (`local-hidden-rpc.test.ts`)**

7. Cover these three drain cases:
   - Use `http.request` to send a partial write, call `freeze()`, then finish the body. Expect 503 and no upstream call.
   - Admit a mixed batch before freeze and confirm `freeze()` waits for it.
   - Make the upstream fail and confirm `freeze()` still settles.

**Session (`local-hidden-session.test.ts`)**

8. **Source coverage:** export the pinned path list and mutate every entry. Then bundle `keeper.ts`, `prover/service.ts` and `local-hidden.ts` with an esbuild metafile, and assert every input outside `node_modules` falls under a pinned path.
9. **`executableIdentity`:** it's mocked in lifecycle tests, so test it directly for a symlink on `PATH`, a changed target hash, a non-executable candidate that gets skipped, and a missing binary.

**Real Anvil and gateway (extend `local-hidden-chain-recovery.test.ts`)**

10. Run Anvil on a private port behind the real gateway with `--block-time 1`:
    - Send a transaction through the gateway, freeze, and confirm a raw write gets 503.
    - Stop Anvil and require exit code 0, then resume on the same backend port.
    - Verify the historical hash and nonce, then mine a new transaction after `enableWrites`.
    - Poll the public port throughout and assert the head never regresses.

### Evidence gap

The real-browser, consecutive-resume and keeper SIGKILL runs all predate the gateway, so forge deployment and browser traffic haven't been shown working through it. After the fix, rerun the full flow once through the public port with a browser tab left open across a resume.
