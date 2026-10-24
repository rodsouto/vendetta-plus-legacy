#!/usr/bin/env bash
# Deploys the game to Gnosis Chain and writes deployments/gnosis.json (to commit).
# Usage: pnpm deploy:gnosis [--yes]      Reads .env at the repo root (see .env.example and
# docs/deploy-gnosis.md). Simulates first, shows the cost and asks before spending real xDAI.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
out="$root/deployments/gnosis.json"
public_rpc="https://rpc.gnosischain.com"
yes="${1:-}"

[[ -f "$root/.env" ]] || { echo "Missing .env: cp .env.example .env and fill it in" >&2; exit 1; }
set -a
# shellcheck disable=SC1091
source "$root/.env"
set +a
# An unfilled line (NAME=) counts as unset; forge would fail parsing it.
for v in DEPLOYER_PRIVATE_KEY ADMIN GNOSIS_RPC_URL; do
  [[ -n "${!v:-}" ]] || unset "$v"
done
[[ -n "${DEPLOYER_PRIVATE_KEY:-}" ]] || { echo "DEPLOYER_PRIVATE_KEY is empty in .env" >&2; exit 1; }
[[ "$DEPLOYER_PRIVATE_KEY" == 0x* ]] || DEPLOYER_PRIVATE_KEY="0x$DEPLOYER_PRIVATE_KEY"
export DEPLOYER_PRIVATE_KEY
rpc="${GNOSIS_RPC_URL:-$public_rpc}"

if [[ -e "$out" ]]; then
  echo "$out already exists: the game is deployed. Upgrades go through the admin (B-17)." >&2
  exit 1
fi
chain="$(cast chain-id --rpc-url "$rpc")"
[[ "$chain" == 100 ]] || { echo "RPC is chain $chain, not Gnosis Chain (100)" >&2; exit 1; }
for address in 0x0000000071727De22E5E9d8BAf0edAc6f37da032 0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419 0x7ab16Ff354AcB328452F1D445b3Ddee9a91e9e69 0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985; do
  [[ "$(cast code "$address" --rpc-url "$rpc")" != 0x ]] || { echo "Missing account contract at $address" >&2; exit 1; }
done
if [[ -n "$(git -C "$root" status --porcelain -- contracts)" ]]; then
  echo "contracts/ has uncommitted changes: deploy from a commit" >&2
  exit 1
fi

deployer="$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")"
balance="$(cast balance "$deployer" --rpc-url "$rpc" --ether)"
echo "Deployer: $deployer ($balance xDAI)"
echo "Admin:    ${ADMIN:-$deployer (the deployer)}"
echo "Commit:   $(git -C "$root" rev-parse --short HEAD)"

cd "$root/contracts"
echo "Simulating..."
forge script script/Deploy.s.sol --rpc-url "$rpc" 2>&1 | grep -E "Estimated|Game proxy|PasskeyDirectory"

if [[ "$yes" != "--yes" ]]; then
  read -r -p "Deploy to Gnosis Chain with real xDAI? Type 'deploy': " answer
  [[ "$answer" == deploy ]] || { echo "Cancelled"; exit 1; }
fi

forge script script/Deploy.s.sol --rpc-url "$rpc" --broadcast --slow

run="broadcast/Deploy.s.sol/100/run-latest.json"
game="$(jq -r '[.transactions[] | select(.contractName == "ERC1967Proxy")][0].contractAddress' "$run")"
directory="$(jq -r '[.transactions[] | select(.contractName == "PasskeyDirectory")][0].contractAddress' "$run")"
# First mined deployment block, including any linked libraries.
from_block="$(jq -r '.receipts[0].blockNumber' "$run")"
from_block="$((from_block))" # hex (0x...) or decimal
[[ "$(cast code "$game" --rpc-url "$rpc")" != 0x ]] || { echo "No code at $game" >&2; exit 1; }

mkdir -p "$root/deployments"
# The committed rpc is the public one: GNOSIS_RPC_URL may carry a provider key.
cat > "$out" <<JSON
{
  "chainId": 100,
  "rpc": "$public_rpc",
  "game": "$(cast to-check-sum-address "$game")",
  "directory": "$(cast to-check-sum-address "$directory")",
  "fromBlock": $from_block,
  "commit": "$(git -C "$root" rev-parse HEAD)"
}
JSON
echo "Wrote $out:"
cat "$out"
# Record the deployment before explorer verification, so an explorer outage cannot hide a
# successful broadcast and encourage an accidental second deployment.
if ! forge script script/Deploy.s.sol --rpc-url "$rpc" --resume --verify \
  --verifier blockscout --verifier-url https://gnosis.blockscout.com/api/; then
  echo "Explorer verification is incomplete. Deployment is recorded in $out; do not redeploy." >&2
fi
echo "Commit it, then build the web app: pnpm build:gnosis"
