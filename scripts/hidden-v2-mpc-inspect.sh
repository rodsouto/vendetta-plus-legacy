#!/usr/bin/env bash
# Streaming framing/hash checks only. No curve validation, setup or MPC.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
caller="${INIT_CWD:-$PWD}"
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  case "${args[i]}" in
    --shape|-shape|--transcript|-transcript)
      next=$((i + 1))
      if ((next < ${#args[@]})) && [[ -n "${args[next]}" && "${args[next]}" != /* ]]; then
        args[next]="$caller/${args[next]}"
      fi
      ;;
    --shape=*|-shape=*|--transcript=*|-transcript=*)
      value="${args[i]#*=}"
      if [[ -n "$value" && "$value" != /* ]]; then
        args[i]="${args[i]%%=*}=$caller/$value"
      fi
      ;;
  esac
done
work="$(mktemp -d "${TMPDIR:-/tmp}/vendetta-mpc-inspect-bin.XXXXXXXX")"
trap 'rm -rf -- "$work"' EXIT
export GOPROXY=off
export GOFLAGS=-mod=readonly
"${VENDETTA_GO_BIN:-go}" -C "$root/apps/web/scripts/experiments/opening-zk" build \
  -trimpath -buildvcs=false -o "$work/mpc-inspect" ./cmd/mpc-inspect
"$work/mpc-inspect" "${args[@]}"
