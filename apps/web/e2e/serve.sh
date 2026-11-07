#!/usr/bin/env bash
# Explicit mock-consumer browser fixture. No real producer, MPC or Groth16 proving.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
rpc_port="${VENDETTA_E2E_RPC_PORT:-8555}"
web_port="${VENDETTA_E2E_WEB_PORT:-5199}"
for port in "$rpc_port" "$web_port"; do
  [[ "$port" =~ ^[0-9]{4,5}$ ]] && ((10#$port >= 1024 && 10#$port <= 65535)) || { echo "Invalid E2E port" >&2; exit 1; }
done
[[ "$rpc_port" != "$web_port" ]] || { echo "E2E ports must differ" >&2; exit 1; }
rpc="http://127.0.0.1:${rpc_port}"
key0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
if [[ -n "${VENDETTA_E2E_RUN_DIR:-}" ]]; then
  [[ "$VENDETTA_E2E_RUN_DIR" == /* ]] || { echo "VENDETTA_E2E_RUN_DIR must be absolute" >&2; exit 1; }
  work="$VENDETTA_E2E_RUN_DIR"
  mkdir -m 700 -- "$work"
else
  work="$(mktemp -d)"
fi
anvil_pid=""
web_pid=""
cleanup() {
  if [[ -n "$web_pid" ]]; then kill "$web_pid" 2>/dev/null || true; wait "$web_pid" 2>/dev/null || true; fi
  if [[ -n "$anvil_pid" ]]; then kill "$anvil_pid" 2>/dev/null || true; wait "$anvil_pid" 2>/dev/null || true; fi
  if [[ -z "${VENDETTA_E2E_RUN_DIR:-}" || "${VENDETTA_E2E_EPHEMERAL:-0}" == 1 ]]; then rm -rf -- "$work"; fi
}
trap cleanup EXIT
trap 'exit 0' TERM INT
# Refuse an existing listener before sending any deployment transactions.
node --input-type=module -e 'import { createServer } from "node:net"; const s=createServer(); s.on("error",e=>{console.error(e.message);process.exitCode=1;});s.listen(Number(process.argv[1]),"127.0.0.1",()=>s.close());' "$rpc_port"
anvil --host 127.0.0.1 --port "$rpc_port" --silent > "$work/anvil.log" 2>&1 &
anvil_pid=$!
ready=0
for _ in $(seq 1 50); do
  kill -0 "$anvil_pid" 2>/dev/null || { cat "$work/anvil.log" >&2; exit 1; }
  if cast block-number --rpc-url "$rpc" >/dev/null 2>&1; then ready=1; break; fi
  sleep 0.2
done
[[ "$ready" == 1 ]] || { echo "E2E Anvil startup timed out" >&2; exit 1; }
cd "$root/contracts"
# Keep all fixture compiler outputs and broadcast receipts separate from other runs.
env -u ADMIN -u OPERATOR -u ARBITER -u DEPLOYER_PRIVATE_KEY \
  FOUNDRY_PROFILE=default FOUNDRY_OUT="$work/out" FOUNDRY_CACHE_PATH="$work/cache" FOUNDRY_BROADCAST="$work/broadcast" \
  forge script script/DeployTest.s.sol --rpc-url "$rpc" --private-key "$key0" --broadcast > "$work/deploy.log" 2>&1
game="$(jq -r '[.transactions[] | select(.contractName == "ERC1967Proxy")][0].contractAddress' "$work/broadcast/DeployTest.s.sol/31337/run-latest.json")"
directory="$(jq -r '[.transactions[] | select(.contractName == "PasskeyDirectory")][0].contractAddress' "$work/broadcast/DeployTest.s.sol/31337/run-latest.json")"
export VITE_INDEXER_URL=""
export VITE_NETWORK="local"
export VITE_DEPLOYMENT="{\"chainId\":31337,\"rpc\":\"$rpc\",\"game\":\"$game\",\"directory\":\"$directory\",\"fromBlock\":0}"
cd "$root/apps/web"
# test-evidence.ts supplies trusted mock certificates, never authentic future beacons.
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port "$web_port" --strictPort &
web_pid=$!
wait "$web_pid"
