I found no path in `compile.ts` that overwrites existing artifacts or mislabels a manifest. The remaining risks are around it: the service's default runtime path, any missed callers, and real Foundry behavior that the synthetic tests can't show. This comes from reading the code you pasted, plus my memory of Foundry's behavior. I ran nothing, and I couldn't see `run-producer-game.ts`, `snapshot-opening.ts`, `package.json` or `setup.ts`.

## Findings

**1. Medium: the default startup path still trusts the legacy file (`service.ts`, `startProducer`; `prover.ts`)**
- **Problem:** if `HIDDEN_PROVER_RUNTIME` is unset, the service reads `keys/verifier-runtime.json`, which is the file the old compiler could mislabel. A legacy file whose runtime and setup values match still passes the startup check, so the new pinning isn't enforced by default.
- **New setups:** the compiler no longer writes that file, so they fail with a bare `ENOENT` rather than an error naming the missing setting.
- **Fix:** make `HIDDEN_PROVER_RUNTIME` required in `prover.ts`. If archived replay needs the old file, put it behind an explicit legacy flag.

**2. Medium, needs checking: missed callers now read stale data silently**
- **Problem:** `keys/evm` now survives, so a missed caller reading `keys/evm/out/...` or `keys/verifier-runtime.json` gets old data without an error.
- **Fix:** search the scripts, docs, CI and `package.json` for `keys/evm`, `evm/out` and `verifier-runtime.json`.

**3. Medium: the real Foundry path is untested**
- **Looks compatible:** `out/opening.sol/Verifier.json` and `deployedBytecode.object` match the standard layout, and two `Verifier` contracts in differently named files shouldn't collide.
- **Untested assumptions:** the fake compiler can't show that `foundry.toml` is accepted, that the generated contract is named `Verifier`, or that the hash stays stable across output roots.
- **Why stability matters:** default CBOR metadata embeds a hash that depends on source paths, settings and compiler version. I expect root-relative paths to keep it stable, but that needs proof.
- **Fix:** build the same sources in two different roots with real `forge` and compare the runtime hashes with each other, the legacy value and the deployed code. If they differ, the service fails closed, but the existing deployment can't use the new output.

**4. Low to medium: the build isn't pinned**
- **Compiler:** `SOLC_BIN` is optional, so without it Foundry picks the compiler. `verifier-runtime.json` doesn't record which one it used.
- **Config:** the fresh `foundry.toml` doesn't pin `bytecode_hash` or `cbor_metadata`. `FOUNDRY_*` variables and global Foundry config can also affect the build.
- **Impact:** a stable environment reduces this risk, but it limits how well the output can be reproduced later.
- **Fix:** require `SOLC_BIN` and record the compiler version and hash. Also pin those settings and pass a minimal environment to `forge`.

**5. Low: a blank `HIDDEN_PROVER_RUNTIME=` fails confusingly (`service.ts`)**
`??` keeps the empty string, so `readFile("")` fails with an unclear error. This is easy to hit from a `.env` file. Finding 1's fix should reject blank values too.

**6. Low: `compile.ts` doesn't check the manifest's kind**
Swapped `opening` and `invalid-point` directories produce a mislabeled output. `validateSetupManifest` should catch this at service startup, assuming it checks kind as its arguments suggest. Checking in the compiler too would fail earlier.

**7. Low: the containment check doesn't follow symlinks inside `keys`**
If `keys/opening` links elsewhere, a fresh output can be created inside that target. Nothing is overwritten, but public build output lands in a key archive. Resolving `keys/opening` and `keys/invalid-point` in the same check would close this.

## Test gaps
- `rejects changed source before invoking the compiler` doesn't prove that the compiler never ran. Have the fake compiler write a marker file, then assert that it's absent.
- No test covers `Verifier.sol` changing during the build, or the `--use` argument being passed.
- `output` should be a required parameter, so stale two-argument callers fail at compile time rather than runtime.

## Preservation guarantees

| Guarantee | Status |
|---|---|
| Existing output is never reused | Holds: non-recursive `mkdir` fails on existing paths and symlinks, and concurrent claims fail too |
| Output parent resolving into `keys` is rejected | Holds, including `..foo` names and symlinked parents |
| The compiler doesn't write to `keys` | Holds for `compile.ts`, while `forge` is scoped to `--root` |
| Manifest digest, parsed manifest and source hash come from the same bytes | Holds: the bytes are captured once, before the build |
| Compiled source is the source that was hashed | Holds, assuming the trusted compiler reads the copied `src/` |
| Runtime metadata is only written once | Holds: the `wx` flag fails if the file already exists |
| Failed builds can't produce final metadata | Holds, though a crash during the final write could leave a truncated file, which the service rejects at parse time |
| Output stays immutable after creation | **Not provided:** the directory is `0700`, but later edits aren't prevented |
| Output survives a crash | **Not provided:** there is no `fsync` or atomic rename |
| Runtime binding is enforced by default | **Not provided:** see finding 1 |

Fix finding 1 first, then run the check in finding 3 before relying on this output for an actual game setup, proof or replay.