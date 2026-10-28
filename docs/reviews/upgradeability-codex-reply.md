Found two P2 issues in the layout checker. No P1 findings or freeze/ownership bypass found.

1. **P2 — Normalization can merge distinct structs and hide incompatible changes.** [storage-layout.mjs:23](/home/rodrigo/orca-projects/vendetta-plus-legacy/contracts/scripts/storage-layout.mjs:23), [storage-layout.mjs:35](/home/rodrigo/orca-projects/vendetta-plus-legacy/contracts/scripts/storage-layout.mjs:35)

   Solidity permits same-name structs in separate source files. Removing their AST IDs maps both to the same key; `types[norm(id)]` silently overwrites one definition.

   Concrete scenario: an existing stored `Item.x` changes from `uint64` to `uint128`, while a newly referenced, separate `Item` retains the original definition. If the unchanged definition wins the overwrite, existing references normalize to it and the incompatible change passes `--update`. I reproduced this silent acceptance with an in-memory fixture.

   Preserve distinct type identities through normalization, or reject normalized-key collisions.

2. **P2 — Enum reordering/removal is invisible to the snapshot.** [storage-layout.mjs:35](/home/rodrigo/orca-projects/vendetta-plus-legacy/contracts/scripts/storage-layout.mjs:35), [storage-layout.mjs:67](/home/rodrigo/orca-projects/vendetta-plus-legacy/contracts/scripts/storage-layout.mjs:67)

   Solc’s storage-layout metadata gives an enum’s name and byte width, but not its variants. Changing `Status { Pending, Active }` to `{ Active, Pending }` produces identical normalized metadata: persisted `0` silently changes meaning, and even ordinary check mode passes. Removing a variant can likewise leave persisted values invalid.

   There are no enums in the current `CoreState` graph, so this becomes exploitable after introducing one. Record enum variants from the AST and require their existing sequence to remain intact, or explicitly reject stored enums.

What I checked and found correct:

- Nested array and mapping IDs normalize recursively, including `TrainingItem[][2]`.
- Existing field removal, reordering, renaming, offset changes, scalar-type changes and array-length changes are detected.
- Mapping-value structs and `CoreState` may grow. Existing inline struct growth is rejected, including a struct reused both inline and as a mapping value.
- Skipping removed type definitions does not independently bypass protection: removing their existing reachable references changes a parent member or container definition.
- The slot-zero probe exposes relative `CoreState` layout; the namespace test separately checks the real ERC-7201 base.
- UUPS calls `_authorizeUpgrade` before implementation replacement or migration delegatecall. Freezing blocks that path, and no alternate implementation-write path was found.
- Implementation initialization is disabled; proxy initialization sets a nonzero owner. Omitting `__Ownable2Step_init()` is harmless with the installed dependency because it is empty.
- A pending owner has no owner powers before acceptance. Acceptance preserves the freeze flag; `transferOwnership(address(0))` only cancels a pending transfer. The renunciation override prevents ownership loss.
- Spec, deployment docs, ABI and translations agree with the implemented freeze behavior. Inserting `upgradesFrozen` mid-struct is acceptable under the stated pre-deployment scope.
- Cached deployed bytecode is **24,334 bytes**, leaving the stated **242-byte** margin.

One conservative rejection: growing a mapping-value struct while introducing its **first** inline use in a newly appended field is storage-safe, but the checker rejects it because it derives inline usage from the new layout. I reproduced this; it follows the literal blanket “inline structs keep their size” rule.

Test gaps include checker regression fixtures, initializer rejection cases, invalid UUPS targets, migration calldata, and a transfer already pending when freezing occurs.

`git diff --check` passed. Forge tests were blocked by writes to the read-only cache; the layout script was blocked by sandbox subprocess execution. Comparator reproductions ran in memory. No files were modified.