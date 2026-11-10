# Follow-up review of `docs/hidden-v2-implementation-spec.md`

This is a static documentary review only. I ran no tools or tests, and nothing here approves the setup. Claims that depend on files outside this bundle are classified as **referenced, not proven**. They are not counted as contradictions.

## 1. Disposition of the previous findings

| # | Topic | Status | Where |
|---|---|---|---|
| 1 | Verifier must revert; out-of-gas wrapped as `InvalidProof` | **Resolved** | spec:723-727, 803-808. Consistent with `MissionV2Consumer.sol:63-66` and `InvalidPointV2Consumer.sol:29-32` |
| 2 | Exact sub-flags; permissionless evidence; invalid-point rule | **Resolved** (see N3 for precision) | spec:486, 584-589, 599-605 |
| 3 | VALID result must imply every `_applyReveal` check; differential corpus | **Resolved** | spec:534-542, 1089-1091 |
| 4 | Global impact of the frontier | **Resolved**, lists incomplete (N5) | spec:515-520 |
| 5 | Stale B-doc text superseded | **Resolved** | spec:44-50 |
| 6 | `owner` is `playerId` | Resolved | spec:261, 368 |
| 7 | Admission does not see the target; vacation at resolution | Resolved, with gaps (N4) | spec:203-206, 544-550 |
| 8 | Calendar, `InvalidArrival`, `arrival=0` | Resolved | spec:223-232 |
| 9 | Evidence semantics | Resolved, one table residue (N6) | spec:486-491 |
| 10 | Events | Resolved | spec:428-443, matches `GameErrors.sol:99-120` |
| 11 | V1 context helper | Resolved for `MissionContext`; `opening.ts` remains a trap (N2) | spec:389-390 |
| 12 | IBE, DST, GT serialization | **Partially resolved**: internal contradiction (N1) | spec:313-318 vs 634 |
| 13 | ageFile concatenation | Resolved | spec:344, matches `capsule_age.go:135-139` |
| 14 | 384-byte proof layout, high half first, left-padded address | Resolved | spec:671-692, matches gnark `solidity.go:860-880` |
| 15 | H3 wrapper is permissionless and idempotent; `pre` shared; dynamic string; 512 batches | Resolved | spec:638-655, matches `H3Prefix.sol:36-69` |
| 16 | Nested ABI `bytes` | Resolved | spec:458-463 |
| 17 | Privacy at beacon release | Resolved | spec:56, 67-71 |
| 18 | `RULES_DIGEST` derivation | Resolved | spec:294-299, matches `opening.ts:33, 93-98` |
| 19-22 | Key formatting, `allStoredPlains`, keeper `advance(1)`, source citations | Resolved | spec:303, 924-925, 846-849, 904-908 |
| 23 | Numbers glued to words | **Not resolved** (N9) | throughout |

## 2. Byte and arithmetic checks I could perform against the sources

All of these are consistent:

- **Header length.** The header is 22 + 9 + 16 + 1 + 64 + 1 + (171 base64 characters + 3 LF) + 3 = **290 bytes**. That gives 19 packed blocks.
- **Body.** The body is 16 + 37 + 16 = 69 bytes, which is 5 blocks.
- **Packet.** The packet is 4 + 32 + 8 + 128 + 32 + 69 = 273 bytes. Its layout matches `capsule_age.go:144-154`, including the big-endian round.
- **Public inputs.** The 55-input index sums are correct. The field order is consistent with `age.go:189-196`, `capsule_age.go:16-21` and `mission_v2.go:10-17`. Booleans sit at 14/45/46/50, as `MissionV2Consumer.sol:42` expects.
- **Envelope sizes.** The opening envelope is 96 + (32 + 384) + (32 + 1760) = 2304 bytes. The invalid-point envelope is 96 + 416 + 96 = 608 bytes.
- **Quicknet public key.** It is 192 hexadecimal characters, which is 96 bytes.
- **H3.**
  - Little-endian counter: `H3Prefix.sol:72`.
  - First-byte shift: `:75`.
  - Range: `END=65535`.
  - Batch count: ⌈65534/128⌉ = 512.
- **Round bounds.** The 53-bit limit, the requirement that the round be nonzero, and the 16-digit padding all match `capsule_age.go:87, 105-108`.
- **Commitment ABI.** `_applyReveal:334` uses `abi.encode(uint64, uint8, uint256×3, bytes32)`. That produces the same six words as spec:255-258.
- **`compressedG2Valid` (`point_encoding.go:26-105`).** It implements the stated rule:
  - flag bits;
  - x < p on both halves, after clearing the flags;
  - the nonsquare certificate via the norm, so that `HasSquare=0` cannot be claimed for a square right-hand side;
  - the sign bound for a nonzero y, so the other root cannot forge invalidity;
  - subgroup membership by fixed-integer multiplication with unified addition;
  - non-identity.

  It is also consistent with the native routing in `producer_backend.go:231`.

## 3. Remaining or new issues

### N1. GT serialization is still contradictory. This blocks interoperability.

§7.1 (spec:315-318) correctly says the encrypting client defines the order, via `fp12ToBytes`. §11.3 (spec:634) still says "La serialización GT debe ser la del backend fijado".

The serialization that actually binds proofs is the **circuit's own**: `ToTower` in reverse, as 12×48 canonical bytes (`capsule.go:97-106`). It is not only the producer's `gt.Bytes()`.

The consequence of a mismatch is worse than "unprovable". For an honest packet:

1. A different sigma gives a different file key, `pre` and scalar.
2. Then `CapsuleValid = 0`, so `valid = 0`.
3. Anyone can then produce an **INVALID certificate for an honest mission**.

Required fixes:

- Make the rule normative: circuit serialization = `fp12ToBytes` (as used at `opening.ts:30, 210`) = native producer serialization.
- Fix spec:634.
- Add a GT vector to the §19 cryptography corpus.

The archived real VALID proofs suggest that the current code matches, but I cannot establish that here.

### N2. `opening.ts` is a v1 trap (medium)

The spec cites `opening.ts` as the source of `RULES_DIGEST` (spec:295). The same file is also labelled "Offline reference predicate". It differs from v2 in several ways:

- `statementDigest` uses the `VENDETTA_OPENING_V1` domain (`:89`).
- It hashes the **armored text**, not `packet273` (`:299`).
- It decodes a text plaintext (`:248`), not the 37-byte binary format.
- It rejects zero-padded rounds (`:174`), while v2 requires 16 padded digits.

State that only `RULES_DIGEST` (`:33`) and the `PROFILE` derivation are reusable from this file. `statementDigest`, `parseEnvelope`, `validatePlain` and `evaluateOpening` are v1 research code and are not a v2 reference.

### N3. Where `r ≠ 0` is enforced (medium-low, precision)

Spec:587 places `valid=1 ⇒ U=r·G2gen, r≠0` on the circuit. The circuit itself only checks `scalar < Fr` (`capsule.go:127`). The guarantee actually comes from two places:

- **H3 acceptance.** An accepted zero has negligible probability.
- **The consumer's EXHAUSTED rule.** It requires a zero scalar together with `x[14] = x[50] = 0` (`MissionV2Consumer.sol:59`).

Say this explicitly, or add a circuit constraint.

Related: the EXHAUSTED route requires the circuit to be **satisfiable with scalar 0** under the default `g2.ScalarMul` (`capsule.go:170`). Whether gnark 0.16.4 handles a zero scalar is unverifiable from this bundle. Because exhaustion is negligible for honest SHA-256 output, this is low priority. Still, §19 should require a satisfiability test for that witness, not only a test that it is rejected.

### N4. Resolution semantics missing from §10:544-550 (medium)

- **TRANSPORT has no target check.** On an empty slot the cargo is **destroyed** (`Missions.sol:162-170`, "lost on an empty slot"). On another player's building the cargo is credited to that player. Hidden transports never carry a trade (`sendHidden`). Clients must check this before encrypting.
- **Vacation logic uses the target owner's last vacation record at resolution** (`Missions.sol:129-132`). This assumes `Account` overwrites `vacationStart`, which is unverifiable here. If so, a vacation that covered the send time and was then superseded by a newer one is not detected. "Estaba de vacaciones cuando se envió" overstates the rule. Write the formula with explicit parentheses:

  ```
  m.start < vacationUntil && (vacationStart < m.start || (vacationStart == m.start && vacationSeq < m.seq))
  ```

  The current prose is ambiguous about precedence.
- **The vacation check runs before kind dispatch** and applies to every kind when the target is non-empty (`:142`).

### N5. The drain lists are incomplete (low-medium)

**Not draining** (`Game.sol`):

- `setRole`, `proposeRole`, `acceptRole` (69-79)
- `setGlobalPremium` (186)
- `suspend` (205)
- `grantPremium` (210)
- the UUPS upgrade
- the four calls already listed

**Blocked, not mentioned:**

- `register` (95), so no new players can join
- `startVacation` and `endVacation` (196-202), so a player cannot protect themselves with vacation during a stall
- families and wars
- `abandon`
- `poke`
- accepting a transfer, controller or session

Also state that the only remedy for a VALID head that always reverts is an admin upgrade, which is the trust boundary in spec:89-90.

### N6. Table residue (low)

The table at spec:476 still says "mismos bytes", which contradicts spec:488. Change it to "mismo status y plaintext".

### N7. Events and views (low)

- `_sendBack` ends a mission with no troops through `MissionEnded` and **without** `MissionReturning` (`Missions.sol:118`). An example is an attacker wiped out in battle. Indexers must not expect a `MissionReturning` event.
- `getHiddenEvidence` on an unknown ID returns a zeroed tuple with status 0. It does not revert, unlike `submit` (`HiddenEvidence.sol:51, 56-58`).

### N8. Stale comments and armor (low)

- **Stale NatSpec.** `Game.sol:458` describes a parked list ("Due hidden missions nobody revealed yet, out of the queue") above `playerOf`. Add it to the stale-comment note at spec:51-52.
- **Armor.** At spec:347, state that armor and `ageFile` are representations for the APIs. The v2 statement hashes `packet273` (`capsule_age.go:144-154`). The armor hash is only the non-V2 branch (`:156`).

### N9. Glued numbers remain throughout (editorial)

The pattern looks systematic, as if a formatter removed the space before digits.

Ambiguous cases:

- "proceso.401" (819)
- "es7M gas … más100k" (511)
- "ser0/1" (717)
- "invalid-point608" (733)
- "desde0" (240)
- "Anvil31337" (996)
- "Node>=22 (… con24.22.1)" (940)

Further cases:

- "y15 filas" (164)
- "de30s" (207)
- "añade20..22s" (224)
- "exactamente273" (267)
- "construye640 bytes:20 palabras" (358)
- "Firma comprimida48 … Scalar32" (699-714)
- "a2M gas" (721)
- "y32 handlers" (788)
- "umask0077" (900)

Apply one mechanical fix, letter-or-punctuation immediately followed by a digit, and then re-read the result.

## 4. Referenced, not proven (not contradictions)

These depend on files outside this bundle:

- **`HiddenResolution`:** struct field order, "plaintext37 versión2", conflict and consume rules.
- **`HiddenContext`:** framing, the 20 words, the V2 domain.
- **Circuits not supplied:**
  - `AuthenticatedOpeningCircuit`, `beacon.go` and `PairCircuit` (beacon authentication, pairing on U);
  - `CompactCapsuleCircuit`;
  - `defineMissionPredicate` (whether `valid` is exactly the conjunction over the context words);
  - `InvalidPointMissionV2Circuit` (asserts `compressedG2Valid=0` and binds the statement);
  - `unpack128` (big-endian);
  - `mission_v2_schema_test.go`.
- **gnark-crypto behaviour:**
  - whether `SetBytes` rejects x ≥ p;
  - whether `AddUnified`/`IsEqual` treat (0,0) as infinity.
- **Client and producer sources:** `producer_input.go`, `codec.ts`, `hidden-evidence.ts`.
- **Service, keeper, lease and systemd limits** (spec:785-826, 879-914).
- **Versions, test counts and review counts** (spec:937-944, 1114-1121).

## 5. Disposition

The five high-priority issues are now explicit, and the spec states them correctly against the supplied contracts and gadgets.

| Priority | Item | Note |
|---|---|---|
| Blocking interoperability ambiguity | **N1** | Contradictory definition of the GT serialization, with a silent valid→INVALID failure mode |
| Should fix | **N2** | v1 reference file cited without a caveat |
| Should fix | **N4** | Undocumented TRANSPORT cargo loss and the precision of the vacation rule |
| Non-blocking | N3, N5-N9 | Precision, completeness and editorial |

With N1 fixed, the document is an adequate normative guide for the current v2 at documentary level.

This review does not establish any of the following, and the spec correctly leaves them open in §18 and §20:

- circuit soundness;
- that tlock-js and the circuit actually agree on GT serialization;
- the provenance of the keys;
- production readiness.