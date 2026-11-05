#!/usr/bin/env bash
# Bounded native phase-1 samples only; never generates game setup keys.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/vendetta-mpc-capacity-bin.XXXXXXXX")"
trap 'rm -rf -- "$work"' EXIT
export GOPROXY=off
export GOFLAGS=-mod=readonly
"${VENDETTA_GO_BIN:-go}" -C "$root/apps/web/scripts/experiments/opening-zk" build \
  -trimpath -buildvcs=false -o "$work/mpc-capacity" ./cmd/mpc-capacity
"$work/mpc-capacity" run "$@"
