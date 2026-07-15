#!/usr/bin/env bash
# record-plan-approval.sh — write plan_approved:true to .specify/feature.json.
# Run only after explicit human approval. Run from the repository root.
set -euo pipefail

if [[ ! -f ".specify/scripts/bash/common.sh" ]]; then
  echo "ERROR: .specify/scripts/bash/common.sh not found — run this from the repository root" >&2
  exit 1
fi
source ".specify/scripts/bash/common.sh"

# --no-persist: this script only reads the current feature, it never changes
# which feature is active, so it must not write feature_directory as a side effect.
_paths_output=$(get_feature_paths --no-persist) || { echo "ERROR: Failed to resolve feature paths" >&2; exit 1; }
eval "$_paths_output"
unset _paths_output

FEATURE_JSON="$REPO_ROOT/.specify/feature.json"
if [[ ! -f "$FEATURE_JSON" ]]; then
  echo "ERROR: $FEATURE_JSON does not exist" >&2
  exit 1
fi

if ! has_jq; then
  echo "ERROR: jq is required to safely update $FEATURE_JSON" >&2
  exit 1
fi

jq '. + {plan_approved: true}' "$FEATURE_JSON" > "$FEATURE_JSON.tmp"
mv "$FEATURE_JSON.tmp" "$FEATURE_JSON"

echo "plan_approved: true recorded for $FEATURE_DIR" >&2
