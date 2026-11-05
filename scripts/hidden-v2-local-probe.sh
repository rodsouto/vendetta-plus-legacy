#!/usr/bin/env bash
# Dedicated local native initialization probe. No contributions or game keys.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/vendetta-local-probe-bin.XXXXXXXX")"
trap 'rm -rf -- "$work"' EXIT
export GOPROXY=off
export GOFLAGS=-mod=readonly
"${VENDETTA_GO_BIN:-go}" -C "$root/apps/web/scripts/experiments/opening-zk" build \
  -trimpath -buildvcs=false -o "$work/mpc-local-probe" ./cmd/mpc-local-probe
"$work/mpc-local-probe" run "$@"
