#!/usr/bin/env bash
# Writes a manifest from the template.
# Usage: manifest.sh <network> <game address> <start block> [output, default subgraph.yaml]
set -euo pipefail
cd "$(dirname "$0")/.."
sed -e "s/{{network}}/$1/" -e "s/{{address}}/$2/" -e "s/{{startBlock}}/$3/" \
  subgraph.template.yaml > "${4:-subgraph.yaml}"
