# Follow-up review: `requestCertificate` transport hardening

This is a static read of the pasted sources only. I ran nothing and did not verify the stated SHA-256 values. I also could not see `service.ts` or the full diff. The final suite has not been run, so nothing here is reported as passing. This is not an approval, and production gates remain blocked.

## Prior findings, reassessed

| # | Prior finding | Status | Basis |
|---|---|---|---|
| 1 | New messages dropped from logs | **Resolved** | 401, 403, 429 and other non-2xx statuses now produce static messages (`certificates.ts:27-35`), as does oversize (`:48`). All five are in the allowlist (`service-errors.ts:46-50`). `certificates.test.ts:258-289` checks the summaries from real thrown errors and also checks streaming-body cancellation for 401, 403, 429 and 503. |
| 2 | Producer does not enforce the client cap | **Resolved in substance** | `proof-cache.ts:24` pins the proof at exactly 384 bytes. The largest envelope (opening) is 96 + 32 + 384 + 32 + 1760 = 2304 bytes, which is 4610 hex characters against a cap of 32770. The invalid-point envelope is 608 bytes. I can't see `service.ts`, so I rely on the docs (`service-operations.md:149-150`) for the claim that generated artifacts pass the same validator before encoding. |
| 3 | `AbortSignal.timeout`/`any` buildup | **Accepted** | `engines` is `>=22`, so `any` is available. Retention is bounded: 120 s per call, with calls serialized per tick. No refactor is needed. |
| 4 | Stop/timeout race exits nonzero | **Accepted as policy** | Documented at `service-operations.md:36-37`. |
| 5 | Bearer token over `http://` | **Accepted as a deployment gate** | Covered by `service-operations.md:96-97`. |
| Minor | Length check before regex | **Done** | `certificates.ts:72` now runs before `:73`. |

## Re-verified: cancellation and compatibility

- **Stop before headers.** `fetch` rejects, `signal.reason === stopSignal.reason`, and the caller gets exactly the stop reason. Tested at `:323-347` with a real server.
- **Stop during the body.** The reader rejects with a possibly different object, and line 81 normalizes it to the stop reason. Tested at `:55-89`.
- **Timeout (no stop, or timeout then stop).** `signal.reason` is the `TimeoutError`, so the identity check fails and the original error propagates. The keeper retries, or exits nonzero under policy 4. Logs show `type: "TimeoutError"`, which is allowlisted.
- **Reader cleanup.** The second `body.cancel()` on the success path, after `releaseLock`, is benign and its error is swallowed. On an errored stream, both cancels reject and are swallowed, and the original failure propagates (`:170-181`).
- **Redirects.** `redirect: "error"` plus the real 302 test (`:296-321`) is discriminating. If the redirect were followed, the target would return a valid certificate and the test would fail.
- **Baseline compatibility.**
  - BOM stripping and uppercase hex are pinned (`:291-294`).
  - `bigint` serialization reaches the real producer handler as `{mission: "1"}` (`:228`).
  - 204 or a null body maps to "Malformed" and is retried.

I found **no remaining blocking defects** in the transport code.

## Remaining non-blocking items

These are listed in priority order. None requires a production refactor.

1. **Timeout classification is untested.** Line 81's identity check is the subtlest logic, and only its stop branch is covered. You can test it without injectable config by spying on `AbortSignal.timeout`, for example with `vi.spyOn(AbortSignal, "timeout").mockReturnValue(ctrl.signal)` against a server that never responds. Then assert three cases:
   - The timeout abort rejects with the `TimeoutError` object, not a stop.
   - With a stop signal supplied but not aborted, the result is still the timeout.
   - Timeout first and then stop still propagates the timeout, matching policy 4.
2. **Line 76 (stop after full body) is untested.** A fetcher can return a `Response` whose stream enqueues a valid body, calls `abort.abort(reason)`, then closes. The expected result is `rejects.toBe(reason)`, with no certificate returned.
3. **The comment at line 80 overstates precision.** The outer `finally` contains `await`s (`:53`, `:65`). A stop that arrives during those awaits, after a genuine 503, oversize or malformed failure, gets normalized to the stop reason. That makes the keeper exit 0 instead of preserving the failure. This is harmless because the request has no side effects, but it is the opposite of policy 4. I would reword the comment, for example to "a stop observed before the error is reported is treated as the cause," rather than adding state.
4. **404 is indistinguishable from 503 in logs.** The producer returns 404 for a wrong path or method (`http.ts:57-58`). A misconfigured `HIDDEN_PROVER_URL` path would therefore loop forever as "Prover unavailable; retry later." An optional fix is one more static message, such as `Prover endpoint not found; retry later`, plus its allowlist entry.
5. **Test precision.**
   - `:313` accepts any rejection. Asserting `TypeError` would distinguish an unexpected redirect from setup failures. The `targetCalls === 0` check already discriminates the main property.
   - `:209-235` builds the ABI envelope by hand, so it pins transport but not the real `service.ts` encoder. That is acceptable given the comment at `:210`.

## Limitations, unchanged

- The 65536-byte limit bounds retained decoded payload. It does not bound undici or zlib buffers, `JSON.parse` overhead or RSS.
- Fetch inflates compressed bodies before the reader sees them, so inflation CPU is spent before rejection.
- I can't confirm that `service.ts` validates generated artifacts before encoding; I am relying on the docs for that.
- The expanded suite has not been run, and the hashes have not been checked.