**Verdict: I found no implementation blockers in the ephemeral scope, and nothing here needs recovery or the excluded cryptography.** Two quick checks remain before closing it. I reviewed only the pasted material and ran nothing. This paste didn't include `stack.ts`, `local-hidden.ts`, or `package.json`, and I haven't checked the file hashes.

## Remaining checks
1. **Documented start command:** `dev-hidden-v2.sh` bypasses pnpm so that the cancellation exit code survives, but the new CLI signal test launches Node directly. If the documented command is a `pnpm` script that calls this wrapper, pnpm still sits in front of it and could return 0 on SIGINT.
   - **Check:** confirm how `package.json` and the docs start the stack.
   - **If it goes through pnpm:** this is a real blocker. Document the wrapper as the only supported command, or send one SIGINT through the real entry point and assert exit code 1.
2. **Final tree:** the log shows 9 files and 75 tests, and the snapshot at the start of this session showed a dirty tree. If those 9 files are a focused subset, they don't stand in for the full gate.
   - **Check:** run `scripts/ci-local.sh`, then commit everything, including untracked files.
   - **Confirm:** the committed files must match the six pinned hashes. `dev-hidden-v2.sh` and `state-lease.ts` aren't pinned, so check them separately.

## Resolved
- **`forge` failure:** this is ruled out. `fail()` runs before `closed` resolves, and any non-zero exit, signal death, or spawn error counts as a failure unless shutdown has started.
- **Production gates:** all three fail closed. `setup.ts` rejects non-local use, `Deploy.s.sol` only runs on local chains, and `deploy-gnosis.sh` exits before doing any work.
- **Acceptance:** the results cover the selected scope, with 0 proofs, 0 certificate requests, and 0 owned processes left running.

## Optional test hardening
These are test-only and don't block the ephemeral scope:
- **Wrong-port test:** the fixture lets only one `check()` pass after Anvil starts. An extra `check()` before the first log read would make this test pass without testing the port. To rule that out, temporarily loosen the listener match to accept any port and confirm the test fails.
- **`runForge` coverage:** the new test covers `LocalProcesses`, not `runForge` itself. The behavior is correct, but a later `runForge` change could drop the failure handling unnoticed. A mock-level case where `script` fails after writing a valid broadcast would catch that.
- **CLI test timeout:** the resume-argument test sets a 15-second `spawnSync` timeout but no Vitest timeout. If `testTimeout` is still the 5-second default, Vitest's limit may apply first, so pass `20000` as the test's third argument.

## Out of scope
- **Local coverage:** this acceptance doesn't show that hidden missions work, because the keeper → producer → consumer path, native proving, and restart or reorg handling weren't run here. Those stay on the staging path.
- **Production:** it stays blocked until the owner resolves independent contributors versus their earlier "no external collaborators" position. The importer and approval bindings should wait for that decision, because it defines what they must enforce.

Once checks 1 and 2 pass, the ephemeral local work is complete.
