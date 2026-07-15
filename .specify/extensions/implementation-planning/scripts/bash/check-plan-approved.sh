#!/usr/bin/env bash
# check-plan-approved.sh — before_implement gate. Exits non-zero unless
# plan_approved is true in .specify/feature.json. Run from the repository root.
set -euo pipefail

if [[ ! -f ".specify/scripts/bash/common.sh" ]]; then
  echo "ERROR: .specify/scripts/bash/common.sh not found — run this from the repository root" >&2
  exit 1
fi
source ".specify/scripts/bash/common.sh"

_paths_output=$(get_feature_paths --no-persist) || { echo "ERROR: Failed to resolve feature paths" >&2; exit 1; }
eval "$_paths_output"
unset _paths_output

FEATURE_JSON="$REPO_ROOT/.specify/feature.json"
if [[ ! -f "$FEATURE_JSON" ]]; then
  echo "ERROR: no $FEATURE_JSON — no plan has been routed yet for this feature" >&2
  exit 1
fi

APPROVED="false"
if has_jq; then
  APPROVED=$(jq -r '.plan_approved // false' "$FEATURE_JSON" 2>/dev/null || echo "false")
else
  echo "ERROR: jq is required to check plan_approved — treating as not approved" >&2
  exit 1
fi

if [[ "$APPROVED" != "true" ]]; then
  echo "ERROR: plan_approved is not true for $FEATURE_DIR — run /speckit-implementation-planning-approve after explicit human approval" >&2
  exit 1
fi

echo "plan_approved: true confirmed for $FEATURE_DIR" >&2
exit 0
