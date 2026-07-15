---
name: speckit-implementation-planning-approve
description: Record explicit human approval of the routed plan into .specify/feature.json.
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: implementation-planning:commands/speckit.implementation-planning.approve.md
---

# Plan Approve

**Only run this after the user has given explicit, unambiguous approval of the plan document written by `/speckit-implementation-planning-route`** — whiteboarding's `Prepared` plan, or subagent-planning's presented Shared Contract. A request to "plan," "route," or "continue" is not approval. If the plan changed after a prior approval, that approval is void; require it again for the current version.

## Execution

1. From the repository root, run `.specify/extensions/implementation-planning/scripts/record-plan-approval.sh`. It resolves the current `FEATURE_DIR` and writes `plan_approved: true` to `.specify/feature.json`.
2. Confirm to the user that `/speckit-implement` may now proceed.

## Done When

- [ ] The user's approval was explicit and unambiguous, and given for the current version of the plan
- [ ] `plan_approved: true` was written via the script, not by hand-editing `.specify/feature.json`