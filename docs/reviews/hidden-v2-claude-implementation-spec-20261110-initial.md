# Review of `docs/hidden-v2-implementation-spec.md` against the supplied sources

This review is documentary only. No tools were run, no tests were executed, and nothing here approves the setup. Some claims cannot be checked from this bundle, for example `Game.sol`, `prover.ts`, `HiddenAdmission.sol` and the H3 parts of `CapsuleAgeCircuit`. Those are marked **unverifiable** and are not counted as contradictions.

## High priority: security and liveness

### 1. Verifier failure must be signalled by a revert
Both consumers call `try verifier.verifyProof{gas: …}(proof, x) {} catch { revert InvalidProof(); }`, and the interface returns nothing (`MissionV2Consumer.sol:63-66`, `InvalidPointV2Consumer.sol:29-32`). If an independent implementation uses a verifier that returns `false` instead of reverting, the consumer will accept every proof.

§12 should say this normatively:
> El verificador DEBE revertir ante cualquier prueba inválida (semántica del export Solidity de gnark). Un verificador que devuelva `bool` exige un consumidor que compruebe el valor devuelto.

Also, `InvalidProof` is not strictly deterministic. A caller that leaves less than the 2M gas cap can trigger an out-of-gas that the `catch` converts into `InvalidProof`. §13.3 lists `InvalidProof` as a deterministic rejection that evicts the cache. It should qualify that this holds only when the eth_call or simulation has enough gas.

### 2. Soundness of the "false" paths matters as much as validity
`submit` is permissionless, and the first recorded result is final (`HiddenResolution.sol:54-58`). If any intermediate flag can be chosen by the prover, a third party can turn a valid attack into INVALID. §11.1 only requires that `valid` be the full conjunction. It should require the same of every sub-flag:
- `CapsuleValid`, `HeaderValid` and `PayloadValid` must be exact functions of the witness, not booleans the prover can choose.
- The plaintext in 42..44 must come from the authenticated keystream.
- The scalar must be the one from the exact H3 prefix.

The spec should also state, in §10 and §11, that anyone may submit evidence, as B-22 already says.

For invalid-point (§11.2), "según el decoder/gadget fijado" is ambiguous, and it determines which route applies. Enumerate the rule the producer uses (`producer_input.go:137`):
- U is not decodable as a compressed canonical G2 point (wrong flags, coordinate ≥ p, not on the curve);
- or U is the point at infinity;
- or U is outside the subgroup.

Require the invariant: opening `valid=1` ⇒ `U = r·G2`, `r≠0`, and an invalid-point proof is provable only if U fails that rule.

### 3. A VALID result that reverts at execution blocks the whole world
For VALID, `_processHistorical` calls `_applyReveal`, which **reverts** with `BadReveal`, `InvalidCoordinate`, `InvalidMission` or `InvalidCover` (`Missions.sol:331-351, 371`). Since a revert also undoes consume and dequeue, a divergence between the circuit predicate and these defensive checks leaves the head stuck with no fix short of an upgrade. The same applies to any revert inside `_process`.

Add a normative invariant to §10 and §11.1:
> El predicado del circuito DEBE implicar todas las comprobaciones defensivas de `_applyReveal` (mismo commit con owner=playerId, dominio, origen distinto, `Map.distance ≤ cover·1000`, carga). Procesar una misión vencida no puede revertir salvo `Backlog` por gas.

Add a corresponding item to the §19 corpus: differential tests of the predicate against `_applyReveal` over the whole domain.

### 4. The frontier stops every draining player action, not just progress
`drain()` reverts with `Backlog` whenever a due head remains (`Missions.sol:69-74`). With a PENDING head, **every draining action by every player in the world reverts**: building, research, training, sending, trading and `recall` (B-26: "`recall` does drain").

§10 (lines 434-445) only mentions the lack of progress in `advance`, and it insists the frontier is not a "pausa". That is technically true for non-draining calls, but it understates the operating limit. State explicitly:
- which calls still work: `submitHiddenEvidence`, `advance`, and the B-26 calls that do not drain;
- that the cost of one PENDING head is a global halt of the game.

### 5. The normative source contradicts itself
§1 makes `docs/spec/blockchain.md` the top-precedence source, but it still contains text that contradicts B-22:
- **Summary row for B-07** (`blockchain.md:35`): "an unrevealed hidden mission is parked and re-enters at its reveal". This contradicts B-07:188-189 and B-22:581-583 (no parking, no fresh arrival).
- **B-08:229-231 and B-26:705**: "no advance or reveal in front", "like the keeper's reveals". There is no reveal.
- **B-20:538**: "hidden missions the client cannot reveal… are not [counted]". This contradicts §16 of the spec and B-22:618-619, under which the forecast stops at the frontier.

The spec should either list these lines as superseded by the body of B-22, or require fixing them. The current note about stale comments (lines 41-42) covers only code, not the normative doc.

## Medium priority: interoperability

6. **`owner` is the `playerId` (uint64), not an address.** This applies to the commitment (§6) and to word 5 (§8): `m.owner` in `HiddenContext.sol:50` and `_applyReveal:334`. A client that commits to the controller's address would produce missions that are always INVALID.

7. **Hidden admission does not check the target.** It skips `OwnTarget`, `TargetOnVacation` and the trade checks (`_createHidden` compared with `_validateTarget`). At resolution:
   - a target owner on vacation at **send** time, ordered by `seq`, sends the mission back (`_sentDuringVacation`, `Missions.sol:129-144`);
   - ATTACK against own building, or STATION/OCCUPY to an invalid destination, sends it back.

   §5.1 ("vacaciones … siguen vigentes") is misleading, and §11.1 ("instante histórico") is ambiguous about vacation. Specify both.

8. **Calendar (§5.2):**
   - Besides `TooLate`, there is `InvalidArrival` when `arrival > natural+30`. With the 20..22 s offset, a client clock more than about 8 s ahead of `block.timestamp` triggers it.
   - `arrival=0` takes the natural arrival (`Missions.sol:306`), but `packetRound` still requires the exact round. Recommend never sending 0.
   - Both checks use `block.timestamp`, not the wall clock.

9. **Evidence semantics (§10).**
   - If the mission is inactive (cancelled, `returning`, deleted), `submit` returns `false` **without verifying** anything (`HiddenEvidence.sol:63`).
   - An unknown receipt reverts with `ResolutionUnknown`.
   - "Mismos bytes" means the same status and plaintext, not the same certificate. A different proof with the same result is fully verified and returns `false`.
   - A conflict only reverts while the mission is active.
   - The bindings are stored in `HiddenEvidenceState`, not in the receipt (line 359).

10. **Missing events.** The spec omits `HiddenEvidenceRecorded(id, valid)`, `HiddenMissionInvalidated(id)`, `MissionRevealed(id, kind, city, neighborhood, slot)` and `MissionReturning`. These are required by indexers and clients.

11. **Context domain.** `MissionContext.Define` defaults to `"VENDETTA_OPENING_V1"` (`mission.go:55`), while the protocol uses V2 (`HiddenContext.sol:45`, `producer_input.go:59`). State that V1 is a historical research circuit and that the only valid word 0 is V2.

12. **IBE (§7.1).** Make explicit that:
    - the identity is hashed to G1 with the **same DST** as the beacon, so `pairing(sig, U)` reproduces the key;
    - `U = r·G2gen`;
    - the GT serialization is defined by the **encrypting side** (tlock-js/noble). The prover must match it (it uses gnark's `gt.Bytes()`) and verify that with vectors. "Backend fijado" is ambiguous here.

13. **Binary age format (§7.1).** The file the APIs consume is `header || " " || base64-raw(MAC) || "\n" || payload` (`codec.ts:87-91`). Spell this out instead of only referring to `codec.ts`.

14. **Proof (§12).**
    - 384 bytes corresponds to gnark Groth16 with one BSB22 commitment plus its PoK. Document the layout, and that the arrays of 55 and 2 exclude the commitment hash.
    - State that a bytes32 is split **high half first** (`x[48]<<128 | x[49]`).
    - The address in word 2 is **left**-padded (`mission.go:71-74`). "Extendida con ceros" is ambiguous.

15. **H3 (§11.3).**
    - `MissionV2Consumer.begin` has no access control: **anyone** can initialize any `pre`, and it is idempotent. "Sólo el consumidor admite" is true only at the `H3Prefix` level.
    - The state is keyed by `pre` (`contextDigest=pre`) and shared between missions.
    - The receipt ID uses `abi.encode` with a dynamic **string** (offset, length, data).
    - Worst case, exhaustion takes ≈512 `advance` transactions of 128 steps each, signed by the H3 signer. EXHAUSTED is negligible for honest SHA-256 output, but it must be implemented and tested (via `candidate` virtual), with no index limit lower than 65534.

16. **`getHiddenEvidence`** returns `bytes` that contain the `abi.encode` of a dynamic tuple (it starts with an offset). Document this double encoding.

17. **Privacy timing (§2).** The plaintext becomes public when **drand publishes the round** (arrival+15), independent of any certificate. An invalid-point result can be recorded before arrival, which publicly signals that the mission will return. Fix the column header in the table.

18. **`RULES_DIGEST`.** The spec gives no derivation, only the constant. It is enough for compatibility, but adapting the design to another game requires referencing the file or test that recomputes it.

## Low priority and editorial

19. The public-key lines (§7) are 69, 68 and 55 hex characters, so they split bytes across lines. Use a single line or an even-length split.
20. `allStoredPlains` merges the plaintexts of all accounts in the browser (`hidden.ts:126-139`), so "separado por Game/owner" is not an isolation boundary.
21. The diagram shows `advance(max)`, while the keeper uses `advance(1)` with a 12M gas budget (`keeper.ts:83,95,172`). Also, a failure on one mission aborts the whole tick, which causes head-of-line blocking.
22. The following are **unverifiable** from this bundle and should cite their source files: the limits in §13.3 other than RPC/receipt, auth-before-body in §13.4, `sendHiddenMission`/`hiddenConsumers`, the 30 s cooldown, `HIDDEN_ARRIVAL_SLACK`, the flock and inode checks, the versions in §17.1, the setup policy in §18, and the "seis/tres revisiones".
23. Numbers glued to words create ambiguity: "del10:33 tests" reads like a time of day, and similarly "del7:182", "mide48", "Capacidad8". Separate them.

## Sufficiency and limitations

With corrections 1–5 applied, the document is a reasonable implementation guide. The byte formats are consistent with the code I checked:
- the 37- and 273-byte formats and their offsets;
- the 20-word context;
- the 55-input schema;
- H3 and its first-byte shift;
- the envelope sizes of 2304 and 608 bytes;
- cover, distance, the calendar and the receipt state machine.

The test receipts (33/5 for the current transport; 182/27 separate and earlier) are not summed. They are presented as historical, which is correct.

Without those five corrections, an implementer could:
- accept arbitrary proofs (1);
- allow griefing a valid attack into INVALID (2);
- permanently freeze the world (3);
- underestimate the impact of the frontier (4);
- follow stale normative text (5).

What this documentary review does not establish:
- the soundness of `CapsuleAgeCircuit` or `InvalidPointMissionV2Circuit`, whose sources were not supplied;
- the equivalence of GT serialization between tlock-js and gnark;
- the producer, HTTP and lease behaviour;
- the provenance of the experimental keys.

Those remain open, as the spec itself states in §18 and §20.