# Review: `requestCertificate` transport hardening

This is a static read of the pasted content. I ran nothing and verified no hashes. I also could not diff against the baseline myself. The only scope evidence I have is the session-start git status, which lists `certificates.ts` and its test as the only modified files. That is consistent with "no key or proving changes," but it is a snapshot, not a verified diff. This is not an approval, and production gates stay blocked.

## Verified by reading

- **Byte bound.** The decoded-byte bound happens before JSON parsing. The check `value.byteLength > bytes.length - size` accepts exactly 65536 bytes, rejects 65537, and rejects an oversized single chunk without copying it.
- **Certificate cap.** The 16384-byte cap is kept: `32770 = 2 + 2×16384`. It is checked on the actual string after `typeof === "string"`, so arrays and objects no longer pass through regex coercion. `null` and `[]` are rejected by the `!result` / `in` checks.
- **Reader cleanup.** The reader is cancelled and its lock released on success, read error, abort and oversize. Non-2xx and empty-body paths cancel through the outer `finally`. Cancelling an already closed or errored stream is swallowed, which is correct.
- **UTF-8 handling.** Strict decoding turns invalid bytes into "Malformed". With default options, `TextDecoder` strips a BOM, the same as the baseline `response.json()`, so the change is compatible.
- **Cancellation.**
  - `AbortSignal.any` propagates the source's reason object, so `signal.reason === stopSignal.reason` correctly separates a caller stop from a timeout or network failure.
  - Line 66 prevents returning a certificate after a stop.
  - The keeper's `e !== stop.signal.reason` identity check depends on this and is satisfied.
- **Retryability.** Every failure is a thrown error caught by `tick()` and retried. A well-formed but invalid certificate goes to `submitHiddenEvidence`, the simulation fails, and the keeper retries. The client never decides validity.
- **Producer compatibility.**
  - Success returns `{"certificate": <viem lowercase hex>}`, which matches the parser.
  - 503 (JSON body) and 401/403/404/429 (empty body) all map to "retry later".
  - `Connection: close` and `maxRequestsPerSocket = 1` don't interact with the reader logic.

## Findings

**1. New error messages are dropped from logs.**
`serviceErrorSummary` only emits messages that are on its exact allowlist. Two of the new messages are not on it:
- `Prover unavailable (${status}); retry later`, which is also dynamic so it can never match.
- `Certificate response too large; retry later`.

As a result, the keeper logs `{type:"Error"}` and operators can't tell 401, 429, 503 and oversize apart. That matters for the access and rate-limit setup.

Fix: use static messages per class, or attach a numeric `status` property that the summary whitelists. Then add both messages to the allowlist.

**2. The producer does not enforce the client's certificate cap.**
`service.ts` places no bound on the encoded certificate. The opening path encodes:
- a 96-byte head,
- a 32-byte length word plus the padded proof,
- a 32-byte length word plus 1760 bytes of inputs.

That fits within 16384 bytes only if the proof is smaller than about 14.4 KB. I can't see the proof size bound in `validCertificateArtifact`.

If a real proof ever exceeds the cap, the keeper retries "Malformed" forever on a cached artifact. That is a liveness stall, not a safety failure. Fix: share one constant and assert it on the producer side, or add a test that pins the maximum proof size.

**3. Timers and dependent signals build up in the long-running keeper.**
Each call creates an `AbortSignal.timeout(120000)` that lives for the full 120 s even after success, plus an `AbortSignal.any` signal depending on the process-lifetime `stop.signal`. Some Node 20/22 releases had leaks with `AbortSignal.any` on long-lived sources.

It is bounded but unnecessary. The suggested fix is a local `AbortController` with a `setTimeout` that is cleared in `finally`, using `timeout.abort(new DOMException(..., "TimeoutError"))`. This also makes the timeout injectable for testing.

You also need to confirm the `engines`/runtime floor: `AbortSignal.any` requires Node ≥ 20.3.

**4. Keeper race on stop (pre-existing, not a regression).**
If a timeout or network error fires and SIGTERM lands before the catch runs, then `stop.requested && e !== reason` rethrows. The keeper then exits with code 1 instead of 0. This is narrow but real for supervisors that alert on non-zero exit codes.

**5. Bearer token over `http://` (pre-existing).**
Nothing rejects a non-HTTPS `HIDDEN_PROVER_URL` unless it points at loopback. This is out of the change's scope, but it should be noted for the production gate.

**Minor.** Running the length check before the regex is cheaper. Uppercase hex is still accepted, as before, and viem tolerates it.

## Tests still needed

1. **Real redirect.** A real-HTTP 302 is rejected, the redirect target is never contacted, and `Authorization` is not forwarded. The current test only checks that the option is passed.
2. **Timeout.** With an injectable timeout (see finding 3), a timeout during headers and during the body rejects with `TimeoutError`, not the stop reason, and the reader is cancelled.
3. **Stop before headers.** Stop while fetch is still waiting for headers rejects with exactly the stop reason. The existing test only aborts after headers.
4. **Stop after full body.** Stop after the full body is read but before return rejects with the reason (line 66).
5. **Body cancellation on access errors.** Bodies are cancelled for 401, 403 and 429 responses with streaming bodies, not only 503.
6. **Log output.** `serviceErrorSummary` output for every `requestCertificate` error class shows a distinguishable message or status (finding 1).
7. **Producer contract test.** `producerServer` with a stub `generate` returns:
   - a maximum-size certificate, which `requestCertificate` accepts,
   - a cap+1 certificate, which is rejected,
   - the 503 JSON error, which is retryable.
8. **BOM and uppercase hex.** A body with a BOM and an uppercase-hex certificate are accepted, to pin baseline compatibility.

The final expanded suite has not been run, and nothing here is reported as passing.

## Limitations to state honestly

- **The cap bounds retained data, not memory.** The 65536-byte limit bounds the retained decoded payload. It does not bound undici and zlib internal buffers, `JSON.parse` overhead, or process RSS and capacity.
- **Decompression costs CPU before rejection.** Fetch decompresses gzip, br and deflate before the reader sees any bytes. A small compressed body can cost inflation CPU and buffer memory, up to backpressure limits, before rejection.
  - One option is rejecting any non-identity `Content-Encoding` before reading. The producer never compresses, so this would avoid inflation entirely.
  - That option would break deployments behind a compressing proxy, and would change the gzip test. I would keep the current behavior and document the limitation instead.
- **No earlier review outputs exist.** Earlier `/tmp` review outputs are gone, and this review does not rely on or claim any of them.