#!/usr/bin/env bash
# Deploys the subgraph of deployments/gnosis.json to Goldsky (B-18). Needs the Goldsky CLI,
# logged in (`curl https://goldsky.com | sh`, then `goldsky login` with an API key).
# Usage: pnpm --filter @vendetta/indexer deploy:goldsky <version, e.g. 1.0.0>
set -euo pipefail
cd "$(dirname "$0")/.."
root="$(git rev-parse --show-toplevel)"
deployment="$root/deployments/gnosis.json"
version="${1:?usage: deploy-goldsky.sh <version, e.g. 1.0.0>}"
[ -f "$deployment" ] || { echo "No deployments/gnosis.json: deploy the contracts first." >&2; exit 1; }
[[ "$(jq -r .chainId "$deployment")" == 100 ]] || { echo "Expected Gnosis chain ID 100" >&2; exit 1; }
command -v goldsky >/dev/null || { echo "Goldsky CLI not found: curl https://goldsky.com | sh" >&2; exit 1; }

(cd "$root/contracts" && forge build >/dev/null)
bash scripts/manifest.sh gnosis "$(jq -r .game "$deployment")" "$(jq -r .fromBlock "$deployment")"
pnpm exec graph codegen
pnpm exec graph build
goldsky subgraph deploy "vendetta/$version" --path build
# A tag keeps the URL fixed across versions.
goldsky subgraph tag create "vendetta/$version" --tag prod
echo
echo "The market history and the battle reports are served at the GraphQL endpoint of vendetta/prod"
echo "(goldsky subgraph list): put it in .env as VITE_INDEXER_URL."
