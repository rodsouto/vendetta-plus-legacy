#!/usr/bin/env bash
# Local development: anvil + deploy + indexer (graph-node in Docker, B-18) + keeper (B-22) + web app.
# Usage: pnpm dev:local. Anvil's well-known development keys are used; account 0 deploys and is the
# admin. Without Docker the app runs without the indexer (the ranking says it is unavailable).
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
port="${ANVIL_PORT:-8545}"
rpc="http://127.0.0.1:${port}"
key0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

indexer_port="${INDEXER_PORT:-8500}"
indexer_sh="$root/packages/indexer/scripts/local.sh"

# Listens on 0.0.0.0 so graph-node reaches it from its container.
anvil --host 0.0.0.0 --port "$port" --silent &
anvil_pid=$!
trap 'kill $anvil_pid 2>/dev/null || true; bash "$indexer_sh" down "$indexer_port"' EXIT
for _ in $(seq 1 50); do
  cast block-number --rpc-url "$rpc" >/dev/null 2>&1 && break
  sleep 0.2
done

cd "$root/contracts"
forge script script/Deploy.s.sol --rpc-url "$rpc" --private-key "$key0" --broadcast >/dev/null
game="$(jq -r '[.transactions[] | select(.contractName == "ERC1967Proxy")][0].contractAddress' \
  broadcast/Deploy.s.sol/31337/run-latest.json)"
directory="$(jq -r '[.transactions[] | select(.contractName == "PasskeyDirectory")][0].contractAddress' \
  broadcast/Deploy.s.sol/31337/run-latest.json)"
block="$(cast block-number --rpc-url "$rpc")"
echo "Game deployed at $game (anvil $rpc)"
indexer=""
if docker info >/dev/null 2>&1; then
  indexer="$(bash "$indexer_sh" up "$indexer_port" "$port" "$game" "$block" | tail -n 1)"
  echo "Indexer at $indexer"
else
  echo "Docker is not available: running without the indexer"
fi
cat > "$root/apps/web/public/deployment.local.json" <<JSON
{ "chainId": 31337, "rpc": "$rpc", "game": "$game", "directory": "$directory", "fromBlock": $block, "indexer": "$indexer" }
JSON

cd "$root"
# Reveals hidden missions when they arrive and processes due ones (B-22); account 9 pays.
pnpm --filter @vendetta/web keeper public/deployment.local.json local &
keeper_pid=$!
trap 'kill $anvil_pid $keeper_pid 2>/dev/null || true; bash "$indexer_sh" down "$indexer_port"' EXIT
pnpm --filter @vendetta/web dev
