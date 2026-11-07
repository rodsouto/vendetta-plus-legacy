# Budgeted native PK point validation on small exports

The existing PK scanner now has an opt-in native mode with a mandatory,
conservative maximum of 65,536 PK points. Every vector point is checked by the
pinned native curve/subgroup decoder and canonical reencoding, on the same buffered
bytes being hashed. It never builds point vectors or returns a usable PK object.

Native validation passed on small zero/one-commitment exports. Both the actual
shell wrapper and pnpm passed on synthetic valid-point exports. These fixtures
establish reader behavior, not secure setup or CS/key equations. G1/G2 point
corruption and noncanonical infinity encodings are rejected by native mode even
when their tags and supplied hashes are coherent. Framing-only mode retains its
explicit false point-validation flag.

The conservative point bound is checked before constructing the PK reader or
native VK decoding. A reader that fails if touched tests this ordering.
`game-domain-rejections.json` preserves both real CLI failures with the existing
game metadata/PK/VK pins and the highest supported budget. Both returned exit 1
with no success JSON. The game PKs were opened for size checks but their bodies
were not scanned: the expected budget error precedes PK-reader construction.
No game-domain point validation, setup, FFT, MPC or proving was repeated.

Successful small native checks set `allPkPointsValidated=true`; they still set
circuit binding, full key relation, transcript verification and production
approval false. Valid group points do not establish the relations between them
or setup provenance. No production path was enabled and previous key files and
raw reports were not replaced.

Validation: 232 passing Go test/subtest events across seven packages, combining
229 in the regression suite and three in the new actual-wrapper/pnpm test.
Eleven events are new relative to the prior 221-event suite. Offline vet, gofmt
and Bash syntax checks passed. No new fuzz or total RSS claim. External logs,
source archive and closure receipt are under
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-pk-points/`.
[Procedure and limits](../../../proposals/hidden-v2-pk-structure-check.md).
