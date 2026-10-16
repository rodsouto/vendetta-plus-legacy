#!/usr/bin/env bash
# A local graph-node (Docker) indexing a local anvil, with the subgraph deployed.
#   local.sh up <base port> <anvil port> <game address> <start block>
#     GraphQL on <base>, IPFS on <base>+1, admin on <base>+20 (all on 127.0.0.1). Prints the
#     GraphQL URL of the subgraph on the last line. Anvil must listen on 0.0.0.0 (graph-node
#     reaches it from its container through host.docker.internal).
#   local.sh down <base port>
set -euo pipefail
cd "$(dirname "$0")/.."
cmd="$1"
base="$2"
export GRAPH_PORT="$base" IPFS_PORT=$((base + 1)) ADMIN_PORT=$((base + 20))
compose=(docker compose -p "vendetta-graph-$base" -f docker-compose.yml)

if [ "$cmd" = down ]; then
  RPC_PORT=0 "${compose[@]}" down --volumes --timeout 2 >/dev/null 2>&1 || true
  exit 0
fi

export RPC_PORT="$3"
game="$4"
block="$5"
"${compose[@]}" down --volumes --timeout 2 >/dev/null 2>&1 || true
"${compose[@]}" up -d --quiet-pull >/dev/null 2>&1
for _ in $(seq 1 120); do
  curl -sf -o /dev/null -X POST -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"subgraph_list","params":{}}' \
    "http://127.0.0.1:$ADMIN_PORT" && break
  sleep 0.5
done

manifest="subgraph.local-$base.yaml"
bash scripts/manifest.sh anvil "$game" "$block" "$manifest"
graph=(pnpm exec graph)
"${graph[@]}" codegen "$manifest" >/dev/null 2>&1
"${graph[@]}" create --node "http://127.0.0.1:$ADMIN_PORT" vendetta >/dev/null 2>&1
"${graph[@]}" deploy vendetta "$manifest" --node "http://127.0.0.1:$ADMIN_PORT" \
  --ipfs "http://127.0.0.1:$IPFS_PORT" --version-label local --output-dir "build/local-$base" \
  >/dev/null 2>&1
echo "http://127.0.0.1:$GRAPH_PORT/subgraphs/name/vendetta"
