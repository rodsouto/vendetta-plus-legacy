# Combined archived-evidence preflight

The single preflight command passed for both completed local circuits and the
three-proof Game/H3 replay on 2026-11-05. It read 41,031 source JSON bytes,
including its pinned plan. It cross-checked inventories, compile metadata,
PK/VK-export report identities, receipt packets and archived replay assertions.
No CS/key/transcript bodies or external original proof files were read, and no
native work was rerun. Private copies of pinned JSON inputs were reread by the
existing evidence/lineage checkers; those rereads are excluded from the source
byte count.

`result.json` preserves direct Python stdout. Full pnpm output and test logs
remain outside Git at
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-archived-preflight/`.
The source-bundle digest and validation receipt are recorded there too.

The plan is `docs/proposals/hidden-v2-archived-preflight-inputs.json`, SHA-256
`429587c48f8322b08ce1e53836eb1ce91e531b3df26327987e982468dbce0f9e`.
It binds all report pins and both receipt-packet indices; keys/manifests/CS retain
their previous identities. Archived sources may come from different historical
revisions. This does not attest that the current source tree reproduced them.
All current-artifact/native-reexecution/source-reproduction/independent/production
approval flags remain false.

Validation: eight new Python tests with 16 semantic mutations that recalculate
report and plan hashes; cross-circuit report substitution, altered receipt
packet, missing inputs, unknown approval fields, scope escalation, JSON path/
file/budget controls, private-snapshot behavior and real CLI errors without
success output. The 26 preceding lineage/evidence/inventory/source-bundle tests
also passed: 34 Python tests total. Python and pnpm outputs match. No Go, game or
real-proof suites were repeated for this Python-only addition.

The source bundle was also verified and checked after extraction using Python
in isolated mode with Git/pnpm/Go absent from PATH. Its preflight output matched
`result.json` byte for byte. This exercises portability of the JSON dossier,
not reproduction of the historical native circuits, keys or proofs.

[Procedure, limits and scope](../../../proposals/hidden-v2-archived-preflight.md).
