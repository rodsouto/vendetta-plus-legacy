# Final closure check: static read only

**Result: no concrete blocking defects.**

This is a static read of the supplied text only. I ran no tools and make no test, typecheck, independent-review or production claims. Your 33/33 output is your own execution evidence. I can't confirm it.

## `service.ts`: validation before ABI encoding

Every path reaches validation before any encoding or consumer call:

- **Cache hit path.** `cachedCertificate` returns only a value that passed `validCertificateArtifact` against `expected = {kind, statement, setup}`. Line 370 re-validates it anyway, which is harmless.
- **Fresh proof path.** `JSON.parse(output)` at line 366 is followed by `validCertificateArtifact` at line 370. A failure removes the output and throws `"Invalid producer artifact"`, which is in the static message set.
- **Order.** Line 370 runs before `withProofVerification`. So `prefix()`, both `check` reads and `encodeAbiParameters` (lines 399–406) all see a validated `proofArtifact`.

What the validation guarantees for encoding:

- **`kind`** matches the inspected `kind`, so tag 1 or 2 matches the shape.
- **`publicInputs`** has length exactly 55 or 2, as canonical decimals under 2¹²⁸. Indices 14, 45, 46 and 50 are under 2. So `uint256[55]` and `uint256[2]` cannot fail on length or range.
- **H3 halves.** The `<< 128n | …` compositions at lines 213 and 244 are well-formed because each half is under 2¹²⁸.
- **`proof`** is exactly 384 bytes of hex. **`pre`** is 32 bytes and is required for opening artifacts.
- **Size.** The largest envelope is the opening one: 2304 bytes, about 4610 hex characters. That is well under the client's 32770-character cap and the 64 KiB body budget.

## `certificates.ts`

- The only runtime change is the comment at lines 79–81, and it matches the line 82 logic.
- **Stop wins.** `AbortSignal.any` takes its reason from whichever signal fired first. So the reason-identity check correctly lets a stop win only when the stop fired first, and keeps a timeout-first failure as is.
- **Line 76** rejects a complete payload after a caller stop, which matches the new test at lines 389–412.

## Non-blocking observations (no action required)

1. **Case-sensitive `pre` check (`service.ts:214`).** `p.pre !== expected` compares against lowercase `toHex` output, while the validator accepts uppercase. An uppercase `pre` from the producer would be evicted as `InvalidProof` instead of matching. This only matters if the native binary ever emits uppercase.
2. **Unparseable fresh output (`service.ts:366`).** If the fresh output file isn't valid JSON, the `SyntaxError` propagates without removing the file. The next request's `cachedCertificate` treats it as a cache miss and removes it, so the cache heals itself. It logs as `ExternalError` with no message, which is safe.
3. **Timeout, then stop, then successful read.** If the timeout fires, then a stop, and the body read still completes, line 76 throws the stop reason. Either outcome is a rejection, so there is no correctness impact.

Everything else you listed stays as previously accepted: the Node ≥22 timeout/`any` retention, the failure-racing-stop exit policy, the TLS deployment gate, and the generic message for the optional 404 path.