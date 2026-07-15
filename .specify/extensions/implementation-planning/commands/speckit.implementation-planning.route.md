---
description: "Route post-tasks planning to whiteboarding or subagent-planning via planning-router, against a mechanically resolved target file."
---

# Plan Route

## Preconditions

Requires `.specify/feature.json` to exist (set by `/speckit-specify` or `/speckit-tasks`). If it does not exist, stop and report that no active feature was found.

## Execution

1. From the repository root, resolve the feature's paths: source `.specify/scripts/bash/common.sh`, call `get_feature_paths`, and `eval` its output to obtain `FEATURE_DIR`, `FEATURE_SPEC`, `IMPL_PLAN`, `TASKS`.
2. Read `FEATURE_SPEC` (spec.md), `IMPL_PLAN` (plan.md), and `TASKS` (tasks.md) in full.
3. Invoke the `planning-router` skill, supplying the requested outcome and acceptance signals from `FEATURE_SPEC`, the technical approach from `IMPL_PLAN`, and the task breakdown from `TASKS` as its input context. Let it inspect the repository and select a route per its own rules. Do not weaken, duplicate, or second-guess its routing logic here.
4. Read planning-router's stated `Planning path:` value from its own "Explain the Decision" output. It is exactly one of `whiteboarding` or `subagent-planning`.
5. Run `scripts/setup-plan-target.sh <whiteboard|subagents>` from the repository root (map `whiteboarding` → `whiteboard`, `subagent-planning` → `subagents`). This resolves `FEATURE_DIR` independently and creates exactly one target file: `$FEATURE_DIR/whiteboard.md` or `$FEATURE_DIR/subagents.md`. Read the printed `TARGET` path from its JSON output.
6. Invoke the selected skill (`whiteboarding` or `subagent-planning`) exactly as planning-router named it, supplying the file created in step 5 as its plan document. Both skills populate whatever document they are handed — never create, rename, or choose the location yourself; that was already done mechanically in step 5.
7. Stop when the invoked skill stops. Do not proceed to `/speckit-implement` in this same turn. Implementation requires a separate, explicit approval step (`/speckit-implementation-planning-approve`) — never infer approval from this command completing.

## Done When

- [ ] `planning-router` was invoked with real spec/plan/tasks context, not re-derived from scratch
- [ ] Exactly one target file was created via `setup-plan-target.sh`, never chosen freehand
- [ ] The selected skill was invoked against that exact file and left in its own stop state (whiteboarding: `Prepared — awaiting explicit approval`; subagent-planning: `Approval required before agent dispatch or repository changes`)
- [ ] No implementation began
