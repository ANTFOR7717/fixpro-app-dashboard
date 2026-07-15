---
name: speckit-implementation-planning-check-approved
description: 'Gate: refuse /speckit-implement unless plan_approved is true in .specify/feature.json.'
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: implementation-planning:commands/speckit.implementation-planning.check-approved.md
---

# Plan Check Approved

## Execution

1. From the repository root, run `.specify/extensions/implementation-planning/scripts/check-plan-approved.sh`.
2. If it exits `0`: implementation may proceed. Continue to `/speckit-implement`'s own Outline.
3. If it exits non-zero: **stop**. Do not proceed to `/speckit-implement`'s Outline under any circumstance. Report the script's stderr output to the user verbatim, and that `/speckit-implementation-planning-approve` must be run first.

## Done When

- [ ] `check-plan-approved.sh` was actually run and its exit code read — never assumed
- [ ] A non-zero exit unconditionally blocked continuation to `/speckit-implement`