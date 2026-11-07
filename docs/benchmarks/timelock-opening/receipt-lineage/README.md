# Offline receipt lineage of both completed local MPC exports

Both final local exports passed the metadata-only lineage checker on 2026-11-05.
Each packet contains the exact public JSON bytes of 12 linked documents, renamed
by SHA-256, plus a pinned index. It covers two contributions and their recorded
verifications per phase, sealed commons, initialization, key export and final
manifest. No native transcript, CS, PK or VK body is included or read.

| Packet        | Index SHA-256                                                    | JSON bytes read, including index |
| ------------- | ---------------------------------------------------------------- | -------------------------------: |
| opening       | c83a34751cccd806eeede0cb419c21620c73dea48ce4dbd52a8f90dcc0ca7d03 |                            9,338 |
| invalid-point | d9979dda311f651298992017d0c92668bfb3ddb3af149e379222d487fa436a25 |                            9,314 |

`opening-result.json` and `invalid-point-result.json` preserve the checker result
bytes. Root key-receipt, manifest and declared CS pins match the prior
[export inventories](../artifact-inventory/README.md). `opening/` and
`invalid-point/` are self-contained receipt packets; filenames identify original
bytes, not independent approval. The original document paths are recorded in
external `packet-build.json` under
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-receipt-lineage/`.
Previous artifacts and evidence remain unchanged.

All checks explicitly leave native MPC reverification, referenced binary byte
verification, participant authentication, closure publication, post-closure beacon
proof and independent/production approval false. A `nativeTransitionVerified`
field is a checked historical receipt claim, not a newly executed verification.
Local operators can construct internally consistent receipts; independent trust
and real cryptographic verification remain necessary for production import.

Validation: eight new Python tests, including 15 semantic mutations with ancestor
hashes recalculated so failures exercise reference/context validation rather than
only stale hashes. Cases cover both original packets, wrong external pins,
missing/changed/unsafe files, missing ancestry, skipped contributions, phase/domain
mixing, approval/beacon claims, dimensions, JSON/path/budget controls, unreachable
receipts and actual CLI success/failure without success JSON on error.
The 18 existing inventory/evidence/source-bundle tests also passed. No Go, game,
MPC or proof suites were repeated for this Python-only addition.

See the [procedure and exact scope](../../../proposals/hidden-v2-receipt-lineage.md).
