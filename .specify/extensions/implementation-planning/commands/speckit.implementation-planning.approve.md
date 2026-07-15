---
description: "Record explicit human approval of the routed plan into .specify/feature.json."
---

# Plan Approve

**Only run this after the user has given explicit, unambiguous approval of the plan document written by `/speckit-implementation-planning-route`** — whiteboarding's `Prepared` plan, or subagent-planning's presented Shared Contract. A request to "plan," "route," or "continue" is not approval. If the plan changed after a prior approval, that approval is void; require it again for the current version.

## Execution

1. From the repository root, run `scripts/record-plan-approval.sh`. It resolves the current `FEATURE_DIR` and writes `plan_approved: true` to `.specify/feature.json`.
2. Confirm to the user that `/speckit-implement` may now proceed.

## Done When

- [ ] The user's approval was explicit and unambiguous, and given for the current version of the plan
- [ ] `plan_approved: true` was written via the script, not by hand-editing `.specify/feature.json`
