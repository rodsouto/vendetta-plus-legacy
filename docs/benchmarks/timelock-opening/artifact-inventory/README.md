# Offline inventory of completed unsafe local exports

On 2026-11-05 the read-only inventory tool checked the six existing export files
for each circuit. These are byte-integrity results, not new MPC/proving runs,
native key validation, independent review or production approval.

| Circuit       | Bytes checked | Manifest SHA-256                                                 | Receipt SHA-256                                                  |
| ------------- | ------------: | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| opening       | 1,556,506,446 | e1c210611c3c110ff45027f7fc7f2459c2b065ee3ffcb3a1b9ed38a4dfcc1455 | 12d13e25808ac946278b14dfce0d6c78ad39a55439dd251662d0fff322b261fc |
| invalid-point | 1,071,059,209 | c4798b4f3ddc81c535c680a420b437fec9107ea007bc5c39c9504ff86a13a2c8 | dcf669308831f5dd9595c6cedc8e14709df734deb535b07fde17d4cccecb115e |

Raw reports `opening.json` and `invalid-point.json` preserve the CLI output bytes.
The original exports remain at:

- `/home/rodrigo/.cache/vendetta-audit/local-mpc-staged-sequence-20261105-run3/23-phase2-keys/public/`
- `/home/rodrigo/.cache/vendetta-audit/local-mpc-sequence-20261104-run2/22-phase2-keys/public/`

Execution selected a 2,147,483,648-byte budget per export. No native decoding,
transcript processing, compilation, setup or proving was performed. Pins here
are inventory identifiers from local evidence, not an external trust authority.
The same known CS hashes, manifests and key bytes were used by the completed
[three-proof Game/H3 replay](../local-mpc-staged/README.md).

Eight Python tests exercise synthetic exports, all four substituted body files,
wrong pins/scope/counts, extra fields/files, duplicate/deep/non-finite JSON,
pre-read budget rejection, FIFO/symlinks/empty files, replacement of a directory
entry and CLI failure without success output. Separately, all 15 producer setup
policy tests and both DeployPolicy Solidity tests passed. Production barriers
remain active. See the [procedure and limits](../../../proposals/hidden-v2-artifact-inventory.md).
