#!/usr/bin/env bash
# Offline ceremony design/review commands; does not generate production keys.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Resolve relative input paths before changing the Go module working directory.
caller="${INIT_CWD:-$PWD}"
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  case "${args[i]}" in
    --plan|-plan|--trust|-trust|--review|-review|--execution|-execution)
      next=$((i + 1))
      if ((next < ${#args[@]})) && [[ -n "${args[next]}" && "${args[next]}" != /* ]]; then
        args[next]="$caller/${args[next]}"
      fi
      ;;
    --plan=*|-plan=*|--trust=*|-trust=*|--review=*|-review=*|--execution=*|-execution=*)
      value="${args[i]#*=}"
      if [[ -n "$value" && "$value" != /* ]]; then
        args[i]="${args[i]%%=*}=$caller/$value"
      fi
      ;;
  esac
done
exec "${VENDETTA_GO_BIN:-go}" -C "$root/apps/web/scripts/experiments/opening-zk" run ./cmd/ceremony "${args[@]}"
