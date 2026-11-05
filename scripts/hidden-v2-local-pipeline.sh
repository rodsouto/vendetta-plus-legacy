#!/usr/bin/env bash
# Local capacity only, new external artifacts; no production ceremony approval.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/vendetta-local-pipeline-bin.XXXXXXXX")"
trap 'rm -rf -- "$work"' EXIT
export GOPROXY=off
export GOFLAGS=-mod=readonly
"${VENDETTA_GO_BIN:-go}" -C "$root/apps/web/scripts/experiments/opening-zk" build \
  -trimpath -buildvcs=false -o "$work/pipeline" ./cmd/mpc-local-pipeline
"$work/pipeline" "$@"
