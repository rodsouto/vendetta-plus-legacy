No P1 findings or authorization bypass found. Two operational issues remain:

1. **P2 — Production deployment accepts a zero admin and can permanently disable every privileged function.** [Deploy.s.sol:19](/home/rodrigo/orca-projects/vendetta-plus-legacy/contracts/script/Deploy.s.sol:19), [Roles.sol:17](/home/rodrigo/orca-projects/vendetta-plus-legacy/contracts/src/core/Roles.sol:17)

   Concrete scenario: `.env` contains `ADMIN=0x0000000000000000000000000000000000000000`, with operator and arbiter blank. The shell treats this as configured; deployment defaults all three roles to zero. Initialization succeeds, simulation succeeds, and the deployment is recorded. Nobody can upgrade, assign roles, grant premium or suspend players; initialization cannot recover them.

   The previous `__Ownable_init` rejected zero ownership. Preserve intentional freezing through `setRole`, but reject a zero initial admin in the production deployment flow. This safeguard can live in the script without increasing Game bytecode.

2. **P3 — Local tooling still assumes account 0 holds every operational role.** [Dev.tsx:16](/home/rodrigo/orca-projects/vendetta-plus-legacy/apps/web/src/pages/Dev.tsx:16), [benchmark-gas.ts:65](/home/rodrigo/orca-projects/vendetta-plus-legacy/apps/web/scripts/benchmark-gas.ts:65)

   Concrete scenario: run the benchmark with an exported `OPERATOR` pointing to another account. The benchmark overrides `ADMIN` but inherits `OPERATOR` and `ARBITER`; deployment honors them. Its later `setGlobalPremium` transaction from account 0 reverts with `NotAllowed`, aborting the benchmark.

   The Workshop similarly sends premium and suspension calls through account 0, so those controls fail after configuring or transferring operational roles. Defaults work correctly. The benchmark should explicitly fix all three roles to its dev account; the Workshop should either support distinct holders or document its unified-role requirement.

What I checked and found correct:

- **Authorization:** wrappers pass `msg.sender`; library checks use the correct role. Admin has no implicit operator/arbiter authorization, though it can assign those roles to itself before freezing.
- **Proposals:** only the current holder proposes; only the proposed account accepts. Both acceptance and administrative assignment clear the proposal. Replacing a compromised holder invalidates its proposed successor.
- **Freeze:** clearing the admin role also clears its pending proposal. A previously proposed admin therefore cannot restore administration afterward. Operator and arbiter handovers continue independently.
- **Zero addresses:** proposing zero cancels a proposal. Setting an operational role to zero disables it; recovery requires an active admin. After freezing, that loss is permanent. No nonzero caller can accept an empty proposal.
- **Unknown role IDs:** IDs outside 1–3 can be assigned and transferred, but confer no privileged powers. Unassigned IDs cannot be claimed by ordinary callers. This is permissive behavior, not an escalation.
- **Initialization/UUPS:** implementation initialization remains disabled; proxy initialization is one-shot and occurs atomically during deployment. UUPS authorization precedes implementation replacement and migration execution. No alternate implementation-write path or exposed caller-spoofing/delegatecall route was found.
- **Consumers:** no remaining Game `owner()`, ownership-transfer or freeze-function calls were found in the inspected app, scripts, keeper, indexer or e2e sources. Remaining player/building “owner” references are unrelated.
- **Deployment/docs:** blank-variable handling and role defaults agree with the docs. ABI generation includes Roles, and the committed ABI has the new initializer and role functions. Scenario replay selects operator/arbiter appropriately.
- **Size:** cached deployed Game bytecode is **23,989 bytes**, leaving **587 bytes**.

Useful remaining regression cases: a pending admin proposal followed by freeze and attempted acceptance; proposal replacement followed by stale acceptance; and deployment with all three roles sharing one address. The current code handles these correctly by inspection.

The Node layout fixtures and `git diff --check` passed. I did not run Forge because it writes build/cache files. No files were modified.