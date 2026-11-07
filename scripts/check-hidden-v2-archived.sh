#!/usr/bin/env bash
# Archived JSON consistency only; no native setup/proving or production approval.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

for suite in audit_bundle completed_evidence artifact_inventory receipt_lineage archived_preflight; do
  python3 -B -m unittest discover -s scripts -p "test_hidden_v2_${suite}.py" -v
done

result="$(mktemp)"
trap 'rm -f "$result"' EXIT
python3 -I -B scripts/hidden-v2-archived-preflight.py \
  --plan docs/proposals/hidden-v2-archived-preflight-inputs.json \
  --plan-sha256 429587c48f8322b08ce1e53836eb1ce91e531b3df26327987e982468dbce0f9e \
  > "$result"
cmp "$result" docs/benchmarks/timelock-opening/archived-preflight/result.json
cat "$result"
