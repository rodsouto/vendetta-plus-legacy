I agree with the proposed resolution of every disagreement. My earlier test-gap list was broader than necessary for this change.

1. **Rejecting stored enums plus the constants rule is sufficient for this scope.** AST variant tracking adds no protection once enums are forbidden throughout the reachable storage graph, including mapping keys/values and nested arrays/structs. Rejecting enums was also an alternative in my original finding.

   The constants rule addresses the remaining semantic risk: changing `ATTACK` from `1` to `2` reinterprets persisted missions without changing their layout. Clarify that **previously assigned values must never be reused for different meanings**, even after their original constant is removed. Review must enforce this; the proposed checker does not.

   I retain the diagnosis that the current checker misses enum changes, but accept your proposed fix completely.

2. **I would not require any of those three tests now.**

   - **Invalid UUPS targets:** agreed. The installed OpenZeppelin implementation validates the target; this change does not alter that validation. I have no concrete uncovered failure attributable to this patch.
   - **Migration calldata:** agreed. Test the actual migration when one exists. Currently, authorization runs before the implementation update and migration delegatecall, so the freeze check blocks both.
   - **Transfer pending before freeze:** agreed. Freezing writes only the core freeze flag; acceptance updates only ownership state. The existing freeze → transfer → accept → rejected-upgrade test already establishes that ownership acceptance does not clear the flag. Reversing when the pending transfer starts adds no distinct relevant path.

   These were coverage suggestions, not demonstrated correctness defects. I withdraw them as requested additions. Initializer rejection tests and checker regression fixtures remain worthwhile, as you accepted.

3. **Computing inline usage from the old layout is correct; I cannot construct a bypass under the existing compatibility rules and collision rejection.**

   For the suggested case—previously inline, now no longer inline, and growing—the old inline set still contains the struct and rejects its growth.

   More fundamentally, an existing inline occurrence cannot disappear compatibly: removing or changing its parent field is rejected; changing an array’s base is rejected; removing an enclosing type requires changing a reference further up the graph. Following those references eventually reaches a checked change in `CoreState`. The “removed types” skip does not escape that chain.

   Conversely, growing a previously mapping-only struct and adding its first inline occurrence in an appended field is safe: existing mapping entries retain their member positions, and the new occurrence occupies newly allocated storage. Using the old graph fixes that false rejection.

The collision rejection, old-layout inline set, enum prohibition and constants rule are a sound resolution. These are assessments of the **proposed changes**: the script I read still silently overwrites normalized collisions and computes inline usage from `now.types`. No files were modified.