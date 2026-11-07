#!/usr/bin/env bash
# Bounded offline VK -> Solidity relation only; no setup, proving or approval.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
caller="${INIT_CWD:-$PWD}"
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  case "${args[i]}" in
    --vk|-vk|--solidity|-solidity)
      next=$((i + 1))
      if ((next < ${#args[@]})) && [[ -n "${args[next]}" && "${args[next]}" != /* ]]; then
        args[next]="$caller/${args[next]}"
      fi
      ;;
    --vk=*|-vk=*|--solidity=*|-solidity=*)
      value="${args[i]#*=}"
      if [[ -n "$value" && "$value" != /* ]]; then
        args[i]="${args[i]%%=*}=$caller/$value"
      fi
      ;;
  esac
done
work="$(mktemp -d "${TMPDIR:-/tmp}/vendetta-vk-export-bin.XXXXXXXX")"
trap 'rm -rf -- "$work"' EXIT
export GOPROXY=off GOFLAGS=-mod=readonly GOTOOLCHAIN=local
"${VENDETTA_GO_BIN:-go}" -C "$root/apps/web/scripts/experiments/opening-zk" build \
  -trimpath -buildvcs=false -o "$work/vk-export-check" ./cmd/vk-export-check
GOMEMLIMIT=256MiB GOMAXPROCS=2 timeout --signal=KILL 30s \
  prlimit --as=4294967296 --cpu=20 --fsize=1048576 --core=0 -- \
  "$work/vk-export-check" "${args[@]}"
