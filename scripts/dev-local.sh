#!/usr/bin/env bash
# Local development: anvil + deploy + web app. Usage: pnpm dev:local
# Anvil's well-known development keys are used; account 0 deploys and is the admin.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
port="${ANVIL_PORT:-8545}"
rpc="http://127.0.0.1:${port}"
key0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

anvil --port "$port" --silent &
anvil_pid=$!
trap 'kill $anvil_pid 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do
  cast block-number --rpc-url "$rpc" >/dev/null 2>&1 && break
  sleep 0.2
done

cd "$root/contracts"
forge script script/Deploy.s.sol --rpc-url "$rpc" --private-key "$key0" --broadcast >/dev/null
game="$(jq -r '[.transactions[] | select(.contractName == "ERC1967Proxy")][0].contractAddress' \
  broadcast/Deploy.s.sol/31337/run-latest.json)"
block="$(cast block-number --rpc-url "$rpc")"
cat > "$root/apps/web/public/deployment.local.json" <<JSON
{ "chainId": 31337, "rpc": "$rpc", "game": "$game", "fromBlock": $block }
JSON
echo "Game deployed at $game (anvil $rpc)"

cd "$root"
pnpm --filter @vendetta/web dev
