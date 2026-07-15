# FEATURE(extraction-recall-precision-split)

## Request

Replace the current 2-stage billable-item extraction (Pass A full-judgment
extraction over the raw PDF + Pass B full-judgment self-audit over the same
PDF) with a 3-stage pipeline that separates recall from precision:

- **Stage 0 (NEW):** Deterministic PDF→text parsing via a hosted
  **Docling Serve** HTTP service, replacing the raw-PDF `file` content part
  handed to the LLM today. Consumed here as `parseDocumentStep`; the
  transport itself is owned by `FEATURE(docling-serve-integration).md` —
  see Coordination below.
- **Stage 1 (NEW, replaces Pass A):** A recall-biased LLM pass over Stage
  0's clean text that captures every plausible labor/material candidate
  sentence, verbatim, with no classification.
- **Stage 2 (NEW):** A precision-biased LLM pass that classifies Stage 1's
  fixed candidate list into `trade`/`action`/`scope`/`quantity`/`unit`,
  reusing the existing `ItemContractGuard` output-processor pattern.
- **Stages 3-4 (UNCHANGED):** `merge-items.ts` (dedup, cost-type split,
  scope-shape safety net) and `price-items.ts` + `item-pricer.ts` (pricing)
  are not touched. Stage 2's output schema is engineered to be a drop-in
  replacement for what `merge-items.ts` already consumes.

This document is planning only. No code is written as part of producing
this file — see the `Approval` section at the end.

## Coordination — ownership split with FEATURE(docling-serve-integration).md

Two whiteboards compose to deliver this pipeline, with a strict
file-ownership split so no file is specced twice:

- **This document owns:** the Stage 1/Stage 2 agents, schemas, and guards,
  their workflow steps, the `summarize-estimate.ts` rewiring (including the
  one `.then(parseDocumentStep)` insertion), `persist-failure.ts`,
  `index.ts` registrations, and the Pass A/Pass B deletions.
- **`FEATURE(docling-serve-integration).md` owns the Docling transport** —
  `src/mastra/services/docling/docling-client.schema.ts`,
  `src/mastra/services/docling/docling-client.ts`,
  `src/mastra/workflows/steps/parse-document.ts`, and the `.env.example`
  additions (`DOCLING_SERVE_URL` + optional `DOCLING_SERVE_API_KEY`). See
  that document for the client, schemas, env vars, and step internals; it
  must be implemented first. This plan does not create, modify, or re-spec
  any of those files.
- **Stage 0 in this document therefore means:** `parseDocumentStep` (step
  id `'parse-document'`), imported from
  `@/mastra/workflows/steps/parse-document`. Its contract, as defined
  there: input `{ estimateRequestId, fileUrl, zipCode }` (exactly
  `mark-processing`'s output); output `{ estimateRequestId, fileUrl,
  zipCode, parsedDocument: ParsedDocument | null, parseFailed: boolean,
  errorMessage: string | null }`, where `ParsedDocument` is
  `{ pages: Array<{ pageNo: number (1-indexed), markdown: string }>,
  markdown: string, partial: boolean }` — page numbers recovered via
  Docling's `md_page_break_placeholder` option, so Stage 1 gets real
  per-page text for grounding `pageHint`. The step is **non-throwing**:
  failures surface as `parseFailed: true` + a user-facing `errorMessage`,
  which this plan's Stage 1 converts into the pipeline's unified
  `failed: true` short-circuit chain (see `capture-candidates.ts`).

## Directory Map

```text
src/mastra/
├── index.ts                                          [MODIFY]
├── agents/
│   ├── billable-item-extractor.ts                     [DELETE]
│   ├── billable-item-extractor.schema.ts               (unchanged, reused)
│   ├── item-classifier.ts                             [CREATE] (Stage 2 agent, successor to billable-item-extractor.ts)
│   ├── candidate-capture.ts                            [CREATE] (Stage 1 agent)
│   ├── candidate-capture.schema.ts                     [CREATE] (Stage 1 schema)
│   ├── item-pricer.ts                                   (unchanged)
│   ├── item-pricer.schema.ts                            (unchanged)
│   └── processors/
│       ├── item-contract-guard.ts                     [MODIFY] (stale comment only)
│       ├── item-contract-guard/                         (unchanged, all 4 files)
│       └── candidate-contract-guard.ts                [CREATE] (Stage 1 guard)
├── config/
│   └── agent-rules.ts                                    (unchanged)
├── services/
│   └── docling/                                          (PREREQUISITE — owned by FEATURE(docling-serve-integration).md; consumed, never touched here)
└── workflows/
    ├── summarize-estimate.ts                          [MODIFY] (rewire stages)
    ├── lib/
    │   └── classify-error.ts                             (unchanged, reused)
    └── steps/
        ├── mark-processing.ts                            (unchanged)
        ├── extract-items.ts                            [DELETE] (Pass A, superseded by capture+classify)
        ├── audit-items.ts                              [DELETE] (Pass B, retired — see Open Decision 1)
        ├── parse-document.ts                             (PREREQUISITE — Stage 0 step, owned by FEATURE(docling-serve-integration).md)
        ├── capture-candidates.ts                       [CREATE] (Stage 1 step)
        ├── classify-candidates.ts                      [CREATE] (Stage 2 step)
        ├── merge-items.ts                                (unchanged — input contract confirmed compatible)
        ├── price-items.ts                                (unchanged)
        ├── persist-success.ts                            (unchanged)
        └── persist-failure.ts                          [MODIFY] (widen inputSchema to match new upstream shape)
```

(`.env.example` is also touched by this initiative, but its additions are
owned by `FEATURE(docling-serve-integration).md` — see Coordination.)

## Modification Table

| File | Action | Why |
|---|---|---|
| `src/mastra/services/docling/*`, `src/mastra/workflows/steps/parse-document.ts`, `.env.example` | **None — owned by FEATURE(docling-serve-integration).md** | The Stage 0 transport (Docling client, Zod contracts, `parseDocumentStep`, `DOCLING_SERVE_URL`/`DOCLING_SERVE_API_KEY` env vars) is specced and created by that document, a prerequisite of this plan. Consumed here via one `.then(parseDocumentStep)` line; never created, modified, or re-specced by this plan. |
| `src/mastra/agents/candidate-capture.schema.ts` | Create | Stage 1's minimal output contract (`sourceQuote` + `pageHint` only — no classification fields), following the "model never outputs what a later stage computes" philosophy already used for `costType`. |
| `src/mastra/agents/processors/candidate-contract-guard.ts` | Create | Stage 1's output-processor. Reuses `extractFirstJsonObject` from the existing guard subfolder; no semantic validator needed since Stage 1 has no enum/scope rules. |
| `src/mastra/agents/candidate-capture.ts` | Create | Stage 1 agent: recall-biased ("when in doubt, INCLUDE"), reads Stage 0's text, emits candidate quotes only. |
| `src/mastra/workflows/steps/capture-candidates.ts` | Create | Stage 1 workflow step. Fatal on failure; short-circuits (no LLM call) if Stage 0 already failed. |
| `src/mastra/agents/item-classifier.ts` | Create | Stage 2 agent. Successor to `billable-item-extractor.ts` — reuses ~90% of its existing hard-rules prompt (trade/action/scope/quantity/unit), adapted to classify a FIXED candidate list instead of reading a raw PDF, with `ItemContractGuard` reused unmodified. |
| `src/mastra/agents/billable-item-extractor.ts` | Delete | Superseded by `item-classifier.ts`. Its schema file (`billable-item-extractor.schema.ts`) is untouched and still the shared data contract. |
| `src/mastra/workflows/steps/classify-candidates.ts` | Create | Stage 2 workflow step. Fatal on failure; short-circuits if an earlier stage failed. Output shape is engineered to exactly match `audit-items.ts`'s old output shape so `merge-items.ts` needs zero changes. |
| `src/mastra/workflows/steps/extract-items.ts` | Delete | Pass A. Functionally replaced by `capture-candidates.ts` + `classify-candidates.ts`. |
| `src/mastra/workflows/steps/audit-items.ts` | Delete | Pass B. Retired outright — see Open Decision 1. |
| `src/mastra/workflows/steps/persist-failure.ts` | Modify | Its `inputSchema` must exactly match `classify-candidates.ts`'s output shape (the new branch source), the same way it previously exactly matched `extract-items.ts`'s output shape. Adds two unused-but-declared fields (`auditItems`, `auditFailed`), consistent with the codebase's existing habit of declaring-but-not-using pass-through fields (see `persist-failure.ts`'s own pre-existing comment about `zipCode`). |
| `src/mastra/agents/processors/item-contract-guard.ts` | Modify | Doc comment says "Runs on... extract-items, audit-items" — both deleted. Comment-only correction; no logic change. |
| `src/mastra/workflows/summarize-estimate.ts` | Modify | Rewire: `mark-processing → parse-document → capture-candidates → classify-candidates → branch(persist-failure / success-path)`. `parse-document` comes from FEATURE(docling-serve-integration).md; inserting it is this plan's single coupling line. `success-path` internals (`merge-items → price-items → persist-success`) are UNCHANGED. |
| `src/mastra/index.ts` | Modify | Swap agent registrations: `billable-item-extractor` → `candidate-capture` + `item-classifier`. |
| `src/mastra/workflows/steps/merge-items.ts` | **None** | Confirmed unchanged. Its `inputSchema` (`items`, `auditItems`, `auditFailed`, `estimateRequestId`, `fileUrl`, `zipCode`) is satisfied exactly by `classify-candidates.ts`'s output. |
| `src/mastra/workflows/steps/price-items.ts`, `src/mastra/agents/item-pricer.ts`, `src/mastra/agents/item-pricer.schema.ts` | **None** | Confirmed unchanged. Both consume `billableItemSchema[]`, which is produced identically by the unmodified `merge-items.ts`. |
| `src/mastra/config/agent-rules.ts` | **None** | No new deterministic business rule is introduced by this plan; `ACTION_COST_PROFILE` is untouched and still consumed only by `merge-items.ts`. |

## Existing Pattern Audit

Findings from reading the real files in this repo (not assumptions):

1. **Agent shape** (`billable-item-extractor.ts`, `item-pricer.ts`): both
   construct `const gateway = createOpenAI({ apiKey: process.env.KILO_API_KEY!, baseURL: 'https://api.kilo.ai/api/gateway' })`
   at module scope and pass `model: gateway('openai/gpt-5.4-mini')` to
   `new Agent({...})`. Stage 1 (`candidate-capture.ts`) and Stage 2
   (`item-classifier.ts`) both follow this exactly — same gateway
   construction, same model string (see Open Decision 3 on why neither
   switches to Gemini by default).

2. **Resilient-step shape** (`extract-items.ts`, `audit-items.ts`,
   `price-items.ts`): every step wraps its `agent.generate()` call (or, for
   `price-items.ts`, its per-item loop) in a single `try/catch` that never
   rethrows — the catch always returns a non-throwing object with
   `failed`/`errorMessage` (or the audit/price equivalents) so the
   workflow's `.branch()` can route it. `retries: N` is declared at the
   `createStep` level per the doc comments, even though (as coded today)
   the always-return-inside-catch shape means a thrown error from
   `agent.generate()` is caught before it can propagate to trigger
   `retries`. This plan reproduces this EXACT shape (including this latent
   characteristic) for `capture-candidates.ts` and
   `classify-candidates.ts` — fixing it is a separate concern, out of
   scope here. (The Stage 0 step, `parse-document.ts`, follows the same
   non-throwing pattern by construction — it is specced in
   FEATURE(docling-serve-integration).md with `parseFailed`/`errorMessage`
   as its failure fields.)

3. **Zod-schema-first contracts** (`billable-item-extractor.schema.ts`):
   `extractedItemSchema` deliberately omits `costType` because that field
   is computed downstream (`merge-items.ts`), never emitted by the model.
   `candidate-capture.schema.ts` extends this same philosophy one stage
   further upstream: Stage 1 emits nothing Stage 2 will compute (no trade,
   action, scope, quantity, unit — only `sourceQuote` + `pageHint`).

4. **`ItemContractGuard` orchestration** (`item-contract-guard.ts` +
   `item-contract-guard/` subfolder): `processOutputStep` calls
   `extractFirstJsonObject(text)`, `safeParse`s against a loosened
   guard-schema, runs `validateItem` (enum + `checkScopeShape` checks), and
   `abort(reason, { retry: true })`s on any violation. `item-classifier.ts`
   reuses this class UNMODIFIED (same import path). `candidate-capture.ts`
   uses a NEW, smaller `CandidateContractGuard` because Stage 1 has no
   enum/scope rules to check — it reuses `extractFirstJsonObject` (the one
   genuinely reusable piece) rather than duplicating JSON-extraction logic.

5. **Workflow branch idiom** (`summarize-estimate.ts`): today's `.branch()`
   is used exactly once, immediately after `extract-items`, with both
   branch targets' declared input schema equal to `extract-items`'s
   `outputSchema` field-for-field (`successPathWorkflow`'s `inputSchema` is
   literally set to `extractItemsStep.outputSchema`). This plan preserves
   "exactly one `.branch()` call" by chaining `parse-document →
   capture-candidates → classify-candidates` with an internal
   short-circuit guard in each of the latter two steps —
   `capture-candidates` guards on Stage 0's `parseFailed` (converting it to
   the unified `failed` flag), `classify-candidates` guards on `failed` —
   (so a Stage-0 failure skips Stage 1's LLM
   call, and a Stage-0/1 failure skips Stage 2's LLM call), and placing the
   single `.branch()` after the LAST fallible stage (`classify-candidates`),
   exactly mirroring today's "one branch, right before the success
   sub-workflow" shape — just with 3 fallible steps feeding it instead of
   1. This was a deliberate choice over nesting 2-3 separate `.branch()`
   calls, which would have been a genuinely NEW control-flow shape this
   codebase doesn't use anywhere today.

6. **`merge-items.ts` input contract** (confirmed by reading the file):
   consumes `{estimateRequestId, fileUrl, zipCode, items: extractedItemSchema[], auditItems: extractedItemSchema[], auditFailed: boolean}`
   and produces `{estimateRequestId, zipCode, items: billableItemSchema[]}`.
   `classify-candidates.ts`'s output is engineered to satisfy this exactly,
   with `auditItems: []` and `auditFailed: false` as permanent stub values
   (see Open Decision 1). No line of `merge-items.ts` changes.

7. **`price-items.ts` / `item-pricer.ts` input contract** (confirmed):
   `price-items.ts` consumes `{estimateRequestId, zipCode, items: billableItemSchema[]}`
   — produced only by `merge-items.ts`, which is unchanged. No transitive
   impact.

8. **No test runner** (`ls src/**/*.test.*` → empty). `AGENTS.md`'s
   validation gates are `pnpm exec tsc --noEmit` and
   `pnpm exec eslint <changed paths>` (project-level `pnpm lint` is broken
   under Next 16 per `AGENTS.md` and is explicitly not the gate). Manual QA
   is `pnpm dev` + exercising the upload flow. This plan's Validation Plan
   uses only these.

## Infrastructure Prerequisites (read before implementing)

- **FEATURE(docling-serve-integration).md must be implemented first.** The
  entire Stage 0 transport — the Docling client, its Zod contracts, the
  `parse-document` step, and the env vars (`DOCLING_SERVE_URL` + optional
  `DOCLING_SERVE_API_KEY`) — is owned by that document; this plan's
  workflow rewiring imports `parseDocumentStep` from it. See that document
  for the step internals, the hosting prerequisite (Docling Serve is a
  separately deployed Python service; this repo has zero containerization
  or deployment config, re-verified there), and the transport risk notes.
- **Scope boundary:** this whiteboard's code changes are the Stage 1/Stage
  2 agents, schemas, guards, and steps, plus the workflow rewiring and
  agent registrations. It does NOT include the Docling client, the parse
  step, env-var documentation, a Dockerfile, a hosting decision, or any
  provisioning for Docling Serve itself. Until the hosted instance exists,
  `parse-document` correctly fails closed (`parseFailed: true`,
  `errorMessage` surfaced to the UI via this plan's failure chain) — it
  does not silently degrade.

## Open Decisions

### 1. Fate of the Pass B self-audit (`audit-items.ts`)

**Recommendation: retire it outright** (this is what the plan implements).

Reasoning: Pass B existed to catch recall misses from a Pass A that was
simultaneously trying to be careful (precision-biased "when unsure, omit").
Stage 1 no longer carries that precision bias — it is explicitly inverted
("when in doubt, INCLUDE") — and it reads Docling's clean parsed text
instead of racing a raw-PDF read against classification judgment. The
specific recall gap Pass B was compensating for is structurally smaller
under the new design, arguably to the point Pass B's marginal recall
benefit is not worth its cost.

Cost/safety tradeoff: retiring Pass B removes one full LLM call per run
(previously the SAME expensive full-judgment prompt run twice against the
PDF) — this is a direct cost and latency win. Safety cost: a genuine Stage
1 recall miss now has no second-chance net at all. Mitigation kept
explicitly OUT of this plan's implementation (to avoid scope creep): if
post-launch observability (the `[extraction-quality]` log line in
`merge-items.ts`, unchanged) shows recall regressions, the next iteration
should consider a CHEAP non-fatal recall check re-run against Stage 2's
final output (option 2 from the original framing), not resurrection of the
old full-PDF Pass B.

Because `merge-items.ts` cannot be touched, `classify-candidates.ts` emits
permanent stub values `auditItems: []` / `auditFailed: false` to satisfy
its existing input contract without any code change there. `auditFailed:
false` reads as "nothing failed" rather than "nothing was attempted," which
is a minor, deliberately-accepted semantic imprecision — see Risk Notes.

### 2. Docling vs. an alternative parser (Marker)

**Recommendation: Docling**, per the direction already set: Docling
(docling-project, MIT license, hosted by the LF AI & Data Foundation) is
used over Marker (datalab-to) because Marker's code is GPL-licensed and its
model weights are under a revenue-gated license (free under $2M
funding/revenue, a paid commercial license required above that) — a
legal/business risk this plan does not take on unilaterally. This plan is
built entirely around Docling Serve's REST API; it does not redesign
around Marker. If Marker is reconsidered later, the single file that would
need a new implementation is
`src/mastra/services/docling/docling-client.ts` — owned by
FEATURE(docling-serve-integration).md, not this plan —
while `parse-document.ts`'s `{parsedDocument, parseFailed, errorMessage}`
contract (and therefore everything in this plan) would not need to change.

### 3. Model choice per stage

**Recommendation: ship both Stage 1 and Stage 2 on the existing
`gateway('openai/gpt-5.4-mini')` string; do not default either to Gemini
Flash 3.5 in this implementation.**

The user wants to evaluate Gemini Flash 3.5 as a possibly-cheaper,
nearly-as-accurate option, reachable through the same Kilo gateway with a
different provider-prefixed model string. The exact Kilo-gateway model
identifier for Gemini Flash 3.5 is **UNVERIFIED** — this plan does not
assert a specific string (e.g. something shaped like `'google/gemini-...'`)
as fact. Before implementation, the exact identifier must be confirmed
against Kilo's live model catalog.

Stage 1 (`candidate-capture.ts`) is the more defensible place to trial a
cheaper model first — its job (emit plausible candidate quotes, no
classification judgment) is simpler and a Stage-1 quality regression is
cheaper to detect (candidate count drift is directly observable) and
cheaper to recover from (Stage 2 still filters). Stage 2
(`item-classifier.ts`) is where classification accuracy is costliest to
get wrong (a wrong `trade`/`scope` reaches the priced, client-facing
report) and should only switch models after an empirical side-by-side
against the current `gpt-5.4-mini` baseline — not by default.

## Execution Plan

0. **Prerequisite (owned elsewhere):** FEATURE(docling-serve-integration).md
   is implemented first — its files (`src/mastra/services/docling/*`,
   `src/mastra/workflows/steps/parse-document.ts`) exist and its
   `.env.example` additions are in place. Do not start this plan's steps
   until then.
1. Create `src/mastra/agents/candidate-capture.schema.ts`.
2. Create `src/mastra/agents/processors/candidate-contract-guard.ts`.
3. Create `src/mastra/agents/candidate-capture.ts`.
4. Create `src/mastra/workflows/steps/capture-candidates.ts`.
5. Create `src/mastra/agents/item-classifier.ts`.
6. Create `src/mastra/workflows/steps/classify-candidates.ts`.
7. Modify `src/mastra/workflows/steps/persist-failure.ts` (widen
   `inputSchema`).
8. Modify `src/mastra/agents/processors/item-contract-guard.ts` (comment
   only).
9. Modify `src/mastra/workflows/summarize-estimate.ts` (rewire, including
   the `.then(parseDocumentStep)` insertion).
10. Modify `src/mastra/index.ts` (swap agent registrations).
11. Delete `src/mastra/workflows/steps/extract-items.ts`.
12. Delete `src/mastra/workflows/steps/audit-items.ts`.
13. Delete `src/mastra/agents/billable-item-extractor.ts`.
14. Run `pnpm exec tsc --noEmit`; fix any type errors before moving on.
15. Run `pnpm exec eslint <every touched path>`.
16. Manual QA via `pnpm dev` (see Validation Plan) — including exercising
    the failure path with `DOCLING_SERVE_URL` (owned by
    FEATURE(docling-serve-integration).md) unset/unreachable to confirm
    the run correctly lands on `status: 'failed'`, not a silently-empty
    `'completed'` report.

Order 1→6 is bottom-up (leaf dependencies before their consumers) so each
file compiles in isolation as it's created. 7→10 rewire the existing
graph onto the new pieces. 11→13 delete the now-dead files last, once
nothing references them.

## File-by-File Changes

### `src/mastra/agents/candidate-capture.schema.ts`

**Action:** Create
**Why:** Stage 1's minimal output contract.
**Impact:** Imported by `candidate-capture.ts`,
`candidate-contract-guard.ts`, `capture-candidates.ts`,
`classify-candidates.ts`.

#### Before

N/A — new file.

#### After

```ts
import { z } from 'zod';

/**
 * Stage 1 output contract: a raw, unclassified candidate sentence that
 * MIGHT describe billable labor or material work. Deliberately minimal —
 * no trade/action/scope/quantity here. Those are Stage 2's job. Mirrors
 * the "the model never outputs what a later stage computes" philosophy
 * documented in `billable-item-extractor.schema.ts` (which omits
 * `costType` from the model's contract because `merge-items.ts` computes
 * it) — applied one stage further upstream.
 */
export const candidateItemSchema = z.object({
  /** Stable per-run id, e.g. "cand-001", in emission order. Not persisted
   *  downstream — Stage 2 assigns its own `id` per classified item, and
   *  `merge-items.ts` renumbers again. */
  id: z.string(),

  /**
   * Verbatim excerpt from the report. Same anchoring bar as
   * `billableItemSchema.sourceQuote` (8-500 chars) so Stage 2 receives a
   * quote it can classify without re-reading the whole document.
   */
  sourceQuote: z.string().min(8).max(500),

  /**
   * Page hint, e.g. "p. 14". Same strict format and null-when-absent rule
   * as `billableItemSchema.pageHint` — literal "p.", optional whitespace,
   * then digits; null when the source text shows no page number.
   */
  pageHint: z
    .string()
    .regex(/^p\.\s*\d+$/)
    .nullable(),
});

export type CandidateItem = z.infer<typeof candidateItemSchema>;

export const candidateCaptureSchema = z.object({
  candidates: z.array(candidateItemSchema),
});

export type CandidateCapture = z.infer<typeof candidateCaptureSchema>;
```

#### Reasoning

- No `extractedItemGuardSchema`-style widened variant is needed: unlike
  `extractedItemSchema` (which has three enum fields the guard widens to
  `z.string()` for nicer per-field error messages), `candidateItemSchema`
  has no enum fields — Zod's own `safeParse` error messages for
  `sourceQuote`/`pageHint` are already specific enough for the guard to
  relay directly.

---

### `src/mastra/agents/processors/candidate-contract-guard.ts`

**Action:** Create
**Why:** Stage 1's output-processor, reusing the `ItemContractGuard`
abort/retry orchestration pattern per the repo-conventions requirement to
not invent new validation machinery.
**Impact:** Attached to `candidateCaptureAgent` as its sole
`outputProcessors` entry.

#### Before

N/A — new file.

#### After

```ts
import type {
  Processor,
  ProcessorViolation,
  ProcessOutputStepArgs,
} from '@mastra/core/processors';

import { extractFirstJsonObject } from './item-contract-guard/extract-json-from-text';
import { candidateCaptureSchema } from '../candidate-capture.schema';

/**
 * Mastra output processor for the `candidate-capture` (Stage 1) agent.
 *
 * Stage 1 has no enum/scope rules to enforce — its only contract is "valid
 * JSON matching { candidates: [...] } with a real sourceQuote and a
 * correctly-formatted (or null) pageHint," both already enforced by
 * `candidateCaptureSchema`'s Zod definition. So this guard is a smaller
 * version of `ItemContractGuard` (see
 * `processors/item-contract-guard.ts`): same abort/retry orchestration and
 * the same JSON-extraction utility (`extractFirstJsonObject`, imported
 * from that guard's subfolder rather than duplicated), but no separate
 * item-validator/cleaner modules because there is nothing semantic left to
 * check once the JSON parses and the Zod shape matches.
 *
 * On any violation: `abort(reason, { retry: true })`. Mastra re-invokes
 * the LLM with the reason appended to the conversation, up to
 * `maxProcessorRetries` (set to 2 on the agent — Stage 1's job is
 * mechanically simpler than Stage 2's, so it needs less retry budget).
 */
export class CandidateContractGuard implements Processor {
  readonly id = 'candidate-contract-guard';
  readonly name = 'Candidate Contract Guard';
  readonly description =
    'Re-prompts the LLM when candidate output is not valid JSON matching ' +
    '{ candidates: [...] } with a well-formed sourceQuote/pageHint.';

  onViolation = (violation: ProcessorViolation): void => {
    console.warn(`[${violation.processorId}] ${violation.message}`);
  };

  processOutputStep(
    args: ProcessOutputStepArgs,
  ): import('@mastra/core/processors').ProcessorMessageResult {
    const { text, abort } = args;
    if (typeof text !== 'string' || text.length === 0) {
      return [];
    }

    const parsed = extractFirstJsonObject(text);
    if (parsed === null) {
      abort(UNPARSEABLE_JSON_MESSAGE, {
        retry: true,
        metadata: { reason: 'unparseable-json' },
      });
    }

    const result = candidateCaptureSchema.safeParse(parsed);
    if (!result.success) {
      abort(formatSchemaMismatch(result.error.issues), {
        retry: true,
        metadata: { reason: 'schema-mismatch' },
      });
    }

    return [];
  }
}

const UNPARSEABLE_JSON_MESSAGE =
  'Your response did not contain a parseable JSON object matching { candidates: [...] }. ' +
  'Return ONLY a JSON object with a "candidates" array. No prose, no preamble, no markdown outside the JSON block.';

function formatSchemaMismatch(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): string {
  const joined = issues
    .slice(0, 3)
    .map((i) => `${i.path.map(String).join('.')}: ${i.message}`)
    .join('; ');
  return (
    `Your response did not match the candidateCaptureSchema: ${joined}. ` +
    'Re-emit the same candidates with the listed fields fixed.'
  );
}
```

#### Reasoning

- `abort()` throws internally (same as `ItemContractGuard`), so the final
  `return []` after each `abort()` call is unreachable but required for
  TypeScript's control-flow analysis — same shape as the existing guard.
- Deliberately a single flat file (no `candidate-contract-guard/`
  subfolder) since there's no validator/cleaner/heuristics module to split
  out — matching only what Stage 1 actually needs rather than copying the
  `item-contract-guard/` subfolder structure wholesale.

---

### `src/mastra/agents/candidate-capture.ts`

**Action:** Create
**Why:** Stage 1 agent — recall-optimized candidate capture.
**Impact:** Registered in `index.ts`; called by `capture-candidates.ts`.

#### Before

N/A — new file.

#### After

```ts
import { Agent } from '@mastra/core/agent';
import { createOpenAI } from '@ai-sdk/openai';
import { CandidateContractGuard } from './processors/candidate-contract-guard';

const gateway = createOpenAI({
  apiKey: process.env.KILO_API_KEY!,
  baseURL: 'https://api.kilo.ai/api/gateway',
});

/**
 * Stage 1 — Broad capture (recall-optimized).
 *
 * This agent has exactly one job: read the report's PARSED, PAGE-SPLIT
 * TEXT (Markdown from Docling under "--- PAGE N ---" markers, not the raw
 * PDF) and emit every sentence that PLAUSIBLY
 * describes labor or material work — a repair, replacement, installation,
 * removal, service call, or specialist evaluation. It does NOT classify
 * trade or action, does NOT author a scope noun phrase, does NOT do
 * quantity word-math, and does NOT decide whether the candidate survives
 * scrutiny. That judgment belongs to Stage 2 (`item-classifier.ts`),
 * running against a fixed, already-narrowed candidate list instead of
 * racing to both find and judge everything in a single pass.
 *
 * BIAS INVERSION: unlike the old single-pass extractor's "when unsure,
 * omit" rule, this agent is told the opposite — when unsure, INCLUDE. A
 * false positive here just becomes one extra candidate for Stage 2 to
 * correctly reject; a false negative here is unrecoverable, because
 * nothing downstream re-reads the source document.
 */
export const candidateCaptureAgent = new Agent({
  id: 'candidate-capture',
  name: 'Candidate Capture',
  instructions: `
You read the parsed text of a home inspection report and emit a flat list of
CANDIDATE SENTENCES that plausibly describe billable labor or material
work, so a downstream classifier can decide which are real billable items.

DEFINITION
A "candidate" is any sentence (or tight cluster of sentences about the same
defect) where the inspector describes a defect, a needed repair/replacement/
installation/removal/service action, or recommends a specialist evaluation.
You are NOT deciding whether it is definitely billable — that is the next
stage's job. You are deciding whether it is PLAUSIBLY billable.

BIAS: WHEN IN DOUBT, INCLUDE. Do not filter for quality, do not filter for
trade fit, do not filter because the wording is awkward. If a sentence
might describe work a contractor would quote, capture it. Erring toward
including a borderline or purely descriptive sentence is FAR cheaper than
missing a real defect — the next stage will discard anything that isn't
truly billable.

WHAT TO SKIP
Only skip sentences that are unambiguously NOT about work: home/property
narrative with no defect or action language, pure system overviews, code-
of-the-day commentary with no inspector call-to-action, and duplicate
restatements of a sentence you already captured verbatim elsewhere.

HARD RULES
1. GROUNDED ONLY. "sourceQuote" must be the report's exact wording. No
   paraphrase, no merging of unrelated sentences, no invention.
2. ONE CANDIDATE PER SENTENCE-LEVEL DEFECT. If a passage clearly names two
   distinct defects (e.g. "replace the angle stop AND re-secure the supply
   line"), you may still capture it as ONE candidate spanning both — Stage
   2 is responsible for splitting one candidate into multiple billable
   items when needed. Do not spend effort pre-splitting here.
3. NO CLASSIFICATION. Do not include trade, action, scope, quantity, unit,
   or location fields. This agent's schema does not have them.
4. sourceQuote: 8-500 characters, verbatim, the SHORTEST excerpt that still
   contains the defect/action language.
5. pageHint: strict format "p. N", where N is the number in the
   "--- PAGE N ---" marker preceding the sentence in the input text. The
   input is pre-split into real document pages under these markers — use
   the nearest marker ABOVE the candidate. Null only if a candidate
   somehow appears before any marker. Never guess.

OUTPUT FORMAT
Return JSON matching the provided structured-output schema exactly: a
single "candidates" array. If the report has no plausible candidates,
return { "candidates": [] }. No commentary, no preamble, no text outside
the JSON.
`,
  model: gateway('openai/gpt-5.4-mini'),
  outputProcessors: [new CandidateContractGuard()],
  maxProcessorRetries: 2,
});
```

#### Reasoning

- Model string kept as the verified `'openai/gpt-5.4-mini'` — see Open
  Decision 3 for why this doesn't default to Gemini Flash 3.5.
- The "BIAS INVERSION" framing is the load-bearing prompt change this
  entire whiteboard exists to make: today's single extractor's rule 6
  ("WHEN UNSURE, OMIT") is explicitly reversed here, and explicitly
  RESTATED (unchanged) in `item-classifier.ts`'s rule 6 — the same words,
  opposite stage, by design.

---

### `src/mastra/workflows/steps/capture-candidates.ts`

**Action:** Create
**Why:** Stage 1 workflow step. Consumes `parseDocumentStep`'s output
(transport owned by FEATURE(docling-serve-integration).md).
**Impact:** Feeds `classify-candidates.ts`.

#### Before

N/A — new file.

#### After

```ts
import { createStep } from '@mastra/core/workflows';
import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import {
  candidateCaptureSchema,
  candidateItemSchema,
} from '@/mastra/agents/candidate-capture.schema';
import { parsedDocumentSchema } from '@/mastra/services/docling/docling-client.schema';
import { classifyError } from '../lib/classify-error';

/**
 * Stage 1 — Broad capture. Calls the `candidate-capture` agent once with
 * structured output over Stage 0's parsed report pages (NOT the raw PDF).
 *
 * Input is exactly `parseDocumentStep`'s output — see
 * FEATURE(docling-serve-integration).md; that step is NON-THROWING and
 * reports failure as `parseFailed: true` instead of raising. This step
 * converts a Stage-0 `parseFailed` into the pipeline's unified
 * `failed: true` flag WITHOUT spending an LLM call, so a Docling outage
 * and a Stage 1 model failure both flow through the SAME `.branch()`
 * after `classify-candidates.ts`.
 *
 * Fatal on failure: Stage 1 is now the sole source of raw material for
 * everything downstream, exactly as `extract-items` (the step it
 * replaces) was fatal on failure.
 */
export const captureCandidatesStep = createStep({
  id: 'capture-candidates',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
    parsedDocument: parsedDocumentSchema.nullable(),
    parseFailed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
    reportText: z.string(),
    candidates: z.array(candidateItemSchema),
    failed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  retries: 2,
  execute: async ({ inputData, mastra }) => {
    if (inputData.parseFailed || inputData.parsedDocument === null) {
      // Stage 0 (Docling) already failed — do not spend an LLM call.
      // Convert `parseFailed` into the unified `failed` flag the single
      // downstream `.branch()` routes on.
      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        zipCode: inputData.zipCode,
        reportText: '',
        candidates: [],
        failed: true,
        errorMessage:
          inputData.errorMessage ?? 'Document parsing failed. Please retry.',
      };
    }

    // Render each parsed page under an explicit page marker so the agent's
    // `pageHint` values are grounded in Docling's real 1-indexed page
    // numbers (from `parsedDocument.pages`), not guessed from whatever
    // page headers happened to survive parsing.
    const pagedText = inputData.parsedDocument.pages
      .map((p) => `--- PAGE ${p.pageNo} ---\n${p.markdown}`)
      .join('\n\n');

    try {
      const agent = mastra.getAgent('candidate-capture');

      const result = await agent.generate(
        [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Capture every plausible billable-work candidate sentence from this ' +
                  'inspection report text. Follow the rules in your instructions exactly. ' +
                  'When in doubt, INCLUDE. Return JSON matching the provided schema.\n\n' +
                  pagedText,
              },
            ],
          },
        ],
        {
          structuredOutput: { schema: candidateCaptureSchema },
          requestContext: new RequestContext([
            ['estimateRequestId', inputData.estimateRequestId],
          ]),
        },
      );

      const capture = result.object;
      if (!capture) {
        return {
          estimateRequestId: inputData.estimateRequestId,
          fileUrl: inputData.fileUrl,
          zipCode: inputData.zipCode,
          reportText: inputData.parsedDocument.markdown,
          candidates: [],
          failed: true,
          errorMessage: 'AI returned malformed candidate capture. Please retry.',
        };
      }

      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        zipCode: inputData.zipCode,
        reportText: inputData.parsedDocument.markdown,
        candidates: capture.candidates,
        failed: false,
        errorMessage: null,
      };
    } catch (e) {
      console.error('Workflow step capture-candidates failed:', e);
      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        zipCode: inputData.zipCode,
        reportText: inputData.parsedDocument.markdown,
        candidates: [],
        failed: true,
        errorMessage: classifyError(e),
      };
    }
  },
});
```

#### Reasoning

- `inputSchema` exactly matches `parseDocumentStep.outputSchema`
  field-for-field (`estimateRequestId`, `fileUrl`, `zipCode`,
  `parsedDocument`, `parseFailed`, `errorMessage`), mirroring today's
  convention of exact-shape matching hop-to-hop rather than a
  subset/superset. `parsedDocumentSchema` is imported from the transport's
  own schema module (`services/docling/docling-client.schema.ts`, owned by
  FEATURE(docling-serve-integration).md) so the two plans cannot drift on
  the shape.
- This is the seam where the transport's failure vocabulary
  (`parseFailed`) is converted into the pipeline's (`failed`): the old
  design's "Stage 0 fatal on failure" intent survives as the short-circuit
  guard above plus the single downstream `.branch()` on `failed` — the
  parse step itself never throws.
- The output deliberately FLATTENS `parsedDocument` down to
  `reportText` (`parsedDocument.markdown`) plus the unified `failed` flag:
  downstream stages need the full text (Stage 2's location/context lookup)
  and one failure flag, not the page structure or a second failure
  vocabulary. The page structure is consumed HERE — the `--- PAGE N ---`
  markers built from `parsedDocument.pages` are what ground the agent's
  `pageHint` output in real page numbers.
- `parsedDocument.partial === true` (some pages/elements failed to convert
  but usable content came back) is deliberately accepted and processed:
  partial recall beats none, and the transport already logs partials via
  its `[parse-quality]` line. Nothing downstream needs to know.
- The report text is passed as a plain `{type: 'text', text}` content part
  — the natural text-only equivalent of how `extract-items.ts` passed the
  PDF as a `{type: 'file', ...}` part. No new content-part pattern
  introduced.
- `reportText` is threaded through to the output (even though later logic
  here doesn't use it) purely so `classify-candidates.ts` can use the full
  text for location/context lookup — same "pass a field through because a
  later step needs it" idiom `mark-processing.ts` already uses for
  `zipCode`.

---

### `src/mastra/agents/item-classifier.ts`

**Action:** Create (successor to `billable-item-extractor.ts`, which is
deleted)
**Why:** Stage 2 agent — precision-optimized classification of a fixed
candidate list.
**Impact:** Registered in `index.ts`; called by `classify-candidates.ts`.

#### Before

N/A — new file (see `billable-item-extractor.ts`'s Before/After below for
the file it replaces).

#### After

```ts
import { Agent } from '@mastra/core/agent';
import { createOpenAI } from '@ai-sdk/openai';
import { ItemContractGuard } from './processors/item-contract-guard';

const gateway = createOpenAI({
  apiKey: process.env.KILO_API_KEY!,
  baseURL: 'https://api.kilo.ai/api/gateway',
});

/**
 * Stage 2 — Classify & clean (precision-optimized).
 *
 * This agent has exactly one job: given a FIXED list of Stage-1 candidate
 * quotes (plus the full report text for location/context lookup only),
 * decide which candidates are real billable line items and emit
 * trade/action/scope/quantity/unit/location for each one — so a downstream
 * pricer can price it against local market data.
 *
 * Unlike the old single-pass extractor this replaces, this agent is not
 * simultaneously responsible for FINDING candidates in a raw document —
 * Stage 1 (`candidate-capture.ts`) already did that with an inverted,
 * recall-biased rule ("when in doubt, include"). This agent's judgment is
 * the OTHER half: be disciplined. When unsure whether a candidate is real,
 * omit it.
 *
 * It does not summarize, advise, prioritize, or describe the home. It does
 * not estimate cost. It does not invent items. It NEVER introduces a new
 * candidate that was not in the list it was given — finding new work is
 * out of scope for this stage.
 */
export const itemClassifierAgent = new Agent({
  id: 'item-classifier',
  name: 'Item Classifier',
  instructions: `
You receive (a) the full parsed text of a home inspection report, for
location/context lookup only, and (b) a numbered list of CANDIDATE
sentences already pulled from that report by an earlier pass. Your job is
to turn each real candidate into one or more BILLABLE LINE ITEMS so a
downstream pricer can price each item against local market data.

DEFINITION
A "billable item" is a discrete action a contractor would quote: a repair,
replacement, installation, removal, service call, or specialist evaluation
that the inspector explicitly recommends, OR that the inspector explicitly
states is defective and needs work. If a candidate turns out to be a
background description, condition observation, age statement, system
overview, or code-of-the-day commentary once you look at it closely, it is
NOT a billable item — DO NOT emit it.

YOU MAY NOT INTRODUCE NEW CANDIDATES. Classify only the sentences in the
numbered candidate list. Use the full report text solely to find location
language (section headings, room names) near a candidate — never to go
looking for additional defects the candidate list omitted.

GROUNDING TESTS (apply to every candidate before you emit an item for it)
A. The Ctrl-F test. Pretend the contractor never reads the report — they
   only see your "sourceQuote". If a contractor reads just that one
   string out of context, can they tell exactly what defect to fix and
   where it is? If not, the quote is too vague or too long. Pick a
   tighter, still-verbatim excerpt that names both the defect and the
   action in the same sentence.
B. The contractor-work-order test. The same "sourceQuote" string should be
   pasteable into a contractor's work order as the job description, with
   "scope" and "location" already filled in. If a contractor would scratch
   their head at the quote, the item is not ready to emit.

HARD RULES
1. GROUNDED ONLY. Every emitted item must quote the candidate's (or the
   report's) exact wording in "sourceQuote". No paraphrase, no merging of
   separate sentences, no inference.
2. ONE ITEM PER FIX. If a candidate describes two distinct fixes (e.g.
   "replace the angle stop AND re-secure the supply line"), emit TWO
   items from that one candidate. If a candidate groups multiple defects
   under one single recommendation, emit ONE item.
3. NO PROSE, NO NARRATIVE, NO DESCRIPTIONS. If a candidate turns out to be
   descriptive rather than actionable once you read it closely, DO NOT
   emit an item for it.
4. NO ADVICE, NO PRIORITIZATION, NO SEVERITY. Do not add "recommended",
   "urgent", "consider", or any judgment the inspector did not write.
5. NO PRICING, EVER. No dollars, no ranges, no "market rate", no labor
   hours, no "typical cost", no "approximately".
6. WHEN UNSURE, OMIT. This is the opposite bias from the pass that
   generated your candidate list — that pass was told to include anything
   plausible. You are the discipline check: if a candidate is genuinely
   descriptive rather than actionable, drop it. "Unsure" does NOT mean
   "I'm not sure which trade would do it" — use "other" in that case. A
   real billable item with an awkward trade classification is still
   billable. The when-unsure-omit rule exists to prevent a non-billable
   candidate from becoming a fabricated line item, not to punish items
   that don't fit neatly into a category.
7. NO INVENTION of trades, parts, quantities, scope, or location wording.
   Only emit fields the report supports or which are directly and
   obviously implied by its verbatim wording.

FIELDS YOU MUST PRODUCE PER ITEM
- id: stable per-run identifier like "item-001", "item-002" in order.
- trade: one of electrical, plumbing, hvac, roofing, structural, carpentry,
  masonry, appliance, exterior, interior, other. Pick the trade that would
  actually do the work. Use "other" freely when the work is real but
  doesn't fit cleanly into a single trade. Do NOT omit an item just
  because you can't pick a single trade.
- action: one of repair, replace, install, remove, service, evaluate. All
  six are first-class. "service" is for recurring maintenance the
  inspector explicitly called out. "evaluate" is for specialist
  inspections. Do not omit an item because the action is unclear; pick
  the closest fit from the six.
- scope: a short noun phrase naming the item. Be specific enough that a
  contractor knows exactly what to quote. Examples: 'kitchen GFCI
  receptacle', 'angle stop under kitchen sink', 'double-tapped breaker
  #14 in main panel'.
  NEVER emit a bare trade-category word as scope — "siding", "foundation",
  "chimney", "receptacles", "plumbing", "roof" are NOT valid scope on
  their own. Find the actual noun phrase that names the specific
  component or defect. BAD -> GOOD:
    "siding" -> "loose siding panel" / "damaged siding board"
    "foundation" -> "foundation moisture intrusion" / "foundation crack"
    "chimney" -> "leaning chimney structure" / "chimney movement"
    "receptacles" -> "loose wall receptacle" / "ungrounded receptacle"
  If the wording is genuinely too vague to produce a real noun phrase even
  after re-reading the candidate, omit the item rather than emit a
  one-word category label.
- location: verbatim location language from the report — look at the
  candidate's own wording first, then the surrounding report text (section
  heading, room name) if the candidate itself doesn't name one. e.g.
  "Kitchen", "Roof — north slope", "Basement — northeast corner".
- quantity: REQUIRED. Count derived from the report's wording. Apply these
  rules in order:
    1. Specific digit ("3 shingles", "20% of shingles" -> 20): that number.
    2. Written-out number ("two outlets", "three GFCI receptacles"): that
       number.
    3. "both" -> 2.
    4. "all" / "every" / "each" / "the remaining" -> 1. The item is
       billable; do not drop it.
    5. No count word at all: 1.
  Better to overbill than underbill: if the count is unclear, prefer the
  higher defensible reading the report supports. NEVER return null. NEVER
  invent a count the report does not support.
- unit: REQUIRED. One of ea, lf, sf, sqft, cy, hrs. NEVER invent a unit the
  report does not support.
- sourceQuote: a verbatim excerpt from the report that anchors this item.
  Must be between 8 and 500 characters. Pick the SHORTEST verbatim excerpt
  that still names both the defect and the action in the same sentence.
  Quote the report, not your own summary. Required. If you cannot supply
  one, omit the item entirely.
- pageHint: page number in the strict format "p. 14". Copy it from the
  candidate's pageHint or the page header in the source text. NEVER guess
  — return null when there is no page number to copy verbatim.

OUTPUT FORMAT
Return JSON matching the provided structured-output schema exactly. The
schema contains a single field "items" which is an array of billable
items. If none of the candidates survive scrutiny, return { "items": [] }.

Do not include any commentary, explanation, preamble, or text outside the
JSON.
`,
  model: gateway('openai/gpt-5.4-mini'),
  outputProcessors: [new ItemContractGuard()],
  maxProcessorRetries: 3,
});
```

#### Reasoning

- `ItemContractGuard` and `maxProcessorRetries: 3` are carried over
  UNMODIFIED from `billable-item-extractor.ts` — same import path, same
  class, same retry budget, per the explicit instruction to reuse this
  mechanism rather than invent a new one.
- Rules 1-5 and 7 are near-verbatim from `billable-item-extractor.ts`
  (still true statements about the classification job); rule 6 keeps the
  EXACT SAME "when unsure, omit" wording and reasoning as before — this is
  intentional, it's the precision half of the recall/precision split, not
  a rewritten rule.
- The two grounding tests (Ctrl-F, contractor-work-order) are preserved
  unchanged because they're still valid quality bars for `sourceQuote`,
  independent of whether the candidate was found by this agent or handed
  to it.
- New material: the "YOU MAY NOT INTRODUCE NEW CANDIDATES" instruction and
  the FIELDS section's `location` guidance being widened to also consult
  "the surrounding report text" — this is the one genuinely new judgment
  call versus the old extractor, needed because Stage 1's candidates carry
  only `sourceQuote`/`pageHint`, not `location`.

---

### `src/mastra/agents/billable-item-extractor.ts`

**Action:** Delete (fully superseded by `item-classifier.ts`)
**Why:** Its role — reading the raw PDF and doing both recall and
precision in one pass — no longer exists as a single unit of work.

#### Before

```ts
import { Agent } from '@mastra/core/agent';
import { createOpenAI } from '@ai-sdk/openai';
import { ItemContractGuard } from './processors/item-contract-guard';

const gateway = createOpenAI({
  apiKey: process.env.KILO_API_KEY!,
  baseURL: 'https://api.kilo.ai/api/gateway',
});

/**
 * The agent has exactly one job: read an inspection PDF and emit every
 * BILLABLE LINE ITEM the inspector explicitly identifies, so a downstream
 * pricer can price each item against local market data.
 *
 * It does not summarize, advise, prioritize, or describe the home. It does
 * not estimate cost. It does not invent items. When unsure, it omits.
 */
export const billableItemExtractorAgent = new Agent({
  id: 'billable-item-extractor',
  name: 'Billable Item Extractor',
  instructions: `
  [... full instructions body, see Existing Pattern Audit / repo history ...]
  `,
  model: gateway('openai/gpt-5.4-mini'),
  outputProcessors: [new ItemContractGuard()],
  maxProcessorRetries: 3,
});
```

(Full original content was read and confirmed identical to the version
quoted in this plan's research; omitted here in full only because its
successor, `item-classifier.ts` above, already reproduces every line that
survives into the new design. Nothing in this file is carried forward
silently — the diff is: PDF-reading + grounding-tests-as-a-recall-tool +
implicit recall responsibility are REMOVED; trade/action/scope/quantity/
unit rules and the `ItemContractGuard` wiring are MOVED to
`item-classifier.ts` verbatim.)

#### After

File deleted.

#### Reasoning

- `billable-item-extractor.schema.ts` (the sibling schema file) is NOT
  deleted — it remains the shared data contract, imported by
  `item-classifier.ts`, `merge-items.ts`, `price-items.ts`,
  `persist-success.ts`, `persist-failure.ts`, `item-pricer.schema.ts`,
  `item-contract-guard.ts`, `item-contract-guard/item-validator.ts`, and
  UI components (`items-section.tsx`, `estimate-report.tsx`,
  `envelope.ts`) — confirmed via a repo-wide grep before drafting this
  plan. Only the `Agent` instance file is deleted; the schema file's name
  staying "billable-item-extractor.schema.ts" despite the agent file
  disappearing is an accepted minor naming residue, not fixed here to
  avoid a large, low-value rename touching 8+ files outside this
  whiteboard's chartered scope.

---

### `src/mastra/workflows/steps/classify-candidates.ts`

**Action:** Create
**Why:** Stage 2 workflow step.
**Impact:** Feeds the `.branch()` that routes to `persist-failure.ts` or
the unchanged `merge-items → price-items → persist-success` success path.

#### Before

N/A — new file.

#### After

```ts
import { createStep } from '@mastra/core/workflows';
import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import {
  billableExtractionSchema,
  extractedItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';
import { candidateItemSchema } from '@/mastra/agents/candidate-capture.schema';
import { classifyError } from '../lib/classify-error';

/**
 * Stage 2 — Classify & clean. Calls the `item-classifier` agent once with
 * structured output over Stage 1's candidate list (plus the full report
 * text for location context).
 *
 * Fatal on failure, exactly like the old `extract-items` step this
 * (together with `capture-candidates`) replaces — a Stage 2 failure means
 * zero classified items, and the run must be marked failed rather than
 * silently persisted as an empty completed estimate. Short-circuits
 * without calling the model if an earlier stage already failed.
 *
 * Output shape is deliberately IDENTICAL to the old `audit-items` step's
 * output shape (`items`, `auditItems`, `auditFailed`) so `merge-items.ts`
 * needs ZERO changes. Pass B (the old self-audit) is retired — see Open
 * Decision 1 in FEATURE(extraction-recall-precision-split).md — so
 * `auditItems` is always `[]` and `auditFailed` is always `false`
 * (nothing was attempted, so nothing "failed"). `merge-items.ts`'s dedup
 * over `[...items, ...auditItems]` becomes a no-op concat with `[]`,
 * which is harmless and requires no code change there.
 */
export const classifyCandidatesStep = createStep({
  id: 'classify-candidates',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
    reportText: z.string(),
    candidates: z.array(candidateItemSchema),
    failed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
    items: z.array(extractedItemSchema),
    auditItems: z.array(extractedItemSchema),
    auditFailed: z.boolean(),
    failed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  retries: 2,
  execute: async ({ inputData, mastra }) => {
    if (inputData.failed) {
      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        zipCode: inputData.zipCode,
        items: [],
        auditItems: [],
        auditFailed: false,
        failed: true,
        errorMessage: inputData.errorMessage,
      };
    }

    if (inputData.candidates.length === 0) {
      // Nothing to classify is a legitimate outcome (a clean report), not
      // a failure — mirrors the old extractor returning { items: [] }.
      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        zipCode: inputData.zipCode,
        items: [],
        auditItems: [],
        auditFailed: false,
        failed: false,
        errorMessage: null,
      };
    }

    try {
      const agent = mastra.getAgent('item-classifier');

      const candidateList = inputData.candidates
        .map(
          (c, i) =>
            `${i + 1}. sourceQuote: ${JSON.stringify(c.sourceQuote)}, pageHint: ${c.pageHint ?? 'null'}`,
        )
        .join('\n');

      const result = await agent.generate(
        [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Classify the following numbered candidates into billable line items. ' +
                  'Follow the rules in your instructions exactly. When unsure, omit. ' +
                  'Do not introduce candidates that are not in this list.\n\n' +
                  'CANDIDATES:\n' +
                  candidateList +
                  '\n\nFULL REPORT TEXT (for location/context lookup only):\n' +
                  inputData.reportText,
              },
            ],
          },
        ],
        {
          structuredOutput: { schema: billableExtractionSchema },
          requestContext: new RequestContext([
            ['estimateRequestId', inputData.estimateRequestId],
          ]),
        },
      );

      const classification = result.object;
      if (!classification) {
        return {
          estimateRequestId: inputData.estimateRequestId,
          fileUrl: inputData.fileUrl,
          zipCode: inputData.zipCode,
          items: [],
          auditItems: [],
          auditFailed: false,
          failed: true,
          errorMessage: 'AI returned malformed classification. Please retry.',
        };
      }

      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        zipCode: inputData.zipCode,
        items: classification.items,
        auditItems: [],
        auditFailed: false,
        failed: false,
        errorMessage: null,
      };
    } catch (e) {
      console.error('Workflow step classify-candidates failed:', e);
      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        zipCode: inputData.zipCode,
        items: [],
        auditItems: [],
        auditFailed: false,
        failed: true,
        errorMessage: classifyError(e),
      };
    }
  },
});
```

#### Reasoning

- `inputSchema` exactly matches `captureCandidatesStep.outputSchema`.
- `outputSchema` is the union of what `persist-failure.ts` needs
  (`estimateRequestId`, `fileUrl`, `zipCode`, `items`, `failed`,
  `errorMessage`) and what the unmodified `merge-items.ts` needs
  (`estimateRequestId`, `fileUrl`, `zipCode`, `items`, `auditItems`,
  `auditFailed`) — a superset flowing through TypeScript's normal
  structural typing (an object with extra properties is assignable
  wherever a narrower shape is expected; this is not an object literal
  context, so no excess-property-check applies) and through Zod's default
  non-strict parsing (unknown keys are stripped, not rejected). This is
  the one place in this plan's wiring that is a genuine superset rather
  than an exact hop-to-hop match — called out explicitly here and in Risk
  Notes because it's the one departure from the codebase's usual exact-
  match habit, and should be double-checked by `pnpm exec tsc --noEmit`
  after implementation.
- The empty-candidates early return avoids spending an LLM call when Stage
  1 legitimately found nothing (a clean inspection report) — this is a new
  optimization not present in the old two-pass design (which always called
  the model at least twice regardless of content), justified because it's
  a pure efficiency win with no behavior change (zero candidates in ⇒ zero
  items out is exactly what the model would return anyway).

---

### `src/mastra/workflows/steps/extract-items.ts` and `src/mastra/workflows/steps/audit-items.ts`

**Action:** Delete (both)
**Why:** Fully superseded — `extract-items.ts` by
`capture-candidates.ts` + `classify-candidates.ts`; `audit-items.ts`
retired outright per Open Decision 1.

#### Before

Both files' full content was read and is quoted verbatim in this plan's
research (see the Existing Pattern Audit section 2 for the resilience
shape both follow). Not re-quoted a second time here to avoid duplicating
~230 lines already fully represented by the actual file contents on disk.

#### After

Both files deleted.

#### Reasoning

- Nothing in either file survives as dead code elsewhere — every behavior
  worth keeping (the resilient try/catch shape, the `RequestContext`
  threading, the dedup responsibility) is either replicated in the new
  steps or already lived in `merge-items.ts` (unchanged).

---

### `src/mastra/workflows/steps/persist-failure.ts`

**Action:** Modify
**Why:** Its `inputSchema` must exactly match the new upstream producer's
(`classify-candidates.ts`) output shape, the same way it previously
exactly matched `extract-items.ts`'s output shape.
**Impact:** Only the `inputSchema` changes; `execute` is untouched (it
already only reads `estimateRequestId` and `errorMessage`).

#### Before

```ts
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { estimateRequestTable } from '@/features/estimate/db/schema';
import { extractedItemSchema } from '@/mastra/agents/billable-item-extractor.schema';

/**
 * Write `status='failed'` + a human-readable `errorMessage` so the UI can
 * surface a retry. Reached only via the workflow's `.branch()` when the
 * extract step returned `failed: true`.
 */
export const persistFailureStep = createStep({
  // Mirrors extract-items' output shape — only `estimateRequestId` and
  // `errorMessage` are actually used here, but matching the shape keeps the
  // branch wiring straightforward. `zipCode` is in the shape because the
  // upstream step carries it for the success path; the failure path simply
  // ignores it.
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
    items: z.array(extractedItemSchema),
    failed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ inputData }) => {
    await db
      .update(estimateRequestTable)
      .set({
        status: 'failed',
        errorMessage:
          inputData.errorMessage ?? 'AI processing failed. Please retry.',
      })
      .where(eq(estimateRequestTable.id, inputData.estimateRequestId));

    return { success: false };
  },
});
```

#### After

```ts
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { estimateRequestTable } from '@/features/estimate/db/schema';
import { extractedItemSchema } from '@/mastra/agents/billable-item-extractor.schema';

/**
 * Write `status='failed'` + a human-readable `errorMessage` so the UI can
 * surface a retry. Reached only via the workflow's `.branch()` when
 * `classify-candidates` (Stage 2) returned `failed: true` — which now
 * also covers a Stage 0 (Docling `parse-document`, whose non-throwing
 * `parseFailed: true` is converted to `failed: true` by
 * `capture-candidates.ts`'s short-circuit guard) or Stage 1 (candidate
 * capture) failure, propagated forward by the short-circuit guards in
 * `capture-candidates.ts` and `classify-candidates.ts`.
 */
export const persistFailureStep = createStep({
  // Mirrors classify-candidates' output shape — only `estimateRequestId`
  // and `errorMessage` are actually used here, but matching the shape
  // keeps the branch wiring straightforward. `zipCode`/`auditItems`/
  // `auditFailed` are in the shape because the upstream step carries them
  // for the success path; the failure path simply ignores them.
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
    items: z.array(extractedItemSchema),
    auditItems: z.array(extractedItemSchema),
    auditFailed: z.boolean(),
    failed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ inputData }) => {
    await db
      .update(estimateRequestTable)
      .set({
        status: 'failed',
        errorMessage:
          inputData.errorMessage ?? 'AI processing failed. Please retry.',
      })
      .where(eq(estimateRequestTable.id, inputData.estimateRequestId));

    return { success: false };
  },
});
```

#### Reasoning

- Adds `auditItems`/`auditFailed` to the declared `inputSchema`, matching
  the exact same "declare fields you don't use because they keep the
  branch shape exact" idiom this file's own comment already documents for
  `zipCode`.
- `execute` body is byte-for-byte unchanged.

---

### `src/mastra/agents/processors/item-contract-guard.ts`

**Action:** Modify (comment only)
**Why:** Its doc comment names two callers that no longer exist.

#### Before

```ts
 * Lives in the same file as the strict schema so the two cannot drift
 * on the field list — the loose one is a strict-superset that only
 * re-declares the three enum fields.
 */
export const extractedItemGuardSchema = extractedItemSchema.extend({
```

(the relevant comment block, from `item-contract-guard.ts` itself, is
higher in the file:)

```ts
 * On any violation: `abort(reason, { retry: true })`. Mastra re-invokes
 * the LLM with the reason appended to the conversation, up to
 * `maxProcessorRetries` (set to 3 on the agent).
 *
 * Runs on EVERY call to the billable-item-extractor agent — extract-items,
 * audit-items, and any future caller.
 */
export class ItemContractGuard implements Processor {
```

#### After

```ts
 * On any violation: `abort(reason, { retry: true })`. Mastra re-invokes
 * the LLM with the reason appended to the conversation, up to
 * `maxProcessorRetries` (set to 3 on the agent).
 *
 * Runs on EVERY call to the item-classifier agent (Stage 2) —
 * classify-candidates, and any future caller.
 */
export class ItemContractGuard implements Processor {
```

#### Reasoning

- Purely a stale-reference fix. `extractedItemGuardSchema` and everything
  else in the file — the class body, `validateItem` calls, `cleanScope`
  usage — is untouched.

---

### `src/mastra/workflows/summarize-estimate.ts`

**Action:** Modify
**Why:** Rewire the pipeline onto the new stages.

#### Before

```ts
import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

import { markProcessingStep } from './steps/mark-processing';
import { extractItemsStep } from './steps/extract-items';
import { auditItemsStep } from './steps/audit-items';
import { mergeItemsStep } from './steps/merge-items';
import { priceItemsStep } from './steps/price-items';
import { persistSuccessStep } from './steps/persist-success';
import { persistFailureStep } from './steps/persist-failure';

/**
 * Top-level workflow wiring.
 *
 * Stages:
 *   1. mark-processing      → flips status to 'processing'
 *   2. extract-items        → Pass A, structured-output extraction (retries 2)
 *   3. branch on failed
 *      ├── true:  persist-failure   (terminal)
 *      └── false: success sub-workflow:
 *                    audit-items   → Pass B, non-fatal (retries 1)
 *                    merge-items   → pure dedup + renumber
 *                    price-items   → per-item pricer call (retries 1)
 *                    persist-success → writes v2 JSON envelope (items + prices)
 *
 * Each step is a named export and the workflow body is a wiring diagram.
 * Adding a stage = one `.then(...)` line; removing a stage = delete one line.
 */

const successPathWorkflow = createWorkflow({
  id: 'summarize-estimate-success-path',
  inputSchema: extractItemsStep.outputSchema,
  outputSchema: persistSuccessStep.outputSchema,
})
  .then(auditItemsStep)
  .then(mergeItemsStep)
  .then(priceItemsStep)
  .then(persistSuccessStep)
  .commit();

export const summarizeEstimateWorkflow = createWorkflow({
  id: 'summarize-estimate',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
  }),
  outputSchema: z.unknown(),
})
  .then(markProcessingStep)
  .then(extractItemsStep)
  .branch([
    [async ({ inputData }) => inputData.failed === true, persistFailureStep],
    [async ({ inputData }) => inputData.failed === false, successPathWorkflow],
  ])
  .commit();
```

#### After

```ts
import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

import { markProcessingStep } from './steps/mark-processing';
import { parseDocumentStep } from './steps/parse-document';
import { captureCandidatesStep } from './steps/capture-candidates';
import { classifyCandidatesStep } from './steps/classify-candidates';
import { mergeItemsStep } from './steps/merge-items';
import { priceItemsStep } from './steps/price-items';
import { persistSuccessStep } from './steps/persist-success';
import { persistFailureStep } from './steps/persist-failure';

/**
 * Top-level workflow wiring.
 *
 * Stages:
 *   1. mark-processing        → flips status to 'processing'
 *   2. parse-document         → Stage 0, hosted Docling Serve PDF→markdown
 *                                (non-throwing, reports `parseFailed` —
 *                                transport owned by
 *                                FEATURE(docling-serve-integration).md)
 *   3. capture-candidates     → Stage 1, recall-biased candidate capture
 *                                (retries 2; short-circuits on Stage 0's
 *                                `parseFailed`, converting it to `failed`)
 *   4. classify-candidates    → Stage 2, precision-biased classification
 *                                (retries 2; short-circuits if Stage 0/1 failed)
 *   5. branch on failed
 *      ├── true:  persist-failure   (terminal)
 *      └── false: success sub-workflow:
 *                    merge-items   → pure dedup + renumber (UNCHANGED)
 *                    price-items   → per-item pricer call (UNCHANGED, retries 1)
 *                    persist-success → writes v2 JSON envelope (UNCHANGED)
 *
 * The old two-pass extraction (`extract-items` Pass A + `audit-items` Pass
 * B, both full-judgment single calls over the raw PDF) is retired — see
 * FEATURE(extraction-recall-precision-split).md for the reasoning. Stage 1
 * + Stage 2 replace Pass A; Pass B is retired outright (Open Decision 1 in
 * that plan). `classify-candidates` emits `auditItems: []` /
 * `auditFailed: false` stubs so `merge-items.ts` needs no changes.
 *
 * Each step is a named export and the workflow body is a wiring diagram.
 * Adding a stage = one `.then(...)` line; removing a stage = delete one line.
 */

const successPathWorkflow = createWorkflow({
  id: 'summarize-estimate-success-path',
  inputSchema: classifyCandidatesStep.outputSchema,
  outputSchema: persistSuccessStep.outputSchema,
})
  .then(mergeItemsStep)
  .then(priceItemsStep)
  .then(persistSuccessStep)
  .commit();

export const summarizeEstimateWorkflow = createWorkflow({
  id: 'summarize-estimate',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
  }),
  outputSchema: z.unknown(),
})
  .then(markProcessingStep)
  .then(parseDocumentStep)
  .then(captureCandidatesStep)
  .then(classifyCandidatesStep)
  .branch([
    [async ({ inputData }) => inputData.failed === true, persistFailureStep],
    [async ({ inputData }) => inputData.failed === false, successPathWorkflow],
  ])
  .commit();
```

#### Reasoning

- The top-level `id: 'summarize-estimate'` and its
  `inputSchema`/`outputSchema` are UNCHANGED — `src/features/estimate/lib/workflow.ts`
  calls `mastra.getWorkflow("summarize-estimate")` and
  `run.start({ inputData: { estimateRequestId, fileUrl } })`; this outer
  contract is confirmed compatible and not touched.
- `parseDocumentStep` (step id `'parse-document'`) is imported from
  `@/mastra/workflows/steps/parse-document` (relative form `'./steps/…'`
  here, matching this file's existing sibling imports) — that step is
  created by FEATURE(docling-serve-integration).md, a prerequisite of this
  plan; the `.then(parseDocumentStep)` line above is the single coupling
  point between the two plans. Its non-throwing `parseFailed` output is
  routed to `persist-failure` via `capture-candidates`' short-circuit
  conversion to `failed` and this workflow's one `.branch()` on `failed` —
  consistent with how the old workflow branched on `failed` after
  `extract-items`.
- `.branch()` is still called exactly once, matching the existing idiom
  (see Existing Pattern Audit point 5).
- `successPathWorkflow`'s `inputSchema` is set to
  `classifyCandidatesStep.outputSchema`, mirroring today's
  `inputSchema: extractItemsStep.outputSchema` line exactly, just pointed
  at the new upstream producer.

---

### `src/mastra/index.ts`

**Action:** Modify
**Why:** Register the two new agents in place of the retired one.

#### Before

```ts
import { Mastra } from '@mastra/core/mastra';
import { billableItemExtractorAgent } from './agents/billable-item-extractor';
import { itemPricerAgent } from './agents/item-pricer';
import { summarizeEstimateWorkflow } from './workflows/summarize-estimate';

export const mastra = new Mastra({
  agents: {
    'billable-item-extractor': billableItemExtractorAgent,
    'item-pricer': itemPricerAgent,
  },
  workflows: { 'summarize-estimate': summarizeEstimateWorkflow },
});
```

#### After

```ts
import { Mastra } from '@mastra/core/mastra';
import { candidateCaptureAgent } from './agents/candidate-capture';
import { itemClassifierAgent } from './agents/item-classifier';
import { itemPricerAgent } from './agents/item-pricer';
import { summarizeEstimateWorkflow } from './workflows/summarize-estimate';

export const mastra = new Mastra({
  agents: {
    'candidate-capture': candidateCaptureAgent,
    'item-classifier': itemClassifierAgent,
    'item-pricer': itemPricerAgent,
  },
  workflows: { 'summarize-estimate': summarizeEstimateWorkflow },
});
```

#### Reasoning

- Agent registration keys (`'candidate-capture'`, `'item-classifier'`)
  exactly match the `mastra.getAgent(...)` string literals used in
  `capture-candidates.ts` and `classify-candidates.ts` respectively.
- `item-pricer` registration is untouched.

## Validation Plan

This repo has no test runner (`ls src/**/*.test.*` → empty), so validation
is exactly the two commands `AGENTS.md` specifies, plus manual QA:

1. **`pnpm exec tsc --noEmit`** — must be clean. Pay particular attention
   to `classify-candidates.ts`'s output flowing into both
   `persist-failure.ts` (exact match) and `successPathWorkflow` /
   `merge-items.ts` (superset — see that file's Reasoning section); this
   is the one hop in the new wiring that isn't an exact schema match and
   is worth a deliberate look if `tsc` complains.
2. **`pnpm exec eslint <every file in the Modification Table>`** — must be
   clean. (Not project-level `pnpm lint`, which is broken under Next 16
   per `AGENTS.md`.)
3. **Manual QA via `pnpm dev`** (no test framework exists to substitute
   for this):
   a. With `DOCLING_SERVE_URL` (env var owned by
      FEATURE(docling-serve-integration).md) unset or pointed at an
      unreachable host, upload a report and confirm `parse-document`
      returns `parseFailed: true`, `capture-candidates` converts it to
      `failed: true` without an LLM call, and the estimate ends in
      `status: 'failed'` with a user-facing error message — NOT a
      silently-empty `'completed'` report. This is the single most
      important regression check this plan introduces risk around (see
      Risk Notes).
   b. With a real Docling Serve instance reachable, upload a known test
      PDF (`dummy.pdf` at the repo root, or a real inspection report) and
      confirm: `parsedDocument` has a plausible `pages` count (the
      transport's `[parse-quality]` log line reports it) with non-empty
      markdown, candidate `pageHint`s correspond to the `--- PAGE N ---`
      markers, Stage 1 produces a plausible
      candidate count (spot-check against the PDF), Stage 2 produces
      classified items with valid `trade`/`action`/`scope`, and the final
      report renders exactly as it does today (same UI, same
      `SummaryEnvelopeV2` shape).
   c. Check server logs for the `[extraction-quality]` line
      `merge-items.ts` already emits — confirm it still fires, and that
      `auditCount` is consistently `0` / `auditFailed` is consistently
      `false` post-migration (expected, per Open Decision 1 — not a bug).
   d. Deliberately craft or truncate a test PDF to trigger a Stage 1 or
      Stage 2 malformed-output response (or temporarily break the guard)
      to confirm the `failed: true` short-circuit chain correctly
      propagates all the way to `persist-failure.ts` regardless of which
      of the three new stages originated the failure.

## Risk Notes

- **Docling Serve is a new deployment surface — owned elsewhere.** See
  "Infrastructure Prerequisites" above and
  FEATURE(docling-serve-integration).md, which owns the transport and
  documents its risks (hosting prerequisite, sync-endpoint timeouts,
  `md_page_break_placeholder` version sensitivity, OCR cost tuning,
  client/SDK choice). For this plan, the residual risk is sequencing:
  until that plan is implemented and `DOCLING_SERVE_URL` points at a live
  instance, every run fails at Stage 0 (correctly, not silently —
  `parseFailed: true` → `failed: true` → `persist-failure`).
- **Docling vs. Marker.** Documented in Open Decision 2. Marker (GPL code,
  revenue-gated model weights above $2M) was deliberately not chosen; this
  plan does not build any fallback path to it. If a different parser is
  ever adopted, the single file to swap is
  FEATURE(docling-serve-integration).md's
  `src/mastra/services/docling/docling-client.ts` — nothing in this plan
  changes.
- **Pass B retirement is a recall bet.** Documented in Open Decision 1.
  The mitigation (a future, out-of-scope cheap recall re-check) is
  explicitly NOT implemented here — if real-world recall regresses, that
  is the first place to look, not a resurrection of the old two-pass
  design.
- **`auditFailed: false` stub is a semantic approximation.** It reads as
  "the audit succeeded" when the true state is "no audit was attempted."
  Its only consumer is the `[extraction-quality]` log line in
  `merge-items.ts` (unchanged), so this has no functional impact — flagged
  here so a future reader of that log line isn't confused by
  `auditFailed: false` next to `auditCount: 0` for every run.
  `merge-items.ts` itself cannot be renamed/cleaned up here without
  violating this plan's explicit scope boundary.
- **The failure-propagation chain (parse-document → capture-candidates →
  classify-candidates, single `.branch()` at the end) is the least-tested
  shape in this plan.** Three sequential fallible HTTP/LLM steps, two of
  which short-circuit on an upstream failure flag (`parseFailed` for Stage
  1's guard, `failed` for Stage 2's), feeding one branch —
  functionally sound (traced through by hand in the Existing Pattern
  Audit) but not a shape this codebase has exercised before. Manual QA
  step 3(d) above exists specifically to exercise all three failure
  origins before this ships.
  - The most consequential failure mode this guards against: if Stage 2
    (`classify-candidates`) failed silently (no `.branch()` catching it),
    the run would complete with `status: 'completed'` and zero items —
    indistinguishable in the UI from a genuinely clean inspection report.
    This is why Stage 2's failure is fatal rather than resilient/per-item
    (unlike `price-items.ts`, which tolerates partial failure because a
    priced item with `unitPrice: null` is still visibly a distinct row —
    a dropped item has no such visible trace).
- **Token/cost/latency profile changes.** The new pipeline makes 3 model-
  or-network calls in sequence (Docling HTTP + 2 LLM calls) versus the old
  2 LLM calls, though one of the old calls (Pass B) always ran a full
  redundant pass regardless of report length — net cost direction is not
  asserted here as strictly better or worse without empirical
  measurement; Stage 2's prompt now also includes the FULL report text a
  second time (for location context) on top of the numbered candidate
  list, which increases Stage 2's input token count versus what Pass B
  used to send. Recommend tracking actual per-run token usage post-launch
  if cost matters more than parity, rather than assuming a NET win from
  removing Pass B is achieved.
## Approval

`Status: Awaiting explicit user approval. Do not implement yet.`
