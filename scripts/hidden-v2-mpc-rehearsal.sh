#!/usr/bin/env bash
# Unsafe small-circuit rehearsal only. Builds offline from the pinned module.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/vendetta-mpc-rehearsal-bin.XXXXXXXX")"
trap 'rm -rf -- "$work"' EXIT
export GOPROXY=off
export GOFLAGS=-mod=readonly
"${VENDETTA_GO_BIN:-go}" -C "$root/apps/web/scripts/experiments/opening-zk" build \
  -trimpath -buildvcs=false -o "$work/mpc-rehearsal" ./cmd/mpc-rehearsal
"$work/mpc-rehearsal" run "$@"
