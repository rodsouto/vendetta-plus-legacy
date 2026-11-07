# Native VK to Solidity export checks

On 2026-11-05 both completed experimental VKs passed checked native decoding,
canonical reserialization and byte-exact default Solidity export. Input files
were only read; export went directly to SHA-256. No game keys were created,
no CS/PK/transcript was loaded and no MPC, proof or EVM deployment was run.

| Circuit       | VK bytes | Solidity bytes | Public inputs | Commitments |
| ------------- | -------: | -------------: | ------------: | ----------: |
| opening       |    2,256 |         64,723 |            55 |           1 |
| invalid-point |      560 |         32,722 |             2 |           1 |

`opening.json` preserves the direct wrapper stdout. `invalid-point.json` is the
unchanged JSON output line extracted from pnpm stdout; its surrounding pnpm
command banner remains in the external `invalid-point-pnpm.txt`. Report hashes
and the source bundle pin are recorded in the external closure receipt under
`/home/rodrigo/.cache/vendetta-audit/hidden-v2-20261105-vk-export/`.

The VK/source pins are those already recorded in the
[export inventories](../artifact-inventory/README.md). Both reports leave circuit
binding, PK relation, MPC transcript verification, independent approval and
production approval false. Matching exports do not establish secure provenance.

Validation: 188 passing Go test/subtest events across six packages, including
30 in the new checker/CLI and 158 existing regression events. Offline vet and
Bash syntax checks passed. Framing-only fuzz ran for a 10-second target with two
workers: 6,117 evaluations, no failure. It does not fuzz native pairing/export
or establish a total memory bound. Source/byte budgets and worker limits are in
[the procedure](../../../proposals/hidden-v2-vk-export-check.md).
