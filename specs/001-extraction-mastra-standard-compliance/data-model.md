# Data Model: Extraction Module — Citation Mechanism Removed

**Revised 2026-07-15.** The original version of this document described
`meaningfulSentenceSchema`/`rawFindingSchema`/`resolvedExtractionSchema`
as preserved shapes. That was wrong — those three, along with
`sourceSentenceId` and `resolveFindingsStep`, are removed entirely
(spec.md Revision Note, research.md R0/R9). This document now describes
the shape that replaces them.

## `ACTION` (enum, unchanged)

```ts
export const ACTION = ['repair', 'replace', 'install', 'remove', 'service', 'evaluate'] as const;
export type Action = (typeof ACTION)[number];
```

Unchanged — business logic, not part of this removal.

## `ExtractedFinding` (the ONLY finding shape now)

```ts
export const extractedFindingSchema = z.object({
  id: z.string(),
  action: z.enum(ACTION),
  scope: z.string().min(1),
  location: z.string().min(1),
  statedQuantity: z.number().int().min(1).nullable(),
  inspectorHours: z.number().positive().nullable(),
  sourceQuote: z.string().min(8).max(500),
  pageHint: z.string().regex(/^p\.\s*\d+$/).nullable(),
});
export type ExtractedFinding = z.infer<typeof extractedFindingSchema>;
```

Field-for-field identical to the OLD `extractedFindingSchema` (the prior
PUBLIC shape) — the change is behavioral, not structural:
`sourceQuote`/`pageHint` are now populated by the agent DIRECTLY, in the
same response as every other field, instead of being computed afterward
by `resolveFindingsStep` from a `sourceSentenceId` citation. This IS the
agent's structured-output schema now — no separate model-facing shape.

## `ExtractionOutput` (the agent's structured-output schema, simplified)

```ts
export const extractionOutputSchema = z.object({
  findings: z.array(extractedFindingSchema),
});
export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;
```

Was `{ sentences: MeaningfulSentence[], findings: RawFinding[] }`. The
`sentences` array (the model's self-invented, self-cited "meaningful
sentence" list) is gone — it verified nothing against the real document
and only added a round of indirection.

## Removed entirely (not renamed, not relocated — deleted)

- `meaningfulSentenceSchema` / `MeaningfulSentence`
- `rawFindingSchema` / `RawFinding` (the old model-facing shape — no
  longer needed since `extractedFindingSchema` is now emitted directly)
- `resolvedExtractionSchema` / `ResolvedExtraction`
- `resolveFindingsStep` (the step that resolved citations — nothing left
  to resolve)

## Downstream contract impact

`classification/` and every other consumer through `extraction/`'s door
only ever depended on `ExtractedFinding`/`extractedFindingSchema`/`ACTION`
— never on `MeaningfulSentence`/`sentences` (verified: `classification/schema.ts`
imports `ACTION`; `classification/steps.ts` imports `extractedFindingSchema`/
`ExtractedFinding`). **Zero contract break for `classification/`.** The
`sentences` field breaks for the 5 files that DID consume it directly
(`pipeline.ts`, `envelope.ts`, `workflow.ts`, `items-section.tsx`,
`estimate-report.tsx`) — each gets its own diff removing the reference,
not left dangling.

## What changes vs. what doesn't (revised)

| Aspect | Changes? |
|---|---|
| `ACTION` enum | No |
| `ExtractedFinding`'s field set (id/action/scope/location/statedQuantity/inspectorHours/sourceQuote/pageHint) | No — same fields, populated differently |
| `MeaningfulSentence`, `RawFinding`, `ResolvedExtraction` | Yes — deleted |
| `resolveFindingsStep` | Yes — deleted |
| `findingExtractorAgent`'s DEFINITION/HARD RULES/field semantics | No |
| `findingExtractorAgent`'s citation instructions (sentence-listing, `sourceSentenceId`) | Yes — replaced with direct `sourceQuote`/`pageHint` instruction |
| `findingExtractorAgentStep`'s `retries` | Yes — added (`retries: 2`) |
| `pipeline.ts` composition (chain length, `priceStep` schema, final output) | Yes — `resolveFindingsStep` removed from chain, `sentences` dropped |
| `estimate/lib/envelope.ts` v3 schema | Yes — `sentences` field dropped |
| `estimate/lib/workflow.ts` | Yes — `sentences` dropped from persisted envelope |
| `estimate/components/items-section.tsx` | Yes — `sentences` prop + debug panel dropped |
| `estimate/components/estimate-report.tsx` | Yes — `sentences` variable + prop pass dropped |
| `extraction/scorer.ts` | No code change — confirmed compatible, arguably improved (research.md R9) |
| `plans/MASTRA-AGENT-WORKFLOW-STANDARD.md` Rule 5 | Yes — resolved from "Unresolved" to a sourced answer |
