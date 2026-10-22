#!/usr/bin/env bash
# Deploys the game to Arbitrum One and writes deployments/arbitrum.json (to commit).
# Usage: pnpm deploy:arbitrum [--yes]      Reads .env at the repo root (see .env.example and
# docs/deploy-arbitrum.md). Simulates first, shows the cost and asks before spending real ETH.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
out="$root/deployments/arbitrum.json"
public_rpc="https://arb1.arbitrum.io/rpc"
yes="${1:-}"

[[ -f "$root/.env" ]] || { echo "Missing .env: cp .env.example .env and fill it in" >&2; exit 1; }
set -a
# shellcheck disable=SC1091
source "$root/.env"
set +a
# An unfilled line (NAME=) counts as unset; forge would fail parsing it.
for v in DEPLOYER_PRIVATE_KEY ADMIN KEEPER HIDDEN_BOND ARBITRUM_RPC_URL ETHERSCAN_API_KEY; do
  [[ -n "${!v:-}" ]] || unset "$v"
done
[[ -n "${DEPLOYER_PRIVATE_KEY:-}" ]] || { echo "DEPLOYER_PRIVATE_KEY is empty in .env" >&2; exit 1; }
[[ "$DEPLOYER_PRIVATE_KEY" == 0x* ]] || DEPLOYER_PRIVATE_KEY="0x$DEPLOYER_PRIVATE_KEY"
export DEPLOYER_PRIVATE_KEY
rpc="${ARBITRUM_RPC_URL:-$public_rpc}"

if [[ -e "$out" ]]; then
  echo "$out already exists: the game is deployed. Upgrades go through the admin (B-17)." >&2
  exit 1
fi
chain="$(cast chain-id --rpc-url "$rpc")"
[[ "$chain" == 42161 ]] || { echo "RPC is chain $chain, not Arbitrum One (42161)" >&2; exit 1; }
if [[ -n "$(git -C "$root" status --porcelain -- contracts)" ]]; then
  echo "contracts/ has uncommitted changes: deploy from a commit" >&2
  exit 1
fi

deployer="$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")"
balance="$(cast balance "$deployer" --rpc-url "$rpc" --ether)"
echo "Deployer: $deployer ($balance ETH)"
echo "Admin:    ${ADMIN:-$deployer (the deployer)}"
echo "Keeper:   ${KEEPER:-none}"
echo "Bond:     ${HIDDEN_BOND:-configured default}"
echo "Commit:   $(git -C "$root" rev-parse --short HEAD)"

cd "$root/contracts"
echo "Simulating..."
forge script script/Deploy.s.sol --rpc-url "$rpc" 2>&1 | grep -E "Estimated|Game proxy|PasskeyDirectory"

if [[ "$yes" != "--yes" ]]; then
  read -r -p "Deploy to Arbitrum One with real ETH? Type 'deploy': " answer
  [[ "$answer" == deploy ]] || { echo "Cancelled"; exit 1; }
fi

verify=()
if [[ -n "${ETHERSCAN_API_KEY:-}" ]]; then verify=(--verify); else echo "No ETHERSCAN_API_KEY: not verifying"; fi
forge script script/Deploy.s.sol --rpc-url "$rpc" --broadcast --slow "${verify[@]}"

run="broadcast/Deploy.s.sol/42161/run-latest.json"
game="$(jq -r '[.transactions[] | select(.contractName == "ERC1967Proxy")][0].contractAddress' "$run")"
directory="$(jq -r '[.transactions[] | select(.contractName == "PasskeyDirectory")][0].contractAddress' "$run")"
# Arbitrum block of the first receipt (block.number inside the EVM is L1's; receipts carry L2's).
from_block="$(jq -r '.receipts[0].blockNumber' "$run")"
from_block="$((from_block))" # hex (0x...) or decimal
[[ "$(cast code "$game" --rpc-url "$rpc")" != 0x ]] || { echo "No code at $game" >&2; exit 1; }

mkdir -p "$root/deployments"
# The committed rpc is the public one: ARBITRUM_RPC_URL may carry a provider key.
cat > "$out" <<JSON
{
  "chainId": 42161,
  "rpc": "$public_rpc",
  "game": "$(cast to-check-sum-address "$game")",
  "directory": "$(cast to-check-sum-address "$directory")",
  "fromBlock": $from_block,
  "commit": "$(git -C "$root" rev-parse HEAD)"
}
JSON
echo "Wrote $out:"
cat "$out"
echo "Commit it, then build the web app: pnpm build:arbitrum"
