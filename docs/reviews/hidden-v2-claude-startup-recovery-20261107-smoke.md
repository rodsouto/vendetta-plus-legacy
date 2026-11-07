**Verdict: the proposed fix is correct, but the path change alone isn't enough, so add the precondition.** I reviewed only the supplied text and ran nothing.

## Why the precondition is needed
The ENOENT was also acting as an accidental guard: smoke could never run from an attempt directory. Once the path is fixed:

- `smoke-result.json` with `wx` is only one-shot per directory, but the docs say smoke "must not be repeated in that session."
- A world that passed smoke at root can be resumed and then smoke-tested again from its new attempt, because that attempt has no receipt.
- A failed smoke that got past registration has the same problem.

A root receipt wouldn't cover a manually played world that was never smoked, so chain state is the better check. It also strengthens the zero-proof evidence. If producer counters are per-process (I can't see `metrics.ts`), zero metrics after a resume prove nothing about earlier attempts, whereas a world with no players can't have had missions.

## Required patch
Validate the session path rather than trusting it outright, and canonicalize both paths so a trailing slash or symlink doesn't cause a false mismatch:

```ts
const current = await realpath(run);
const session = await realpath(stack.sessionDirectory ?? run);
assert(
  current === session ||
    (dirname(current) === session && basename(current).startsWith("attempt-")),
  "Stack record is outside its session",
);
const clients = JSON.parse(await readFile(join(session, "producer-clients.json"), "utf8"));
```

Keep the existing `record` in `run`, and keep every localhost, auth and zero-metric assertion.

Add the check inside the `try`, before `chromium.launch`, so a refusal still writes `passed: false`:

```ts
const players = await publicClient.readContract({
  address: stack.deployment.game,
  abi: gameAbi,
  functionName: "<world-wide player counter>",
});
assert.equal(players, 0n, "Smoke requires a world with no registered players");
```

- **Counter choice:** I can't see the contract, so the name above is a placeholder. Use a world-wide, monotonic counter rather than an account1-only check, because any existing player means the world isn't fresh.
- **Baseline:** confirm the counter is `0n` on a fresh deployment. If deployment seeds it, compare against that baseline, or the check will reject every world.
- **Client:** create it from `stack.deployment.rpc`, after the URL assertions.

## Acceptance blockers
1. **Source pin (check first):** resume refuses changed execution sources. If `sourceDigest` covers `apps/web/scripts/local-hidden-smoke.ts`, this fix invalidates the saved checkpoint, and you must rerun the acceptance sequence from a fresh session. Don't change `stack.ts`, which the docs imply is pinned as launcher source.
2. **Burned attempt:** `attempt-22907543…` already has a failed receipt, so `wx` will throw EEXIST there. Leave it in place. If the pin allows it, resume from that attempt's checkpoint and run smoke against the new attempt directory.
3. **World eligibility:** that run failed before any metrics or browser step, so this smoke run didn't touch the world. It still counts as never played if your earlier acceptance steps didn't register anyone.

## Docs to update
- **Which path to pass:** after a resume, use the current `attempt-<uuid>` directory. Root `stack.json` can be stale if the first start succeeded.
- **One-shot wording:** replace "must not be repeated in that session" with the actual rule: one receipt per run directory, and worlds with registered players are refused before any browser action.

## Evidence to collect
1. **Fresh session:** smoke run from root still passes.
2. **Never-played resumed world:** smoke run from the attempt directory passes, with zero requests and proofs.
3. **Played world:** after another stop and resume, smoke writes a `passed: false` receipt and doesn't launch the browser. Account1's nonce and the player counter stay unchanged.
4. **Unchanged files:** prior receipts stay byte-identical, and no credential file appears under any attempt directory.
