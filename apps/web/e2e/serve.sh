#!/usr/bin/env bash
# A fresh chain, indexer and app for one e2e run, isolated from `pnpm dev:local` (own anvil, indexer
# and Vite ports, deployment passed through VITE_DEPLOYMENT instead of public/).
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
rpc="http://127.0.0.1:8555"
key0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
keeper=0xa0Ee7A142d267C1f36714E4a8F75612F20a79720 # anvil's account 9: listed as a keeper (B-22)
indexer_sh="$root/packages/indexer/scripts/local.sh"
anvil --host 0.0.0.0 --port 8555 --silent &
trap 'kill %1 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do cast block-number --rpc-url "$rpc" >/dev/null 2>&1 && break; sleep 0.2; done
cd "$root/contracts"
KEEPER="$keeper" HIDDEN_BOND=1000 forge script script/Deploy.s.sol --rpc-url "$rpc" --private-key "$key0" --broadcast >/dev/null
game="$(jq -r '[.transactions[] | select(.contractName == "ERC1967Proxy")][0].contractAddress' broadcast/Deploy.s.sol/31337/run-latest.json)"
directory="$(jq -r '[.transactions[] | select(.contractName == "PasskeyDirectory")][0].contractAddress' broadcast/Deploy.s.sol/31337/run-latest.json)"
# Stopped by e2e/teardown.ts.
indexer="$(bash "$indexer_sh" up 8600 8555 "$game" 0 | tail -n 1)"
export VITE_DEPLOYMENT="{\"chainId\":31337,\"rpc\":\"$rpc\",\"game\":\"$game\",\"directory\":\"$directory\",\"fromBlock\":0,\"indexer\":\"$indexer\"}"
cd "$root/apps/web"
# The keeper reveals hidden missions as they arrive (B-22) and settles stale points for the ranking
# (B-19, every 5 s here so the ranking e2e sees them), as on a real deployment.
deployment="$(mktemp)"
echo "$VITE_DEPLOYMENT" > "$deployment"
KEEPER_SETTLE_INTERVAL_MS=5000 npx tsx scripts/keeper.ts "$deployment" local &
trap 'kill %1 %2 2>/dev/null || true' EXIT
npx vite --port 5199 --strictPort
