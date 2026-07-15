# Data Model: Pipeline Accuracy Eval Harness

This feature adds no persistence and changes no production schema. The
"data model" here is: (1) the fixture-authoring contract a developer
writes by hand (`ExpectedOutput`), and (2) the internal shapes the
harness itself derives from a real pipeline run to grade against it. Both
are new, harness-only types living under `eval/pipeline/`, not additions
to any `estimate-extraction-pipeline/` schema file.

**Revised during whiteboarding**: `expectedClassificationSchema`
originally also sketched a `hasLabor: z.boolean()` field. Reading
`classification/schema.ts` directly showed `LineClassification.laborHours`
is unconditionally `z.number().positive()` — every classified finding
always gets exactly one labor line, so there is no "no labor" state to
assert against. Dropped as a non-discriminating field, not silently left
in.

## `Fixture` (a file-system convention, not a type)

One fixture is a matched pair of files in `eval/fixtures/`:

```
eval/fixtures/<slug>.pdf              # the real inspection-report PDF
eval/fixtures/<slug>.expected.ts       # export default: ExpectedOutput
```

`fixtures.ts` discovers fixtures by scanning `eval/fixtures/*.pdf` and
requiring a same-slug `.expected.ts` sibling for each — a `.pdf` with no
matching `.expected.ts` (or vice versa) is reported as an **invalid
fixture** (FR-009b), not silently skipped and not run.

## `ExpectedOutput` (the fixture-authoring contract)

```ts
// eval/pipeline/schema.ts
import { z } from 'zod';
import { ACTION } from '@/features/estimate-extraction-pipeline/extraction';
import { TRADE, EXTENT_UNIT } from '@/features/estimate-extraction-pipeline/classification';

export const expectedFindingSchema = z.object({
  /** A short, human-assigned label for this expected finding — used only
   *  in eval diagnostic output, not compared against the agent's own
   *  generated `id`. */
  label: z.string().min(1),
  action: z.enum(ACTION),
  scope: z.string().min(1),
  location: z.string().min(1),
  statedQuantity: z.number().int().min(1).nullable(),
  inspectorHours: z.number().positive().nullable(),
});

export const expectedClassificationSchema = z.object({
  /** Matches the `label` of the expectedFindingSchema entry this classification is for. */
  findingLabel: z.string().min(1),
  trade: z.enum(TRADE),
  /** How many material lines this finding should classify into (0 is valid — labor-only). */
  materialCount: z.number().int().min(0),
  /** Units expected among those material lines — order-insensitive set, not positional. */
  materialUnits: z.array(z.enum(EXTENT_UNIT)),
});

export const expectedPricingSchema = z.object({
  /** Matches the `label` of the expectedFindingSchema entry this pricing outcome is for. */
  findingLabel: z.string().min(1),
  /** 'priced': every line for this finding must have a non-null unitPrice.
   *  'unavailable': every line for this finding must be correctly flagged unavailable. */
  outcome: z.enum(['priced', 'unavailable']),
});

export const expectedOutputSchema = z.object({
  /** Real property zip code for this fixture — pricing is location-sensitive. */
  zipCode: z.string().min(1),
  findings: z.array(expectedFindingSchema),
  classifications: z.array(expectedClassificationSchema),
  pricing: z.array(expectedPricingSchema),
});

export type ExpectedOutput = z.infer<typeof expectedOutputSchema>;
```

**Why `label`, not the pipeline's own generated `id`**: the pipeline
generates `id`/`finding-NNN` values fresh every run (`agent.ts`'s
instructions: "stable per-run identifier ... in order") — pinning a
fixture's expected output to a specific generated id would break the
moment ordering shifts for an unrelated reason. `label` is a stable,
human-chosen anchor (e.g. `"loose-siding-panel"`) that the extraction
scorer resolves against the *actual* run's findings by semantic content,
not by string identity — this is precisely why the extraction-recall
scorer needs an LLM judge (R1/FR-005a) while classification/pricing don't
(they piggyback on the *actual* run's own generated finding `id`, once
the extraction scorer has already resolved which actual finding
corresponds to which expected `label` — see "Cross-stage id resolution"
below).

**Malformed-fixture handling (FR-009b)**: `fixtures.ts` calls
`expectedOutputSchema.safeParse(...)` on each `.expected.ts`'s default
export at discovery time. A parse failure (or a completely missing/
throwing module) marks that fixture **invalid** immediately — reported in
its own category, excluded from the harness's per-fixture loop entirely
so one bad fixture file cannot crash the whole sweep or silently score as
a pass.

## Cross-stage id resolution: how a `label` connects to a real run's generated `id`

Because classification/pricing scorers need to compare *specific* actual
lines (keyed by the pipeline's own generated finding `id`) against
*specific* expected entries (keyed by a human-chosen `label`), the
extraction-recall scorer's job is two things at once, not one:

1. Score recall (FR-005a): is every `expectedFindingSchema` entry
   semantically present somewhere in `run.output.findings`?
2. As a side effect of (1), produce a `label → actual finding id` mapping
   for every expected finding it *did* find a match for.

That mapping is held as a plain local variable inside the harness's own
per-fixture loop (`eval/pipeline/run.ts`) — **not** threaded through any
Mastra-internal mechanism. Concretely: the harness calls the
extraction-recall scorer's `.run({ input, output, groundTruth })`
directly (per research.md R1/R3), reads the label→id map back off that
call's `analyzeStepResult`, and passes it into the classification and
pricing scorers' own `.run()` calls as part of their `input` — so those
scorers, given `LineClassification[]`/`PricedLineItem[]` (keyed by the
pipeline's own generated ids) and the map, can look up "which actual
line(s) came from the finding I labeled `loose-siding-panel` in my
`.expected.ts` file" with a plain array lookup, no further LLM judgment
needed (research.md R5/R6). An expected finding the extraction scorer
could not match to anything real has no id to hand downstream — its
classification/pricing expectations are reported as **unverifiable for
this run** rather than silently passed or crashed on.

## `GroundingViolation` (grounding scorer's own output shape)

```ts
interface GroundingViolation {
  findingId: string;
  quotedText: string;
}
```

Produced by the deterministic `grounding` scorer: for every actual
finding, check `parsedDocument.pages.some(p => p.content.includes(finding.sourceQuote))`.
Any finding whose `sourceQuote` matches no page is a `GroundingViolation`
— this scorer *is* a gate (FR-006 is a hard requirement, independent of
what any fixture's expected output declares).

## Eval Result (what the harness prints and exits on)

Not a Mastra type — the harness's own accumulation, built directly inside
its per-fixture loop (one outcome pushed per fixture, whether that
fixture turned out invalid, run-failed, or scored) rather than read back
from any Mastra callback, matching spec.md's three FR-009 categories
exactly:

```ts
type FixtureOutcome =
  | { kind: 'invalid'; slug: string; reason: string }
  | { kind: 'run-failed'; slug: string; error: string }
  | {
      kind: 'scored';
      slug: string;
      stagePass: { extraction: boolean; classification: boolean; pricing: boolean };
      groundingViolations: GroundingViolation[];
      unverifiable: string[]; // expected finding labels the extraction scorer couldn't match
    };
```

The harness's exit code is non-zero if any fixture's outcome is
`'invalid'`, `'run-failed'`, or `'scored'` with any `stagePass` value
`false` — matching FR-011 exactly.
