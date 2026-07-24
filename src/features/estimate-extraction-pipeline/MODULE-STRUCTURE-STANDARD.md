# Pipeline Module Structure Standard

**Status: BINDING** for any new pipeline stage, and the target shape
existing stages should be brought into line with when touched. Sourced
from this codebase's own `enrichment/` and `presentation/` modules — not
invented, not guessed.

## Each stage is its own top-level sibling directory

`estimate-extraction-pipeline/<stage>/` — never nested inside another
stage's own folder. A stage that reaches into a sibling stage's folder to
add its own agent/logic (as `presentation` briefly did inside
`enrichment/presentation-agent.ts` + `enrichment/domain/presentation.ts`
before this doc existed) is a structural mistake, corrected on sight.

## Standard files, in every stage

| File | Contents |
|---|---|
| `schema.ts` | This stage's Zod schemas and inferred types. Exports whatever the *next* stage needs to `.extend()` or consume — e.g. `classification/schema.ts` exports `materialLineSchema`/`laborLineSchema` for `enrichment` to extend; `enrichment/schema.ts` exports `enrichedMaterialLineSchema`/`enrichedLaborLineSchema` for `presentation` to extend. |
| `agent.ts` (or `agents.ts` for a multi-purpose agent) | ONLY the `new Agent({...})` instance — id, tools, static instructions, model. No step definitions, no prompt-building logic here. |
| `domain/` | The actual business logic and step definitions live here, not in `agent.ts` or `workflow.ts`. See split below. |
| `workflow.ts` (or `steps.ts`) | Thin composition only: `createWorkflow({...}).then(...).foreach(...).commit()`, importing steps from `domain/`. No inline step logic, no inline prompt-building. |
| `index.ts` | THE DOOR — the module's complete public contract. Exports schemas/types other stages need, the composed fanout workflow, and (only for Mastra Studio registration) the agent. Every other module imports through this file, never by reaching into a sibling's internal files directly. |

## Splitting `domain/`

One file if the stage does a single batched call over all its input at
once (`presentation/domain/logic.ts` — one agent call for every line,
plus the deterministic merge step).

Two files if the stage fans out per-item (`.foreach()`) over a
sub-workflow:
- `domain/logic.ts` — the per-ONE-item agent-calling step, a small
  per-item workflow wrapping it, and a callable async helper
  (`enrichOneLine`-style) that wraps that workflow's `createRun()`/try-catch
  for per-item resilience.
- `domain/wrapper.ts` — the per-MANY-items orchestration: wraps the
  per-item helper into `.foreach()`-composable steps, plus any other
  batch-level named steps (flattening, grouping, combining results).

## Composition root

Only `pipeline.ts` chains stages together, via Mastra's "workflows as
steps" pattern (`docs/workflows/overview`) — `.then(extractionFanoutWorkflow)
.then(classificationFanoutWorkflow).then(enrichmentFanoutWorkflow)
.then(presentationWorkflow)`. No stage's own `workflow.ts` ever composes
a sibling stage's workflow internally. Beyond matching the pattern, this
also avoids circular imports between sibling doors — a later stage's
`domain/` needs the earlier stage's output type, so the earlier stage
must never need anything back from the later one.

## Compliant examples

`enrichment/` and `presentation/` fully match this doc.

`extraction/`, `classification/`, `intake/` predate it and do not have a
`domain/` split (their step logic lives directly in `steps.ts`/
`agents.ts`/`finding-workflow.ts`) — not yet migrated, flagged here
honestly rather than silently treated as compliant. Bring a stage into
line with this doc when you're already touching it for another reason,
not as a drive-by rename.
