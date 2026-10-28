No P1/P2/P3 findings in the scoped vacation/premium changes.

Checked and found correct:

- TS and Solidity select **7 days / 14-day cooldown** without premium and **30 days / 7-day cooldown** with premium, using premium status at the new start.
- Own and global premium use strict `until > now`: expiry at the exact start second means expired, unless the other premium source remains active.
- Vacation ends stay fixed after premium expires. First vacations bypass cooldown; early returns reset its origin to the actual return time. Restart is allowed exactly at the cooldown boundary.
- Trade locks remain inclusive (`now <= tradeLockUntil`). `vacationStart` and `vacationSeq` remain aligned between implementations, preserving B-22’s same-second ordering and hidden-mission bounce checks.
- The timestamp arithmetic introduces no new narrowing issue at realistic timestamps. Solidity’s existing `uint40` horizon remains a theoretical TS/Solidity limitation.
- Generated scenarios contain **124 successful vacation starts**: **112 lasting 30 days** and **12 lasting 7 days**, covering both global and own premium. They also contain **113 successful early returns**.
- All snapshot `TYPES` names and field orders match their Solidity structs and sorted JSON keys. The camelCase rename introduces no field-order mismatch.
- Config, code generation, and consumers use the new tuple shape consistently; no remaining scalar consumers were found.
- `Account.tsx` computes cooldown dates and cooldown/trade disabling with the simulator’s predicates.
- Remaining 15-day/7-day references in the chapter and legacy config are explicitly legacy references. No stale current-rule claim was found in the reviewed web content.

Read-only review; no tracked files changed. I did not rerun the reported passing suite or run Playwright.