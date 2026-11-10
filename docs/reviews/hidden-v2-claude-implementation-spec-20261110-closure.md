# Closure review of `docs/hidden-v2-implementation-spec.md`

This is a static documentary review of the supplied sections only. I ran no tools, tests, setup or proving, and it is not a production approval. Spec line numbers refer to the excerpt pinned at SHA256 `c04740bd…888f`. Anything outside the supplied files is **referenced, not proven**.

## 1. Disposition

| # | Status | Basis |
|---|---|---|
| **N1** GT serialization | **Resolved** at documentary level | See §2 |
| **N2** `opening.ts` v1 trap | **Resolved** | spec:302-306 limits reuse to the `RULES_DIGEST`/`PROFILE` derivation and names the excluded v1 functions |
| **N3** `r ≠ 0` placement | **Resolved**, with one precision gap (P1) | See §3 |
| **N4** Resolution semantics | **Resolved**, with one consequence to state (P2) | spec:561-578, checked against `Account.sol:58-63, 68-72` |
| **N5** Drain lists | **Resolved**, with one gap (P3) | spec:526-534, 557-559 |
| **N6** Table residue | **Resolved** | spec:487 says "Mismo status y plaintext", consistent with spec:499-500 |
| **N7** Events and views | **Not verifiable here** | Only "unknown submit reverts" is visible (spec:501). The unknown-view status 0 text and the no-`MissionReturning` text are not in the supplied lines. |
| **N8** Stale NatSpec and armor | **Resolved** | spec:53-54 and spec:360-362 |
| **N9** Glued numbers | **Mostly resolved**, with remnants (P4) | See §4 |

## 2. N1: GT serialization

Every check I could make against the supplied sources agrees:

- **gnark native.** `e12.go:663-675` writes `C1.B2.A1` at offset 0 down to `C0.B0.A0` at offset 528. That is exactly spec:672-673. The values are non-Montgomery (`:660-661`), which matches spec:676-677.
- **tlock-js / noble.** `utils.js:44-56` walks fp12 `c1,c0`, then fp6 `c2,c1,c0`, then fp2 `c1,c0`. Each element is 48 bytes, big-endian and left-padded (`:38`). This is the same order as spec:676.
- **Circuit.** `capsule.go:102-106` reverses the `ToTower` output. `fieldBytes` (`:45-54`) turns the canonical bits, least significant first, into 48 big-endian bytes, so the encoding is canonical and not Montgomery.
  - This matches the other two paths **only if** `ToTower` returns `C0.B0.A0, C0.B0.A1, …, C1.B2.A1`.
  - That order is asserted by the comment at `capsule.go:97` and is not shown in this bundle. It stays referenced, not proven, and spec:682-683 correctly requires vectors for it.
- **IBE derivation.** spec:654-662 matches `capsule.go:107-116, 144-158`:
  - V is bytes `[96,112)` and W is bytes `[112,128)`;
  - the counter is little-endian;
  - only the first byte is shifted right;
  - the candidate is compared big-endian, with bits least significant first, against `Fr`.

The old "backend fijado" sentence is gone. spec:322-325 and spec:666-667 now state one rule, with no generic backend-order assertion.

**Optional sharpening.** Equal serialization only helps if all three implementations compute the same pairing value. That depends on the Miller-loop and final-exponentiation conventions, not just byte order. spec:1130-1131 should say the GT vectors start from the same `(signature, U)` inputs, not from a supplied GT element, so they cover both.

## 3. N3: the compositional `r ≠ 0` claim

The composition in spec:614-619 is correct as far as the sources go:

- `PairCircuit` rejects `U = (0,0)` (`main.go:45-47`) and requires U on G2 (`:39`).
- `CapsuleValid` is constrained to equal `IsEqual(scalar·G, U)` (`capsule.go:171-172`). It is not a free boolean.
- The external path only enforces `scalar < Fr` (`capsule.go:127`). Scalar 0 is therefore representable, as the EXHAUSTED route requires.
- That `valid` includes `CapsuleValid` depends on `defineMissionPredicate`. It is referenced, not proven.

**P1 (precision, non-blocking).** The claim at spec:685, "un scalar 0 no hace válida una U no identidad", needs `ScalarMul(G, 0)` to return a point that can never equal a valid non-identity U.

- `h3-zero-boundary_test.go:44` only shows that 0·G ≠ G, and that the zero-scalar witness is satisfiable with claim 0.
- It does not show what 0·G evaluates to. If the gadget hints its result, a value other than (0,0) for scalar 0 would matter.

Add one case to the required boundary tests: assert `IsEqual(ScalarMul(G, 0), U) = 0` for several non-identity U, or assert that the output is the identity encoding. spec:619 already asks for "fronteras del gadget escalar … probadas expresamente", so this is a request to name the case, not a contradiction.

The description of the existing test at spec:1133-1136 is accurate. It covers 0, 1 and order−1 with `IsSolved` only, it is not a full-game witness, and it finds no exhaustion preimage.

## 4. Remaining items

**P2 (N4 consequence, should state).** The formula and the overwrite behaviour are correct per `Account.sol:58-63`, and `endVacation` (`:71`) only shortens `vacationUntil`. One consequence follows that the text does not spell out:

1. A mission's travel time can exceed vacation length plus cooldown.
2. The target can then start a **new** vacation before arrival. `startVacation` drains only missions that are already due.
3. The record is overwritten with `vacationStart > m.start`.
4. The mission is therefore **not** protected, even though a vacation covered its send time.

Say this in one sentence after spec:572-573, so implementers do not "fix" it toward history semantics.

**P3 (N5).**

- `transfer`, `inviteController`, `authorizeSession` and `removeController` appear in neither list. Their drain status lives in `Game.sol`, which is not supplied.
- The "Allowed while locked" comments in `Account.sol` (`:141, 210, 229`) refer to the vacation or suspension lock, not to drain. Readers can confuse the two.

Either add those four functions to the lists, or state that the lists are illustrative and that the drain modifier in `Game.sol` is authoritative.

**P4 (editorial).**

- **spec:587. A broken list, the only structural defect.** Items 2 and 3 are merged ("…BLS12-381.3. Derivación…"), and spec:588 is numbered 3 again. Markdown renders five items where six are intended. Split the line and renumber to 1-6.
- **Glued words remaining:**
  - "a16 dígitos" (331)
  - "de64 caracteres" (332)
  - "serfalse" (707)
- **Over-long lines:** 50, 52, 527, 529, 577, 1135 and 1145 exceed the wrap width. This is cosmetic only.
- **Correctly preserved identifiers:** `payloadSalt16`, `plaintext37`, `MAC32` and `body69` are pseudocode identifiers and should stay as they are.

## 5. Verdict

No concrete blocking ambiguity remains in the supplied sections.

- **N1 is closed.** One normative rule is stated, its 576-byte order matches both gnark `Bytes()` and tlock-js `fp12ToBytes`, and it is consistent with the circuit, subject to the `ToTower` order, which is referenced and covered by the vector requirement.
- **Recommended before calling the document final:**
  - P2, one sentence on the superseded-vacation consequence;
  - the spec:587 list split.
- **Optional:** P1, P3, the remaining P4 spacing, and the GT-vector sharpening.

This closure does not establish circuit soundness, gadget behaviour at scalar 0 beyond the cited test's scope, actual cross-implementation GT equality, key provenance, or production readiness.