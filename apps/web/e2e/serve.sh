#!/usr/bin/env bash
# A fresh chain, keeper and app for one e2e run, isolated from `pnpm dev:local` (own anvil and Vite
# ports, deployment passed through VITE_DEPLOYMENT instead of public/).
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
rpc="http://127.0.0.1:8555"
key0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
anvil --port 8555 --silent &
trap 'kill %1 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do cast block-number --rpc-url "$rpc" >/dev/null 2>&1 && break; sleep 0.2; done
cd "$root/contracts"
forge script script/Deploy.s.sol --rpc-url "$rpc" --private-key "$key0" --broadcast >/dev/null
game="$(jq -r '[.transactions[] | select(.contractName == "ERC1967Proxy")][0].contractAddress' broadcast/Deploy.s.sol/31337/run-latest.json)"
directory="$(jq -r '[.transactions[] | select(.contractName == "PasskeyDirectory")][0].contractAddress' broadcast/Deploy.s.sol/31337/run-latest.json)"
export VITE_DEPLOYMENT="{\"chainId\":31337,\"rpc\":\"$rpc\",\"game\":\"$game\",\"directory\":\"$directory\",\"fromBlock\":0}"
cd "$root/apps/web"
# The keeper reveals hidden missions as they arrive and processes due ones (B-22), as on a real
# deployment.
deployment="$(mktemp)"
echo "$VITE_DEPLOYMENT" > "$deployment"
npx tsx scripts/keeper.ts "$deployment" local &
trap 'kill %1 %2 2>/dev/null || true' EXIT
npx vite --port 5199 --strictPort
