#!/usr/bin/env bash
# Local development: anvil + deploy + indexer (graph-node in Docker, B-18) + keeper (B-22) + web app.
# Usage: pnpm dev:local. Anvil's well-known development keys are used; account 0 deploys and is the
# admin. The indexer serves the market history and the battle reports over GraphQL; the app reads
# the reports from it (VITE_INDEXER_URL). Without Docker it is skipped and the app reads the logs.
set -euo pipefail

if [[ -n "${HIDDEN_PROVER_URL:-}" ]]; then
  : "${HIDDEN_PROVER_TOKEN:?Set HIDDEN_PROVER_TOKEN for the certificate service}"
fi

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
# Local chain: every role is account 0, which the Workshop signs with (B-17); exported
# ADMIN/OPERATOR/ARBITER are for real deploys.
env -u ADMIN -u OPERATOR -u ARBITER \
  forge script script/DeployTest.s.sol --rpc-url "$rpc" --private-key "$key0" --broadcast >/dev/null
game="$(jq -r '[.transactions[] | select(.contractName == "ERC1967Proxy")][0].contractAddress' \
  broadcast/DeployTest.s.sol/31337/run-latest.json)"
directory="$(jq -r '[.transactions[] | select(.contractName == "PasskeyDirectory")][0].contractAddress' \
  broadcast/DeployTest.s.sol/31337/run-latest.json)"
block="$(cast block-number --rpc-url "$rpc")"
echo "Game deployed at $game (anvil $rpc)"
# The reports come from the logs unless the indexer runs, whatever the root .env names.
export VITE_INDEXER_URL=""
if docker info >/dev/null 2>&1; then
  indexer="$(bash "$indexer_sh" up "$indexer_port" "$port" "$game" "$block" | tail -n 1)"
  echo "Indexer (market history, battle reports) at $indexer"
  export VITE_INDEXER_URL="$indexer"
else
  echo "Docker is not available: running without the indexer"
fi
cat > "$root/apps/web/public/deployment.local.json" <<JSON
{ "chainId": 31337, "rpc": "$rpc", "game": "$game", "directory": "$directory", "fromBlock": $block }
JSON

cd "$root"
# Test consumers use the same v2 packet/receipt API. A certificate provider is explicit.
keeper_pid=""
keeper_state=""
if [[ -n "${HIDDEN_PROVER_URL:-}" ]]; then
  keeper_state="$(mktemp -d)"
  (
    cd "$root/apps/web"
    export KEEPER_STATE_DIR="$keeper_state"
    export RPC_URL="$rpc"
    export KEEPER_PRIVATE_KEY="${KEEPER_PRIVATE_KEY:-0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6}"
    exec node --import tsx scripts/keeper.ts public/deployment.local.json
  ) &
  keeper_pid=$!
else
  echo "V2 test world: no certificate provider configured; hidden missions wait for evidence."
fi
node scripts/local-clock.mjs "$rpc" &
clock_pid=$!
trap 'kill $anvil_pid $keeper_pid $clock_pid 2>/dev/null || true; bash "$indexer_sh" down "$indexer_port"; if [[ -n "$keeper_state" ]]; then rm -rf -- "$keeper_state"; fi' EXIT
pnpm --filter @vendetta/web dev
