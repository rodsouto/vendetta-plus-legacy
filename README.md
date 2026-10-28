vendetta-plus-legacy
====================

Original source code from www.vendetta-plus.com / www.space4k-plus.com, feel free to use it if you like

Local development: `pnpm dev:local` runs the game clock at **500x** speed, including
construction, research, training, production and missions. Use
`LOCAL_GAME_SPEED=1 pnpm dev:local` for normal speed, or set another positive integer.
The accelerated clock only runs on the local Anvil chain; game rules are unchanged.

To prepare a building for occupation, run:

```bash
pnpm prepare:occupation --account 1 --building 1
```

The account is a local development index (0–6) or a controller address. The building
must already belong to that account. The script resumes its current progress,
follows the economic milestones in the app's expansion guide, builds prerequisites,
waits for production by advancing time, and finishes with one occupation troop trained.
It does not launch an occupation mission. Re-running it after completion does nothing.
Time jumps affect **every account on the local chain**. Only Anvil chain 31337 is supported.
Use `--deployment <file>` to select a different local deployment (path relative to `apps/web`).
