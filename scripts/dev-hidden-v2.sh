#!/usr/bin/env bash
set -euo pipefail
vendetta_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$vendetta_root"
# Execute Node directly so terminal signals reach the lifecycle handler and its
# exit status survives; pnpm 9's lifecycle SIGINT handler can return zero.
exec node --import "$vendetta_root/apps/web/node_modules/tsx/dist/loader.mjs" \
  "$vendetta_root/apps/web/scripts/local-hidden.ts" "$@"
