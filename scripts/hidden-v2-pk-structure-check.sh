#!/usr/bin/env bash
# Bounded offline PK structure/shared parameters only; no setup, proving or approval.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
caller="${INIT_CWD:-$PWD}"
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  case "${args[i]}" in
    --vk|-vk|--pk|-pk|--metadata|-metadata)
      next=$((i + 1))
      if ((next < ${#args[@]})) && [[ -n "${args[next]}" && "${args[next]}" != /* ]]; then
        args[next]="$caller/${args[next]}"
      fi
      ;;
    --vk=*|-vk=*|--pk=*|-pk=*|--metadata=*|-metadata=*)
      value="${args[i]#*=}"
      if [[ -n "$value" && "$value" != /* ]]; then
        args[i]="${args[i]%%=*}=$caller/$value"
      fi
      ;;
  esac
done
work="$(mktemp -d "${TMPDIR:-/tmp}/vendetta-pk-structure-bin.XXXXXXXX")"
trap 'rm -rf -- "$work"' EXIT
export GOPROXY=off GOFLAGS=-mod=readonly GOTOOLCHAIN=local
"${VENDETTA_GO_BIN:-go}" -C "$root/apps/web/scripts/experiments/opening-zk" build \
  -trimpath -buildvcs=false -o "$work/pk-structure-check" ./cmd/pk-structure-check
GOMEMLIMIT=256MiB GOMAXPROCS=2 timeout --signal=KILL 90s \
  prlimit --as=4294967296 --cpu=60 --fsize=1048576 --core=0 -- \
  "$work/pk-structure-check" "${args[@]}"
