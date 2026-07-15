#!/usr/bin/env bash
# setup-plan-target.sh — mechanically resolve and create the one plan document
# planning-router's choice needs. Run from the repository root.
set -euo pipefail

CHOICE="${1:-}"
if [[ "$CHOICE" != "whiteboard" && "$CHOICE" != "subagents" ]]; then
  echo "Usage: $0 <whiteboard|subagents> (run from repository root)" >&2
  exit 1
fi

if [[ ! -f ".specify/scripts/bash/common.sh" ]]; then
  echo "ERROR: .specify/scripts/bash/common.sh not found — run this from the repository root" >&2
  exit 1
fi
source ".specify/scripts/bash/common.sh"

_paths_output=$(get_feature_paths) || { echo "ERROR: Failed to resolve feature paths" >&2; exit 1; }
eval "$_paths_output"
unset _paths_output

mkdir -p "$FEATURE_DIR"

if [[ "$CHOICE" == "whiteboard" ]]; then
  TARGET="$FEATURE_DIR/whiteboard.md"
else
  TARGET="$FEATURE_DIR/subagents.md"
fi

if [[ -f "$TARGET" ]]; then
  echo "Target already exists at $TARGET, leaving it as-is" >&2
else
  touch "$TARGET"
fi

if has_jq; then
  jq -cn --arg target "$TARGET" --arg feature_dir "$FEATURE_DIR" '{TARGET:$target,FEATURE_DIR:$feature_dir}'
else
  printf '{"TARGET":"%s","FEATURE_DIR":"%s"}\n' "$(json_escape "$TARGET")" "$(json_escape "$FEATURE_DIR")"
fi
