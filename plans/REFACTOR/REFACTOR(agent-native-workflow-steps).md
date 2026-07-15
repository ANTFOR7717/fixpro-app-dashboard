# REFACTOR(agent-native-workflow-steps)

## Request

Delete every hand-rolled agent-orchestration function in
`extraction/index.ts` and `classification/index.ts` — the manual
`.stream()` calls, the manual `.object` reads, and specifically the
unverified `for await (... of stream.textStream)` drain loop that was
added on a guess and never checked against documentation. Replace all of
it with Mastra's own native `createStep(agent, { structuredOutput })`
composition, `.map()`, `getStepResult()`, and `getInitData()` — exactly as
documented, with every claim in this plan backed by a cited doc path.

**Governing document:** `plans/MASTRA-AGENT-WORKFLOW-STANDARD.md`. That
file is binding for every change in this plan. If anything below drifts
from it, the standard wins and this plan is wrong, not the other way
around.

**Scope boundary, stated explicitly:** `pricing/price-line.ts`'s
`agent.generate()` call inside `createStep({ execute })` is **not**
touched by this plan. It picks between two different `structuredOutput`
schemas (`materialPriceResponseSchema` vs `laborPriceResponseSchema`)
based on `line.costType` at runtime — this is the one documented
exception in the Standard's Rule 1 (per-call conditional control requires
`execute()`, not the bare `createStep(agent, ...)` composition form).
`pricing/` is already compliant. Not slop. Not being rewritten.

## Directory Map

```text
src/features/estimate-extraction-pipeline/
├── extraction/
│   ├── schema.ts                   [MODIFY] add resolvedExtractionSchema (named, shared — see File-by-File)
│   ├── agent.ts                    [MODIFY] add defaultOptions (maxOutputTokens) — see File-by-File
│   ├── scorer.ts                   [UNCHANGED]
│   ├── steps.ts                    [CREATE] buildExtractionPrompt (function), findingExtractorAgentStep, resolveFindingsStep
│   └── index.ts                    [MODIFY] delete extractFindings(); door now exports the three pieces
├── classification/
│   ├── schema.ts                   [UNCHANGED]
│   ├── agent.ts                    [MODIFY] add defaultOptions (maxSteps) — see File-by-File
│   ├── steps.ts                    [CREATE] buildClassificationPrompt (function), lineClassifierAgentStep, buildLinesStep
│   └── index.ts                    [MODIFY] delete classifyLines(); door now exports the three pieces
├── pricing/                        [UNCHANGED — already compliant, see Scope Boundary above]
├── shared/gateway.ts                [UNCHANGED]
└── pipeline.ts                     [MODIFY] full rewrite — composition root chains the new steps directly

AGENTS.md                           [MODIFY] one-door boundary grep for extraction/ and classification/ adds "steps"
```

## Modification Table

| File | Action | Why |
|---|---|---|
| `extraction/schema.ts` | Modify | Add `resolvedExtractionSchema`/`ResolvedExtraction` — `resolveFindingsStep`'s output shape, named because it's read back via `getStepResult()` at three separate points in `pipeline.ts`; an earlier draft declared this shape as an anonymous inline `z.object()` with nothing keeping the three consumers in sync with the one producer except hand-editing. |
| `extraction/steps.ts` | Create | The three composable pieces that replace `extractFindings()`: `buildExtractionPrompt` (a plain function, not a step — matches Mastra's own canonical prompt-building pattern, see File-by-File), `findingExtractorAgentStep` (the agent as a native step), `resolveFindingsStep` (citation resolution). Zero hand-rolled `.generate()`/`.stream()` calls anywhere. |
| `extraction/agent.ts` | Modify | `maxOutputTokens: 16000` moves from a per-call `modelSettings` option (which `createStep(agent, ...)` has no documented way to accept) to the agent's own `defaultOptions` — a real, documented `Agent` constructor field, sourced below. |
| `extraction/index.ts` | Modify | `extractFindings()` deleted outright — not refactored, not kept as a thin wrapper. Door now exports `buildExtractionPrompt`/`findingExtractorAgentStep`/`resolveFindingsStep` from `steps.ts` for `pipeline.ts` to compose directly. |
| `classification/steps.ts` | Create | The three composable pieces that replace `classifyLines()`: `buildClassificationPrompt` (plain function, same reasoning as extraction), `lineClassifierAgentStep` (agent as a native step), `buildLinesStep` (line-building). Dedup logic is dropped entirely, not relocated — see Existing Pattern Audit and Risk Notes for why. |
| `classification/agent.ts` | Modify | `maxSteps: 20` moves to `defaultOptions`, same reasoning as extraction. |
| `classification/index.ts` | Modify | `classifyLines()` deleted outright. Door now exports `buildClassificationPrompt`/`lineClassifierAgentStep`/`buildLinesStep` from `steps.ts`. |
| `pipeline.ts` | Modify | Full rewrite. No `execute: async () => extractFindings(...)`/`classifyLines(...)` wrapper steps remain — `pipeline.ts` chains the native agent-steps and named transform-steps directly, using `.map()` + `getStepResult()` + `getInitData()` to carry `estimateRequestId`/`zipCode`/`parsedDocument`/`sentences` through instead of manually re-declaring them on every step's `outputSchema`. |
| `AGENTS.md` | Modify | Boundary grep for `extraction/` and `classification/` adds `steps` as a disallowed external-import filename, matching the existing pattern for `schema`/`agent`/`scorer`. |

## Existing Pattern Audit

- **Every architectural claim in this plan is sourced**, not inferred.
  `createStep(agent, { structuredOutput })` — `docs/workflows/agents-and-tools`,
  "Agents as steps" / "Agents with structured output". `.map()` +
  `getStepResult()`/`getInitData()`/`mapVariable()` — `docs/workflows/control-flow`
  and `reference/workflows/workflow-methods/map`. `createTool()` —
  `reference/tools/create-tool`. All fetched live via the Mastra MCP this
  session; exact quotes are in `plans/MASTRA-AGENT-WORKFLOW-STANDARD.md`.
- **`defaultOptions` is a real, documented `Agent` constructor field**
  (confirmed earlier this session via `mcp__mastra__mastraDocs`,
  `reference/agents/agent`): *"`defaultOptions`
  (`AgentExecutionOptions | ...`): Default options used when calling
  `stream()` and `generate()`."* Since `createStep(agent, {...})`'s only
  documented option is `structuredOutput` (no `modelSettings`/`maxSteps`
  shown in any fetched example), moving these two previously-load-bearing
  settings onto the agent's own `defaultOptions` is the one place they
  can be set with actual documented backing, rather than guessed at the
  call site again.
- **`structuredOutput.model` (the classification agent's tools +
  structured-output fix) is kept in `steps.ts` at the `createStep(...)`
  call**, not moved to `defaultOptions` — `defaultOptions` sets
  `AgentExecutionOptions` broadly, and nothing fetched this session shows
  `structuredOutput.model` as a settable default independent of a
  specific call's schema; it stays paired with `classificationOutputSchema`
  at the composition site. Flagged as needing a live check regardless —
  see Risk Notes.
- **`resolveFinding`'s citation-resolution logic and `classifyLines`'s
  line-building logic are preserved, not deleted.** They move verbatim
  into named `createStep({ execute })` functions (`resolveFindingsStep`,
  `buildLinesStep`) — this is real business logic this project's own live
  testing already proved correct (the real Sparrow House "trim or wood
  siding" → two material lines case). Rule 2 of the Standard requires
  this logic become a named step, not that it be discarded.
- **`classifyLines`'s dedup logic is DROPPED entirely, not relocated —
  a deliberate decision, not an oversight.** An earlier draft of this
  plan carried the dedup step forward unexamined, on the assumption that
  "it existed before" meant "it's still needed." On review: no live test
  this session ever observed the extractor emit two findings with the
  same `sourceQuote` + `action`, and `findingExtractorAgent`'s own
  instructions already state "ONE FINDING PER FIX" — dedup was a
  deterministic safety net for a failure mode the prompt already forbids
  at the source, duplicating the same guarantee in two places with no
  observed evidence the downstream copy was ever load-bearing. If
  duplicate findings are ever actually observed in real usage, the fix is
  strengthening the extraction prompt, not reinstating a silent
  downstream patch under it. This is a real behavior change from the
  pre-this-plan implementation — flagged explicitly, not silently
  dropped, and covered again in Risk Notes.
- **The explicit `if (!result.object) throw` check from the old
  hand-rolled code has NO direct equivalent anywhere in this plan — flagged
  here as a deliberate assumption, not a silently dropped safety net.**
  `extractFindings()`/`classifyLines()` each explicitly checked
  `result.object` and threw `'Extraction returned no structured object'`/
  `'Classification returned no structured object'` — this is not
  theoretical, it is the EXACT error this session directly observed live
  (`STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED`, from Mastra's own
  `StructuredOutputProcessor`). Neither `findingExtractorAgentStep` nor
  `lineClassifierAgentStep` in this plan contains any equivalent check.
  The assumption this relies on: `StructuredOutputProcessor` is Mastra's
  OWN internal machinery — it threw in the observed error regardless of
  the fact my old code also happened to have its own redundant check
  after it — so it should throw the same way whether the agent is called
  by hand or composed via `createStep(agent, ...)`, making the explicit
  check redundant rather than load-bearing. This is a REASONABLE
  inference (the observed failure originated inside Mastra's processor,
  not inside my own `if` check), but it was never stated or verified
  anywhere in this plan until now — see Validation Plan for the concrete
  check this needs.
- **The pasted reference architecture's `reportReaderTool` pattern is
  deliberately NOT adopted.** It wraps data the agent already has (the
  parsed document, handed directly as prompt text) behind a no-op tool
  call the model must separately invoke to get data it was already given.
  This project already hit a real production bug from exactly this shape
  of over-engineering (an agentic retrieval loop for data that didn't
  need retrieving) — flagged explicitly in the Standard's Rule 3. The
  parsed document continues to be embedded directly in the prompt text
  built by `buildExtractionPrompt`, unchanged from the current
  (pre-this-session-of-changes) behavior.

## Execution Plan

### Step 1 — `extraction/agent.ts`: move `maxOutputTokens` to `defaultOptions`
### Step 2 — `extraction/steps.ts`: create `buildExtractionPrompt` (function) + the two native steps
### Step 3 — `extraction/index.ts`: delete `extractFindings()`, export the three pieces
### Step 4 — `classification/agent.ts`: move `maxSteps` to `defaultOptions`
### Step 5 — `classification/steps.ts`: create `buildClassificationPrompt` (function) + the two native steps
### Step 6 — `classification/index.ts`: delete `classifyLines()`, export the three pieces
### Step 7 — `pipeline.ts`: full rewrite, compose everything via `.then()`/`.map()`
### Step 8 — `AGENTS.md`: update the boundary grep

## File-by-File Changes

### `src/features/estimate-extraction-pipeline/extraction/agent.ts`
**Action:** Modify

#### Before (relevant excerpt)
```ts
export const findingExtractorAgent = new Agent({
  id: 'finding-extractor',
  name: 'Inspection Finding Extractor',
  instructions: `...`,
  model: pioneerGateway.chat('claude-fable-5'),
  scorers: {
    consistency: {
      scorer: extractionConsistencyScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
  },
});
```

#### After (relevant excerpt)
```ts
export const findingExtractorAgent = new Agent({
  id: 'finding-extractor',
  name: 'Inspection Finding Extractor',
  instructions: `...`, // unchanged
  model: pioneerGateway.chat('claude-fable-5'),
  scorers: {
    consistency: {
      scorer: extractionConsistencyScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
  },
  // Was passed as a per-call `modelSettings` option to `.stream()`.
  // `createStep(agent, { structuredOutput })` (see steps.ts) has no
  // documented way to pass modelSettings at the call site — this is the
  // one place it can be set with real documented backing
  // (reference/agents/agent's `defaultOptions` field). Still
  // load-bearing: live-verified this session that the default output
  // budget truncates mid-response on a real 40+ page report.
  defaultOptions: {
    modelSettings: { maxOutputTokens: 16000 },
  },
});
```

---

### `src/features/estimate-extraction-pipeline/extraction/schema.ts`
**Action:** Modify — add one schema, nothing else changes.

Add, immediately after `extractionOutputSchema`:
```ts
/**
 * Extraction's fully-resolved output — same shape as `extractionOutputSchema`
 * except `findings` is the PUBLIC (citation-resolved) shape, not the raw
 * model-facing one. This is `resolveFindingsStep`'s output shape (see
 * extraction/steps.ts), named here because it's read back via
 * `getStepResult()` at three separate points in `pipeline.ts` — an
 * earlier draft of this plan declared this exact shape as an anonymous
 * inline `z.object()` at the one place it's PRODUCED, with the three
 * places that CONSUME it relying on it staying in sync by hand rather
 * than by referencing a shared type.
 */
export const resolvedExtractionSchema = z.object({
  sentences: z.array(meaningfulSentenceSchema),
  findings: z.array(extractedFindingSchema),
});

export type ResolvedExtraction = z.infer<typeof resolvedExtractionSchema>;
```

---

### `src/features/estimate-extraction-pipeline/extraction/steps.ts`
**Action:** Create

```ts
import { createStep } from '@mastra/core/workflows';
import { findingExtractorAgent } from './agent';
import {
  extractionOutputSchema,
  resolvedExtractionSchema,
  type RawFinding,
  type ExtractedFinding,
  type MeaningfulSentence,
} from './schema';
import type { ParsedDocument } from '../document';

/**
 * A plain function, NOT a `createStep()` — deliberately. Mastra's own
 * canonical docs example for "build a prompt right before an
 * agent-composed step" (docs/workflows/agents-and-tools, both examples
 * fetched this session) uses a bare `.map()`, never a named step:
 *
 *   .map(async ({ inputData }) => ({ prompt: `Generate an article about: ${inputData.topic}` }))
 *   .then(agentStep)
 *
 * An earlier draft of this plan wrapped this exact kind of string
 * formatting in a full named `createStep()` — that was over-applying
 * Rule 2 (which reserves named steps for logic with real decisions in
 * it, like dedup/citation-resolution/line-building, not plain string
 * concatenation). This function is called from a `.map()` directly in
 * `pipeline.ts`, matching Mastra's own documented shape exactly.
 * `pipeline.ts` stays "logic-free" per AGENTS.md because it only CALLS
 * this function — the actual formatting logic still lives here, in the
 * module that owns it.
 */
export function buildExtractionPrompt(parsedDocument: ParsedDocument): string {
  const lines = parsedDocument.pages.map((page) => `[p. ${page.pageNumber}]\n${page.content}`);
  return (
    'Read this inspection report page by page. First identify every ' +
    'sentence meaningful enough that a billable finding can be ' +
    'inferred from it and emit it into "sentences". Then extract ' +
    'every billable finding, citing one of your own sentence ids ' +
    'for each. Follow the rules in your instructions exactly. When ' +
    'in doubt, omit. Return JSON matching the provided schema.\n\n' +
    `INSPECTION REPORT (by page):\n\n${lines.join('\n\n')}`
  );
}

/**
 * The agent itself, composed AS a step — no `.stream()`, no `.object`,
 * no drain loop anywhere in this codebase. Mastra owns the transport
 * entirely. Per the Standard's Rule 1 / `docs/workflows/agents-and-tools`.
 */
export const findingExtractorAgentStep = createStep(findingExtractorAgent, {
  structuredOutput: { schema: extractionOutputSchema },
});

/**
 * Resolve each raw finding's `sourceSentenceId` into the public shape's
 * verbatim `sourceQuote`/`pageHint`. This IS a named step, correctly —
 * unlike `buildExtractionPrompt` above, this has real logic worth
 * validating on its own boundary (a Map lookup + a degrade-on-miss
 * decision), matching Rule 2's actual bar. This is `resolveFinding`'s
 * exact prior logic, unchanged — it still degrades an unresolved
 * citation to `'(unresolved citation)'` rather than throwing and losing
 * the batch.
 */
export const resolveFindingsStep = createStep({
  id: 'resolve-findings',
  inputSchema: extractionOutputSchema,
  outputSchema: resolvedExtractionSchema,
  execute: async ({ inputData }) => {
    const sentenceMap = new Map(inputData.sentences.map((s) => [s.id, s]));
    const findings = inputData.findings.map((f) => resolveFinding(f, sentenceMap));
    return { sentences: inputData.sentences, findings };
  },
});

function resolveFinding(
  f: RawFinding,
  sentenceMap: Map<string, MeaningfulSentence>,
): ExtractedFinding {
  const sentence = sentenceMap.get(f.sourceSentenceId);
  return {
    id: f.id,
    action: f.action,
    scope: f.scope,
    location: f.location,
    statedQuantity: f.statedQuantity,
    inspectorHours: f.inspectorHours,
    sourceQuote: sentence?.text ?? '(unresolved citation)',
    pageHint: sentence ? `p. ${sentence.pageNumber}` : null,
  };
}
```

---

### `src/features/estimate-extraction-pipeline/extraction/index.ts`
**Action:** Modify — `extractFindings()` deleted outright, not kept in any form.

#### After
```ts
/**
 * THE DOOR — extraction's complete public contract. `pipeline.ts`
 * composes these steps directly; nothing in this module calls
 * `.generate()`/`.stream()` by hand anywhere.
 */
export {
  ACTION,
  extractedFindingSchema,
  meaningfulSentenceSchema,
  resolvedExtractionSchema,
  type Action,
  type ExtractedFinding,
  type MeaningfulSentence,
  type ResolvedExtraction,
} from './schema';
export {
  buildExtractionPrompt,
  findingExtractorAgentStep,
  resolveFindingsStep,
} from './steps';
/** Re-exported for Mastra-instance registration ONLY — no module calls these directly. */
export { findingExtractorAgent } from './agent';
export { extractionConsistencyScorer } from './scorer';
```
(`ExtractFindingsInput`/`ExtractFindingsOutput` interfaces and the
`extractFindings` function are gone — there is no longer a single
function that "does extraction"; extraction is the composed chain of
three steps `pipeline.ts` chains directly. No `ParsedDocument` import —
checked against the full export list above, nothing here references it;
carrying it would be a dead import.)

---

### `src/features/estimate-extraction-pipeline/classification/agent.ts`
**Action:** Modify

#### Before (relevant excerpt)
```ts
export const lineClassifierAgent = new Agent({
  id: 'line-classifier',
  name: 'Billable Line Classifier',
  instructions: `...`,
  model: pioneerGateway.chat('claude-fable-5'),
  tools: {
    webSearch: createTavilySearchTool(),
  },
});
```

#### After (relevant excerpt)
```ts
export const lineClassifierAgent = new Agent({
  id: 'line-classifier',
  name: 'Billable Line Classifier',
  instructions: `...`, // unchanged
  model: pioneerGateway.chat('claude-fable-5'),
  tools: {
    webSearch: createTavilySearchTool(),
  },
  // Was a per-call option to `.stream()`. maxSteps defaults to 5 — a
  // batch needing several real web searches plausibly needs more than 5
  // tool-call steps. Moved to defaultOptions for the same reason as
  // extraction's maxOutputTokens — createStep(agent, {...}) has no
  // documented per-call option for this.
  defaultOptions: {
    maxSteps: 20,
  },
});
```

---

### `src/features/estimate-extraction-pipeline/classification/steps.ts`
**Action:** Create

```ts
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { lineClassifierAgent } from './agent';
import {
  billableLineSchema,
  classificationOutputSchema,
  lineClassificationSchema,
  type BillableLine,
} from './schema';
import { pioneerGateway } from '../shared/gateway';
import { extractedFindingSchema, type ExtractedFinding } from '../extraction';

/**
 * A plain function, NOT a `createStep()` — same reasoning as
 * `extraction/steps.ts`'s `buildExtractionPrompt`: Mastra's own
 * canonical docs example for "build a prompt right before an
 * agent-composed step" is a bare `.map()`, never a named step. Called
 * from a `.map()` directly in `pipeline.ts`. No dedup step precedes this
 * anymore — an earlier draft of this plan carried forward the prior
 * implementation's dedup logic unexamined; removed after review found no
 * observed evidence it was still needed, since `findingExtractorAgent`
 * already enforces "ONE FINDING PER FIX" at the source. See Existing
 * Pattern Audit.
 */
export function buildClassificationPrompt(findings: readonly ExtractedFinding[]): string {
  return (
    'Classify each finding below. Ground every material amount and ' +
    'labor hour count in the document or a web search — never null, ' +
    'never a bare guess. Return JSON matching the provided schema.\n\n' +
    findings
      .map(
        (f) =>
          `[${f.id}] action=${f.action} scope="${f.scope}" ` +
          `location="${f.location}" statedQuantity=${f.statedQuantity ?? 'none'} ` +
          `inspectorHours=${f.inspectorHours ?? 'none'} quote="${f.sourceQuote}"`,
      )
      .join('\n')
  );
}

/**
 * The agent itself, composed AS a step. `structuredOutput.model`
 * kept here (paired with the schema it structures) — the documented
 * Mastra fix for combining `tools` with `structuredOutput` in the same
 * call (docs/agents/structured-output, "Use a separate structuring
 * model"). NEEDS A LIVE CHECK that `createStep(agent, {...})` passes
 * `structuredOutput.model` through the same as a direct `.generate()`/
 * `.stream()` call — see Risk Notes.
 */
export const lineClassifierAgentStep = createStep(lineClassifierAgent, {
  structuredOutput: {
    schema: classificationOutputSchema,
    model: pioneerGateway.chat('claude-fable-5'),
  },
});

/**
 * Turn the agent's per-finding classification into fully-resolved
 * BillableLine(s) — this IS `classifyLines`'s prior line-building logic
 * (material array -> N material lines, one labor line), moved verbatim
 * into a named step (a real fit for Rule 2 — conditional per-material
 * splitting and id-suffixing is exactly the "logic worth naming and
 * validating" the rule describes). Input combines the classification
 * output with the
 * ORIGINAL findings (needed for action/scope/location/sourceQuote/
 * pageHint, which the classifier's response never re-echoes) — that
 * combination happens in the `.map()` immediately before this step in
 * pipeline.ts, via `getStepResult(resolveFindingsStep)`. `classifications`
 * uses `lineClassificationSchema` (imported
 * directly from `./schema`) rather than reaching into
 * `classificationOutputSchema.shape.lines`, so this schema's shape is
 * declared explicitly instead of derived by reflection off another
 * schema's internal key name.
 */
export const buildLinesStep = createStep({
  id: 'build-lines',
  inputSchema: z.object({
    findings: z.array(extractedFindingSchema),
    classifications: z.array(lineClassificationSchema),
  }),
  outputSchema: z.object({ lines: z.array(billableLineSchema) }),
  execute: async ({ inputData }) => {
    const byFindingId = new Map(inputData.classifications.map((l) => [l.findingId, l]));
    const lines: BillableLine[] = [];

    for (const f of inputData.findings) {
      const cls = byFindingId.get(f.id);
      if (!cls) {
        // Unresolved — the agent didn't classify a finding it was given.
        // Throw rather than silently drop: an unclassified finding is a
        // real failure, not a case to paper over with a fabricated line.
        throw new Error(`Classification did not return a line for finding ${f.id}`);
      }

      const common = {
        trade: cls.trade,
        action: f.action,
        scope: f.scope,
        location: f.location,
        sourceQuote: f.sourceQuote,
        pageHint: f.pageHint,
      };

      const hasMaterial = cls.materials.length > 0;
      cls.materials.forEach((m, i) => {
        lines.push({
          ...common,
          id: cls.materials.length > 1 ? `${f.id}-material-${i}` : `${f.id}-material`,
          costType: 'material',
          material: m.material,
          quantity: m.quantity,
          unit: m.unit,
          amountSource: m.amountSource,
          pricingBasis: 'material-part-only',
        });
      });

      lines.push({
        ...common,
        id: hasMaterial ? `${f.id}-labor` : f.id,
        costType: 'labor',
        laborType: cls.laborType,
        unit: 'hrs',
        quantity: cls.laborHours,
        hoursSource: cls.laborHoursSource,
        pricingBasis: hasMaterial ? 'labor-install-hourly' : 'labor-all-in-hourly',
      });
    }

    return { lines };
  },
});
```

---

### `src/features/estimate-extraction-pipeline/classification/index.ts`
**Action:** Modify — `classifyLines()` deleted outright.

#### After
```ts
/**
 * THE DOOR — classification's complete public contract. `pipeline.ts`
 * composes these steps directly; nothing in this module calls
 * `.generate()`/`.stream()` by hand anywhere.
 */
export { billableLineSchema, type BillableLine } from './schema';
export {
  buildClassificationPrompt,
  lineClassifierAgentStep,
  buildLinesStep,
} from './steps';
/** Re-exported for Mastra-instance registration ONLY — no module calls this directly. */
export { lineClassifierAgent } from './agent';
```

---

### `src/features/estimate-extraction-pipeline/pipeline.ts`
**Action:** Modify — full rewrite.

#### After
```ts
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  buildExtractionPrompt,
  findingExtractorAgentStep,
  resolveFindingsStep,
  meaningfulSentenceSchema,
} from './extraction';
import {
  buildClassificationPrompt,
  lineClassifierAgentStep,
  buildLinesStep,
  billableLineSchema,
} from './classification';
import { priceLines, pricedLineItemSchema } from './pricing';
import { parsePdfFromUrl, parsedDocumentSchema } from './document';

/**
 * The composition root. Every agent call in this workflow is a native
 * `createStep(agent, { structuredOutput })` step (extraction, classification)
 * or an already-compliant `execute()`-based call for the one documented
 * exception (pricing, which needs per-line conditional schema selection).
 * No hand-rolled `.generate()`/`.stream()` orchestration anywhere in this
 * file or the modules it composes. See
 * plans/MASTRA-AGENT-WORKFLOW-STANDARD.md.
 */

/**
 * Named, shared — NOT redeclared inline at both `parseDocumentStep` and
 * `summarizeEstimateWorkflow` itself. Mastra's own stated core principle
 * (docs/workflows/control-flow: "The first step's inputSchema must match
 * the workflow's inputSchema") means these two HAVE to stay identical;
 * an earlier draft of this plan declared the same z.object() literal
 * twice, in two different places, with nothing but hand-editing
 * discipline keeping them in sync — exactly the kind of duplication
 * `outputSchema: priceStep.outputSchema` (below) already correctly
 * avoids on the output side of this same `createWorkflow()` call.
 */
const summarizeEstimateInputSchema = z.object({
  estimateRequestId: z.string(),
  fileUrl: z.string().url(),
  zipCode: z.string(),
});

const parseDocumentStep = createStep({
  id: 'parse-document',
  inputSchema: summarizeEstimateInputSchema,
  outputSchema: z.object({ parsedDocument: parsedDocumentSchema }),
  retries: 2,
  execute: async ({ inputData }) => ({
    parsedDocument: await parsePdfFromUrl(inputData.fileUrl),
  }),
});

const priceStep = createStep({
  id: 'price',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    lines: z.array(billableLineSchema),
    parsedDocument: parsedDocumentSchema,
    sentences: z.array(meaningfulSentenceSchema),
  }),
  outputSchema: z.object({
    lines: z.array(billableLineSchema),
    prices: z.array(pricedLineItemSchema),
    parsedDocument: parsedDocumentSchema,
    sentences: z.array(meaningfulSentenceSchema),
  }),
  execute: async ({ inputData }) => {
    const priced = await priceLines({
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      lines: inputData.lines,
    });
    return {
      ...priced,
      parsedDocument: inputData.parsedDocument,
      sentences: inputData.sentences,
    };
  },
});

export const summarizeEstimateWorkflow = createWorkflow({
  id: 'summarize-estimate',
  inputSchema: summarizeEstimateInputSchema,
  outputSchema: priceStep.outputSchema,
})
  .then(parseDocumentStep)
  // Build the extraction prompt. A bare `.map()`, not a named step —
  // matches Mastra's own canonical "prompt right before an agent step"
  // pattern (docs/workflows/agents-and-tools) exactly. The actual
  // formatting logic lives in `buildExtractionPrompt`
  // (extraction/steps.ts); this file only calls it.
  .map(async ({ inputData }) => ({
    prompt: buildExtractionPrompt(inputData.parsedDocument),
  }))
  .then(findingExtractorAgentStep)
  .then(resolveFindingsStep)
  // Build the classification prompt — same reasoning as above.
  .map(async ({ inputData }) => ({
    prompt: buildClassificationPrompt(inputData.findings),
  }))
  .then(lineClassifierAgentStep)
  // Recombine the classifier's per-finding output with the findings it
  // was classifying (the classifier never re-echoes
  // action/scope/location/sourceQuote — buildLinesStep needs them).
  .map(async ({ inputData, getStepResult }) => ({
    findings: getStepResult(resolveFindingsStep).findings,
    classifications: inputData.lines,
  }))
  .then(buildLinesStep)
  // Recombine the built lines with everything priceStep needs that
  // fell out of the agent-step data flow: the workflow's own init data
  // (estimateRequestId, zipCode) and the parsed document from several
  // steps back (kept for the report's debug panel). sentences come from
  // resolveFindingsStep, several steps back as well.
  //
  // getInitData<...> uses an explicit inline type matching this
  // workflow's own declared inputSchema, NOT `typeof summarizeEstimateWorkflow`.
  // The Standard's own Rule 2 quote is subtly split on this: the doc's
  // PROSE says `getInitData<typeof workflow>()`, but the doc's own CODE
  // EXAMPLE right below that prose actually uses `getInitData<any>()` —
  // Mastra's own shipped example avoids self-referencing the workflow's
  // type from inside a callback defined within that same workflow's own
  // initializer chain, which is a real, plausible TS circular-inference
  // trap (the callback's return type feeds the chain's inferred type,
  // which the callback's own type annotation would be referencing).
  // Explicit inline type sidesteps this entirely without falling back to
  // `any`.
  .map(async ({ inputData, getInitData, getStepResult }) => {
    const init = getInitData<{ estimateRequestId: string; zipCode: string; fileUrl: string }>();
    const { parsedDocument } = getStepResult(parseDocumentStep);
    const { sentences } = getStepResult(resolveFindingsStep);
    return {
      estimateRequestId: init.estimateRequestId,
      zipCode: init.zipCode,
      lines: inputData.lines,
      parsedDocument,
      sentences,
    };
  })
  .then(priceStep)
  .commit();
```

---

### `AGENTS.md`
**Action:** Modify

#### Before
```
    grep -rn "from '.*\/extraction\/\(schema\|agent\|scorer\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/extraction/"
    grep -rn "from '.*\/classification\/\(schema\|agent\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/classification/"
```

#### After
```
    grep -rn "from '.*\/extraction\/\(schema\|agent\|scorer\|steps\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/extraction/"
    grep -rn "from '.*\/classification\/\(schema\|agent\|steps\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/classification/"
```

## Validation Plan

1. **Live-verify Rule 5's open question FIRST, before trusting this
   pattern for real traffic**: does `createStep(agent, { structuredOutput })`
   use `.generate()` or `.stream()` internally? Run the full-document
   `findingExtractorAgentStep` composition against the real 42-page
   Sparrow House document (the same one already used to prove/disprove
   the `.generate()` 504 timeout this session) and confirm it completes
   without a Gateway Timeout.
   **Concrete fallback if it times out** (not a vague "exception," a
   specific alternative): revert `findingExtractorAgentStep`/
   `lineClassifierAgentStep` from the bare `createStep(agent, ...)` form
   to Rule 1's own documented exception — a plain
   `createStep({ id, inputSchema, outputSchema, execute })` whose
   `execute()` calls `agent.stream(...)` directly and returns
   `await stream.object`. This is NOT a reversion to the deleted
   hand-rolled code: the drain loop is confirmed unnecessary regardless
   (Rule 4), so the fallback is still `.stream()` + `await stream.object`,
   nothing more — nowhere near the full `extractFindings()`/
   `classifyLines()` functions this plan deletes. Only the transport
   detail (explicit `.stream()` vs. whatever `createStep(agent, ...)`
   does internally) changes; the surrounding step composition
   (`buildExtractionPrompt`/`resolveFindingsStep`/etc.) is unaffected
   either way.
2. **Live-verify `structuredOutput.model` passthrough**: confirm
   `lineClassifierAgentStep` (tools + `structuredOutput.model` combo)
   actually executes real tool calls and returns a validly-shaped
   `{ lines: [...] }` — same check already proven for the hand-rolled
   version, must be re-proven for the native-step version since the
   internal call path is different and unverified.
2a. **In the same live run, confirm both `getStepResult(resolveFindingsStep)`
   calls return real data, not `undefined`** — the one right after
   `lineClassifierAgentStep` and the one after `buildLinesStep`. See Risk
   Notes: no fetched doc example reaches back this far in a chain.
2b. **Deliberately force a structured-output validation failure** (e.g.
   temporarily feed `findingExtractorAgentStep` a schema the model can't
   satisfy) and confirm the WORKFLOW RUN actually fails/throws visibly —
   not that it silently produces `undefined`/garbage that a downstream
   step accepts anyway. This validates the assumption in Existing Pattern
   Audit that `StructuredOutputProcessor` fails the step on its own,
   replacing the deleted `if (!result.object) throw` checks. If this
   assumption is wrong, that explicit check needs to come back — as a
   step in the chain, not inside a hand-rolled function (Rule 1 still
   applies to the fix).
3. `pnpm exec tsc --noEmit` — clean.
4. `pnpm exec eslint <all touched files>` — clean.
5. One-door boundary gate, all four grep patterns from the updated
   `AGENTS.md` — zero results.
6. `grep -rn "extractFindings\|classifyLines\|stream.textStream\|for await.*textStream" src/` —
   zero results, confirming the hand-rolled functions and the drain loop
   are gone, not just unused.
7. `pnpm build` — clean.
8. Live test against the real Sparrow House PDF (or any real report) via
   `pnpm dev` — same checks already established this session: 34/34
   findings extracted, the "trim or wood siding" finding produces two
   correctly-unit-typed material lines under one finding, no null
   quantities anywhere, real cited `amountSource`/`hoursSource`.

## Risk Notes

- **Rule 5's transport question is the single highest risk in this plan**
  and is explicitly unresolved by any documentation fetched this session.
  If `createStep(agent, {...})` turns out to use `.generate()`
  internally, the 504 Gateway Timeout this session spent real effort
  discovering and fixing could resurface, silently, the moment this ships
  — because the fix (`.stream()` + manual object read) is exactly the
  hand-rolled code this plan deletes. Do not skip Validation step 1.
- **`modelSettings`/`maxSteps` moved to `defaultOptions`** is a
  reasonable, sourced design choice, but was not exercised end-to-end in
  this session before being written into this plan — confirm at
  implementation time that `defaultOptions` actually applies when the
  agent is invoked via `createStep(agent, ...)` and not only via direct
  `.generate()`/`.stream()` calls (the doc's own wording — "Default
  options used when calling `stream()` and `generate()`" — doesn't
  explicitly confirm the agent-as-step composition path routes through
  the same defaulting logic).
- **More steps, more step-boundary overhead** than the hand-rolled
  version — each `.then()`/`.map()` is a real workflow step with its own
  schema validation. This is the tradeoff for zero hand-rolled transport
  code; expected to be negligible relative to the LLM call latency itself
  (seconds of network+model time vs. microseconds of schema validation),
  but not measured.
- **Retry granularity changes, and the previously-written fallback for it
  was factually wrong — corrected here.** The old design put `retries: 2`
  on one coarse `extractStep`/`classifyStep` wrapping the whole
  generate-and-resolve sequence. The new design has no single step to
  attach `retries` to for the same blast radius — `findingExtractorAgentStep`
  alone retrying doesn't re-run `resolveFindingsStep` if THAT fails, and
  vice versa. Whether `createStep(agent, ...)` even accepts a `retries`
  option is unverified (no example shows it).
  An earlier draft of this Risk Note claimed "the documented fallback is
  wrapping the whole sub-chain in a nested workflow, mirroring
  `pricing/workflow.ts`'s existing `pricingFanoutWorkflow` pattern" — that
  citation was wrong. `pricingFanoutWorkflow` does not use a `retries`
  option at all; its actual resilience mechanism is `price-line.ts`'s own
  `try/catch` inside `execute()`, degrading to a `'lookup-failed'` price
  per line rather than retrying anything. That pattern does not
  demonstrate "nested workflows support retries" — it demonstrates a
  different technique entirely, and citing it as precedent for the former
  was an unverified claim dressed as a sourced one.
  **Correct, honest state of this question: NO verified fallback exists
  yet if per-step `retries` on `createStep(agent, ...)` turns out
  unsupported.** Two real (not yet verified) options to evaluate at
  implementation time, not to assume: (a) confirm whether `retries` is
  simply accepted by `createStep(agent, ...)` the same as the plain
  `createStep({execute})` form — untested, may just work; (b) if not,
  apply `pricingFanoutWorkflow`'s ACTUAL pattern — wrap the agent call in
  an `execute()`-based step with its own `try/catch`, producing a typed
  failure/success result the next step can branch on — not a retry
  mechanism, a degrade-gracefully mechanism, which is a different
  guarantee than what the old `retries: 2` provided and would need to be
  consciously accepted as such.
- **Dedup removal is a real behavior change, not a no-op cleanup.** If a
  future extraction run ever DOES emit two findings for the same
  sentence + action (a prompt-compliance failure, not expected but not
  provably impossible), this design now bills it as two lines instead of
  silently merging them. Validation step 8 should include a check for
  duplicate `sourceQuote` values in the final `lines` output on the real
  test document, specifically because this safety net was just removed.
- **`getStepResult()` is used further back in the chain than any fetched
  doc example demonstrates.** Every `getStepResult()` example in
  `reference/workflows/workflow-methods/map` / `docs/workflows/control-flow`
  reaches back exactly ONE step — `.then(step1).map(({getStepResult}) =>
  getStepResult(step1))`, called immediately after that step runs. This
  plan calls `getStepResult(resolveFindingsStep)` twice, several steps
  AFTER it actually ran (once after `lineClassifierAgentStep`, again
  after `buildLinesStep`) — reaching back multiple links in a long chain,
  not just the immediately preceding one. Nothing fetched this session
  confirms or denies that `getStepResult()` reliably holds onto a step's
  output for the full remaining duration of a long workflow run. Add this
  to Validation step 1's live check — if `getStepResult(resolveFindingsStep)`
  returns `undefined`/stale data at either of its two call sites, that's
  a structural problem with this plan's whole data-carrying approach, not
  a minor bug to patch around.

## Approval

`Status: Awaiting explicit user approval. Do not implement yet.`
