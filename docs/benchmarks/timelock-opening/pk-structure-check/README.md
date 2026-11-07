# Streaming PK structure and shared VK parameters

Both existing final local PK exports passed on 2026-11-05. The scanner checked
full input SHA-256, structure/dimensions, infinity masks, and the five shared
header parameters against each checked VK. It did not deserialize a PK, load a
CS, build large FFT tables, execute MPC/proving or write any key artifacts.

| Circuit       | PK bytes scanned |    Domain |     Wires | Compile metadata pin                                             |
| ------------- | ---------------: | --------: | --------: | ---------------------------------------------------------------- |
| opening       |    1,215,401,903 | 8,388,608 | 6,894,167 | a6d95d061df2701f726e6ac7f9464a156070701201c29e6cd02a774dd4715986 |
| invalid-point |      845,623,725 | 4,194,304 | 5,582,166 | 9399fe0811c4fe51d7ffad8c66dc6d63fd6018e1041f62eeeb7b3fe2e7db620f |

The pinned metadata files are `../cs-reproduction/opening-1.json` and
`../cs-reproduction/invalid-point-1.json`. PK/VK pins remain those of the
[previous export inventories](../artifact-inventory/README.md).

`opening.json` preserves direct wrapper stdout; `invalid-point.json` preserves
the unchanged JSON line from pnpm output. Full pnpm output, tests, source bundle
and closure receipt remain outside Git under
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-pk-structure/`.

All results explicitly leave full PK point validity, circuit binding, full key
relation, MPC transcript verification and production approval false. Tag scanning
is not native point validation; shared constants and compatible dimensions do
not establish the setup equations. Compile metadata pins are local inventory
identifiers, not independent evidence of authorship or approval.

Validation: 221 passing test/subtest events in seven Go packages, including
33 new events for PK scanning/CLI, plus existing VK-export and MPC regressions.
Cases include native small exports with zero/one commitment, every truncated
prefix, substituted shared parameters/VK, malicious counts/domain/masks, budgets,
metadata/CS pins, trailing/tampered bytes, special files and CLI errors without
success output. A deliberately invalid PK vector point can pass framing and
must retain the false cryptographic scope flags. Offline vet, gofmt and Bash
syntax checks passed. The actual wrapper and pnpm commands used the files above;
no game keys or proofs were generated. [Procedure and limits](../../../proposals/hidden-v2-pk-structure-check.md).
