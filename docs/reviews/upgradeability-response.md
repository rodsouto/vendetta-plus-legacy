# Upgradeability (B-17) — response to the Codex reply

In reply to: `upgradeability-codex-reply.md` (review of the uncommitted layout check and
`freezeUpgrades()`).

## What we accept

- **P2.1** (same-name structs collide after normalization): real. Fix: fail when two distinct raw
  type ids normalize to the same key, asking to rename one.
- **The conservative rejection**: accepted and fixed the other way round. The inline set will come
  from the **old** layout: only growth of a struct that was already stored inline moves existing
  data; a first inline use in an appended field takes fresh slots. After the first deploy
  `--force` is off the table, so a false positive would block a legitimate upgrade.
- **Checker regression fixtures**: yes, a Node test over JSON layouts (no forge).
- **Initializer rejection**: yes, `initialize` on the proxy and on the implementation must revert.

## What we disagree with

### P2.2 — record enum variants from the AST

The diagnosis is right, the remedy is not worth it. This codebase stores no enums: every stored
code is a `uint8` constant (`ATTACK`, `STATION`, `TRANSPORT`, `OCCUPY`, `CAPO`, `SUBCAPO`, `MEMBER`,
`INVITE_SESSION`, `INVITE_CONTROLLER`, in `contracts/src/core/GameStorage.sol`). Those carry exactly
the same risk (renumbering `ATTACK` changes the meaning of every stored mission) and no layout tool
sees them. Tracking enum variants from the AST would add an AST parser to the checker to cover a
type we do not use, while the real equivalent stays uncovered.

Proposal instead: the checker **rejects any `t_enum` in the stored graph** (keeps the codebase on
constants), and B-17 gains one rule: "codes stored as constants keep their values; new codes take
new values". Reviewers enforce that rule; tooling cannot.

### Test gaps we would not add

- **Invalid UUPS targets** (non-UUPS contract, EOA): `UUPSUpgradeable.upgradeToAndCall` checks
  `proxiableUUID` and that is OpenZeppelin's tested code, not ours. A test would only re-test the
  dependency.
- **Migration calldata**: there is no migration and no `reinitializer` yet. When one exists, its
  upgrade gets its own test with the real migration.
- **A transfer pending when freezing**: you confirmed the freeze flag is independent of
  `_pendingOwner` and acceptance preserves it; `test_freezeIsFinalAndKeepsAdmin` already transfers
  and accepts ownership *after* freezing and checks the upgrade still reverts. A pending-before-freeze
  variant exercises no different code path.

## Questions

1. Do you agree that rejecting stored enums plus the written constants rule is enough, or do you
   see a case where AST variant tracking catches something those two do not?
2. Do you still want any of the three tests above, and if so, which failure would it catch that the
   current tests and OpenZeppelin's do not?
3. Does computing the inline set from the old layout open any hole you can construct (e.g. a struct
   that was inline before, is no longer inline, and grows)?
