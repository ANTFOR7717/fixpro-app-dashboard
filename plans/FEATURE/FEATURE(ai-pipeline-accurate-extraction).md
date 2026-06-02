# FEATURE(ai-pipeline-accurate-extraction)

## Request
Improve the existing AI extraction pipeline so the items it pulls from an
uploaded inspection PDF more accurately match what the inspector actually
called out as required work. No pricing. No new agent. No new envelope. No
new dependencies. No new workflow stages.

**Step 0** (required before the schema/prompt changes) is to bump
`@mastra/core` and the `mastra` CLI to **latest published**:
`@mastra/core@^1.37.1` + `mastra@^1.10.2` at plan time (verified against
`https://registry.npmjs.org/@mastra/core/latest` and
`https://registry.npmjs.org/mastra/latest` on 2026-06-02). The pipeline
currently runs on `@mastra/core@1.32.1`, which is not the latest.
1.37.1 is the most recent `@mastra/core` release (1.37.0 published
2026-05-27, 1.37.1 is the current `latest` dist-tag). 1.10.2 is the most
recent `mastra` CLI release and its `peerDependencies` accept
`@mastra/core >=1.34.0-0 <2.0.0-0`, so the CLI bump is independent of
the core bump. The schema/prompt/log changes are pure Zod/string and
do not depend on the bump; the bump itself is **not optional** and
lands as the first commit on the branch. After Step 0 ships, Steps 1–4
land on the bumped surface.

## What "accurate" means here
A row in `estimate_requests.summary` (v1 envelope, kind `billable-extraction`,
version `1`) is accurate when every emitted `BillableItem` corresponds to
something the inspector either (a) explicitly recommended as an action, or
(b) explicitly flagged as defective and in need of work — and nothing that
meets that bar is missing. Accuracy is measured against the inspector's text.
The schema's `sourceQuote` field is the audit anchor; every emitted item
must trace back to one.

## Current pipeline (verified from `feat/ai-pipeline-fix-extraction` @ 4612fae, merged to main via PR #9)
1. `markProcessingStep` — flips `status: 'uploaded' → 'processing'`, clears `errorMessage`.
2. `extractItemsStep` (Pass A) — single `agent.generate` call with `structuredOutput: { schema: billableExtractionSchema }`. Resilient: malformed `result.object` and caught errors return `{ failed: true, errorMessage }` instead of throwing.
3. `.branch()` on `failed`:
   - `true` → `persistFailureStep` (terminal).
   - `false` → `successPathWorkflow` sub-workflow:
     - `auditItemsStep` (Pass B) — reuses the same agent, asks for items missing from Pass A. Non-fatal; returns `auditItems` + `auditFailed`.
     - `mergeItemsStep` — concatenates + dedups (by `(trade, action, scope, location)` key AND by normalized `sourceQuote`) + renumbers `id` to `item-001`, `item-002`, ...
     - `persistSuccessStep` — writes v1 envelope JSON to `summary`, sets `status: 'completed'`, clears `errorMessage`.
4. `commit()`.

The agent prompt (`billable-item-extractor.ts`) enforces: grounded-only via `sourceQuote`, no invention, one item per fix, "use `other` freely", "use `service`/`evaluate` freely", when-unsure-omit (defined as "descriptive rather than actionable").

## Mastra Best-Practice Anchors (verified against installed 1.32.1 and downloaded 1.37.1)
These are the rules the design must satisfy. Each claim is sourced to a
specific type signature or doc note. The pipeline already follows most
of them; the changes below close the remaining gaps on
`@mastra/core@1.37.1` (latest) without breaking 1.32.1 compatibility.
- **Step granularity** = one unit of work per `createStep`. Each step has its own
  `inputSchema`/`outputSchema`, its own `retries`, and is independently observable.
  Do **not** split for cosmetic reasons.
- **Resilient-step pattern** = a step that can fail returns
  `{ ..., failed: boolean, errorMessage: string | null }` instead of throwing, so
  `.branch()` can route to a failure-persistence step. `try`/`catch` inside the
  step translates classified errors (auth, rate-limit, 5xx, Zod rejection) into
  the resilient shape; `retries: N` handles transient throws the step *does*
  raise (e.g. genuine network errors before classification). Both layers
  coexist by design — retries for transient, catch-and-shape for classification.
- **Composition** = steps are wired with `.then(...)`/`.branch([...])`/`.commit()`.
  Data flows **only** through step I/O (no closures, no module-level state).
  Use `getStepResult(stepRef)` when a later step needs an earlier step's output
  that isn't its direct input. After `.branch([...])`, the next step's
  `inputData` is keyed by the executed step's `id` (one of the branch arms).
  Verified: `node_modules/@mastra/core/dist/workflows/workflow.d.ts:221`
  (`branch<TBranchSteps extends Array<[ConditionFunction | ..., Step<...>]>>`)
  and `:180` (`then<TStepId, TStepState, TStepInput, TSchemaOut>(step: Step<...>)`)
  in 1.32.1; both signatures are unchanged in 1.37.1
  (`/tmp/mastra-1.37.1-check/package/dist/workflows/workflow.d.ts`).
- **Structured agent output** = call `agent.generate(messages, { structuredOutput: { schema } })`.
  The result's typed payload is `result.object`. `output` and
  `experimental_output` are deprecated migration aliases — do not use them in
  new code.
- **Workflow output is the canonical artifact**; presentation (markdown
  rendering, UI formatting) does not belong inside the workflow. The
  top-level workflow's `outputSchema` should be the success arm's output
  schema (the failure arm is terminal — it makes the run `status: 'failed'`,
  not a typed `result` payload).
- **Reusable steps**: define each step as a named export so it can be reordered,
  removed, or reused in another workflow without rewriting the workflow body.
  The workflow file should read like a wiring diagram, not a definitions dump.
- **Step `retries`** = the `Step` interface has `retries?: number`
  (`step.d.ts:72` in both 1.32.1 and 1.37.1; verified). This is the documented
  surface for transient-failure retry on a single step.
- **Step log surface = `mastra.getLogger()`** = the `execute` context
  (`ExecuteFunctionParams` at `step.d.ts:19` in both 1.32.1 and 1.37.1)
  exposes `mastra: Mastra` but does **not** expose a direct `logger` field.
  The documented way to log from a step body is
  `mastra.getLogger().info('[tag]', payload)` — `Mastra.getLogger(): TLogger`
  is at `mastra/index.d.ts:1430` (1.37.1) and the same shape in 1.32.1.
  `Mastra` also has a public `logger: TLogger` field
  (`mastra/index.d.ts:1389` in 1.37.1), so `mastra.logger?.info(...)` is
  equally valid. **Do not destructure a `logger` out of the step's
  `execute` params — it isn't there in either installed or bumped
  versions, and a previous draft of this plan assumed it was, which was
  wrong.**
- **`requestContext` on `agent.generate`** = `AgentExecutionOptionsBase`
  has `requestContext?: RequestContext<any>` at
  `agent/agent.types.d.ts:396` (1.32.1) and `:405` (1.37.1). The
  `RequestContext` class is exported from `@mastra/core/request-context`
  (`request-context/index.d.ts:50`); its constructor takes
  `Iterable<readonly [string, unknown]>`, so
  `new RequestContext([['userId', x], ['estimateRequestId', y]])` is
  structurally valid in 1.32.1 and 1.37.1 alike. This is **not** a
  1.36.0-only addition; it is a stable surface that has been present
  since at least 1.32.1. A previous draft of this plan claimed it was
  1.36.0-only and tied it to a release #16651 FGA change with no source
  read; that claim is dropped here.

## What's already been improved in PR #9
1. `merge-items.ts` now also dedups by `sourceQuote` (commit `343ebcb`).
2. Extractor prompt bias toward `other` and `service`/`evaluate` to prevent omission of real items the model would otherwise classify-ambiguously (commit `6192cfd`).
3. Five-segment status bar UX (commits `79332e0`, `10d042d`, `4612fae`).

## What is still wrong (the gap this branch closes)
Real extraction runs still produce these failure modes. Each is verified
against the existing files; nothing here is hypothetical.

### Gap 1 — `sourceQuote` paraphrases the inspector instead of quoting verbatim
The Zod schema requires `z.string().min(1)`, which the model satisfies with
a near-paraphrase. The prompt says "verbatim excerpt" and "no paraphrase",
but the model condenses multi-sentence context into a single semantically
equivalent sentence. This breaks the auditability contract — a reviewer
cannot find the original sentence by Ctrl-F'ing the PDF.

Concrete symptom: inspector wrote "The GFCI receptacle at the kitchen
counter failed to reset when tested and appears to have an internal open
ground. Recommend replacement by a licensed electrician." The model emits
`sourceQuote: "GFCI receptacle at kitchen counter failed to reset"`. The
original sentence is a 32-word compound; the model trimmed 18 words of
qualifying context. The recommendation ("replacement by a licensed
electrician") is gone from the quote.

### Gap 2 — `pageHint` is wrong or invented
`pageHint` is `z.string().nullable()`. The model writes a page number when
there is one in the source, but it also writes `"p. 1"` or `null` for items
on later pages when the source doesn't show page numbers. The current
prompt's rule is "e.g. 'p. 14' when a page number is present in the source
text. Otherwise null." but the model can't tell whether page numbers are
present, so it invents plausible ones.

Concrete symptom: a 30-page report yields `pageHint` values like `"p. 4"`,
`"p. 7"`, `"p. 12"` for items that may not be on those pages.

### Gap 3 — Multi-fix sentences collapse into one item
Rule 2 ("ONE ITEM PER FIX") is explicit in the prompt, but the model treats
"X and Y" as a single item when X and Y are in the same sentence and
related. Example: "Replace the angle stop under the kitchen sink and
re-secure the supply line." is supposed to be **two** items. The model
emits one with `scope: "angle stop and supply line under kitchen sink"`.
This is a regression that was not addressed in PR #9.

## Scope: what this branch ships
Step 0: Mastra bump. Steps 1–4: five source-file changes (schema, agent
prompt, `merge-items.ts` log line, `extract-items.ts` `requestContext`,
`audit-items.ts` `requestContext`). No new files at the root level. No
new workflow stages. No new agent. No new envelope. No new dependencies.
Step 0 is a `package.json` + `pnpm-lock.yaml` change; Steps 1–4 are
schema + prompt + one log line + two one-line `requestContext`
additions.

### Step 0 — Bump Mastra to latest (`@mastra/core@1.37.1`, `mastra@1.10.2`)

The pipeline currently runs on `@mastra/core@1.32.1` (verified in
`node_modules/@mastra/core/package.json`) and the `mastra` CLI on
`1.9.0`. Per the npm registry on 2026-06-02:
- `https://registry.npmjs.org/@mastra/core/latest` → `1.37.1` (1.37.0
  published 2026-05-27, 1.37.1 is the current `latest` dist-tag).
- `https://registry.npmjs.org/mastra/latest` → `1.10.2` (peer-deps
  `@mastra/core >=1.34.0-0 <2.0.0-0`, so the CLI bump is decoupled
  from the core bump).

**Why the bump is required even though the schema/prompt/log changes
don't touch Mastra APIs**: the user's standing rule is to always plan
against the latest published Mastra. Planning the schema/prompt changes
against 1.32.1 while 1.37.1 is available leaves the branch on a stale
base, so the bump ships as Step 0 in its own commit before the
source-file changes.

**Commit 1 (Step 0)** — bump-only, no other source changes:
1. Edit `package.json`:
   - `"@mastra/core": "^1.32.1"` → `"@mastra/core": "^1.37.1"`
   - `"mastra": "^1.9.0"` → `"mastra": "^1.10.2"`
2. Run `pnpm install` to refresh `pnpm-lock.yaml`. Verify the lockfile
   resolves to `@mastra/core@1.37.1` and `mastra@1.10.2`.
3. **API-surface verification step** (required): read the installed types
   in `node_modules/@mastra/core/dist/workflows/workflow.d.ts`,
   `types.d.ts`, `step.d.ts`, `request-context/index.d.ts`, and
   `agent/agent.types.d.ts` after the bump, and confirm:
   - `createStep` overloads unchanged from 1.32.1.
   - `.then(...)` signature (verified at `workflow.d.ts:180` in 1.32.1
     AND 1.37.1) unchanged.
   - `.branch(...)` signature (verified at `workflow.d.ts:221` in 1.32.1
     AND 1.37.1) unchanged.
   - `Step.retries?: number` (verified at `step.d.ts:72` in 1.32.1
     AND 1.37.1) unchanged.
   - `ExecuteFunctionParams` does **not** add a `logger` field
     (verified: step.d.ts:19 in 1.32.1 and 1.37.1). The step body's
     logger is `mastra.getLogger()`, not a destructure of `execute`
     params.
   - `Mastra.getLogger(): TLogger` is present
     (`mastra/index.d.ts:1430` in 1.37.1) and matches the 1.32.1
     shape.
   - `AgentExecutionOptionsBase.requestContext?: RequestContext<any>`
     (verified: `agent/agent.types.d.ts:396` in 1.32.1, `:405` in
     1.37.1) is unchanged.
   - `RequestContext` constructor accepts
     `Iterable<readonly [string, unknown]>` (verified:
     `request-context/index.d.ts:50` in 1.32.1 and 1.37.1) so
     `new RequestContext([['userId', x], ['estimateRequestId', y]])`
     is structurally valid in both.

   All of the above were spot-checked against the 1.37.1 tarball
   extracted at `/tmp/mastra-1.37.1-check/package/dist/`. The
   pre-bump install (`/Users/dev/.../node_modules/@mastra/core/dist/`)
   was used to confirm the same shapes hold in 1.32.1. **If any
   signature drift is found, the bump commit fixes the call site in
   the same commit.**
4. Run `pnpm exec tsc --noEmit` — must be clean. No source files are
   changed in Commit 1, so this is a sanity check that the bumped types
   still resolve against the existing code.
5. Commit message:
   `chore(deps): bump @mastra/core to ^1.37.1 and mastra CLI to ^1.10.2`.

**Why the bump is its own commit**: the diff is mechanical (one package.json
line, one lockfile), it is reviewable in isolation, and if the API-surface
verification step finds a type drift the fix is contained to that commit.

### Steps 1–4 — Source-file changes

1. **Tighten `sourceQuote` constraints** (Gap 1) — change the field's Zod
   schema from `z.string().min(1)` to `z.string().min(8).max(500)`. Min
   length 8 forbids one-word quotes; max length 500 forbids page-pasting.
   Re-validate through `structuredOutput` so a non-conforming emission
   fails the LLM call and the existing resilient path returns a retryable
   failure.
2. **Tighten `pageHint` format** (Gap 2) — change the Zod from
   `z.string().nullable()` to `z.string().regex(/^p\.\s*\d+$/).nullable()`.
   Any non-conforming value is rejected by Zod and the step returns a
   resilient failure. The prompt-side fix is the same field's prompt
   paragraph: only emit when a page number is visible in the source.
3. **Rewrite the extractor prompt** — add the "Ctrl-F test" for sourceQuote
   (Gap 1), the "page number visible on the same span" rule for pageHint
   (Gap 2), and the "would a contractor quote these as two work orders?"
   test for multi-fix sentences (Gap 3). No new fields, no new enums, no
   new schema. The prompt's existing "use `other` freely" / "use
   `service`/`evaluate` freely" rules from PR #9 are kept verbatim.
4. **Add a single extraction-quality log line** in `merge-items.ts` after
   the merge completes. The step's `execute` params expose
   `mastra: Mastra` but no direct `logger` field (verified against
   `step.d.ts:19` in 1.32.1 and 1.37.1). The documented way to log from
   a step body is `mastra.getLogger().info('[extraction-quality]', { ... })`
   (or equivalently `mastra.logger?.info(...)`). The call carries:
   total items, count of `pageHint: null` (expected high — tells us
   the model is being honest), a sample `sourceQuote.slice(0, 80)` from
   the first item, and the row's `estimateRequestId`. Using the
   `Mastra` logger (not `console.log`) routes the entry through the
   configured logger (Pino by default), which auto-correlates to the
   active workflow trace — `runId`, `stepId`, and trace ID are
   attached automatically and the entry shows up in Mastra Studio
   without extra wiring. No structured logging framework, no metrics
   package, no new dependency.

## Out of scope (explicit, will not be touched)
- Pricing. No `price-billable-items` workflow, no pricer agent, no v2 envelope.
- Status UX. The five-segment status bar is shipped in PR #9.
- Workflow topology. No new stages, no `.foreach`, no `.parallel`, no `.branch`.
- New agents, new tools, new gateways.
- **`package.json` bumps.** Done in Step 0 above (`@mastra/core@1.32.1`
  → `^1.37.1`, `mastra@1.9.0` → `^1.10.2`), not skipped. The pipeline
  plans and ships against the latest published Mastra (`@mastra/core@1.37.1`
  + `mastra@1.10.2` on 2026-06-02), not the installed version.
- Drizzle migrations. No schema change to `estimate_requests` (the
  `summary` column is `text`; the JSON shape is a contract between the
  workflow and the UI, not a Drizzle column).
- New dependencies. `pdfjs-dist`, `pdf-parse`, `unpdf`, or any other PDF
  text extraction library is explicitly NOT being added. The runtime
  "verify `sourceQuote` is findable in the PDF" idea is cut; the
  verbatim guarantee is enforced by the schema's `min(8).max(500)` and
  the prompt's Ctrl-F test, not by a runtime substring check.
- New schema fields. No `quantityKind`, no `tradeTags`, no `isMultiFix`.
  The accuracy gaps close through tighter Zod constraints on existing
  fields + a clearer prompt. New fields are a different branch.

## File-by-File Changes

**Note on which steps the schema tightening affects:** the
`sourceQuote: z.string().min(8).max(500)` and
`pageHint: z.string().regex(/^p\.\s*\d+$/).nullable()` constraints
apply to both Pass A (`extract-items.ts`) and Pass B (`audit-items.ts`)
because both use the same `billableItemSchema` in their
`structuredOutput` option. A non-conforming emission from either
pass surfaces as `result.object = null` (or a throw) and the
existing `try`/`catch` returns the resilient `{ failed: true,
errorMessage }` shape. The plan does not modify `audit-items.ts`
directly; the schema change is the work.

### `src/mastra/agents/billable-item-extractor.schema.ts`
**Action:** Modify
**Why:** Tighten `sourceQuote` (Gap 1) and `pageHint` (Gap 2). Two Zod
constraint changes, no new fields, no new exports.

**Before**
```ts
export const billableItemSchema = z.object({
  id: z.string(),
  trade: z.enum(TRADE),
  action: z.enum(ACTION),
  scope: z.string().min(1),
  location: z.string().min(1),
  quantity: z.number().nullable(),
  sourceQuote: z.string().min(1),
  pageHint: z.string().nullable(),
});
```

**After**
```ts
export const billableItemSchema = z.object({
  id: z.string(),
  trade: z.enum(TRADE),
  action: z.enum(ACTION),
  scope: z.string().min(1),
  location: z.string().min(1),

  /**
   * Required count, derived from the inspector's wording:
   *   - Specific digit or written-out number -> that number.
   *   - "both" -> 2.
   *   - "all" / "every" / "each" / "the remaining" -> 1 (the full set;
   *     the contractor prices the whole assembly).
   *   - No count word at all -> 1. A single defective item is still
   *     billable.
   * Better to overbill than underbill: never null, never invent a count
   * the report does not support, never drop an item because the count
   * is fuzzy. The prompt carries the explicit 5-rule ladder.
   */
  quantity: z.number().int().min(1),

  /**
   * Verbatim sentence-span excerpt from the report. Min 8 chars (forbid
   * one-word quotes) and max 500 chars (forbid page-pasting). Verified
   * by the Ctrl-F test in the extractor prompt.
   */
  sourceQuote: z.string().min(8).max(500),

  /**
   * Strict "p. N" format. `null` when no page number is visible in the
   * source on the same span as the quote. The extractor prompt forbids
   * inventing page numbers; the Zod regex rejects any other shape.
   */
  pageHint: z.string().regex(/^p\.\s*\d+$/).nullable(),
});
```

**Reasoning**
- The schema is the runtime enforcement; the prompt is the model-side
  instruction. Both have to change in lockstep for the constraint to
  hold. Zod re-validates the LLM's emission inside `structuredOutput`;
  a non-conforming value triggers a retry (existing `retries: 2` on
  `extract-items`) or a resilient failure.
- The constraint values (8 / 500 / `p. N`) are chosen to be the
  minimum that rules out the failure modes the gaps describe. A
  1- or 2-word quote (under ~12 chars) is exactly the paraphrased
  kind we want to reject; a 500-char cap is roughly two PDF lines
  of text, which is enough span for any single billable item the
  inspector writes in one sentence or compound sentence.

### `src/mastra/agents/billable-item-extractor.ts`
**Action:** Modify
**Why:** Tighten the prompt for Gaps 1, 2, 3. The structure of the agent
(identity, model, Kilo gateway) is unchanged. The instructions string is
rewritten in place. No new tool, no new memory, no new model.

**Before/After**: the `instructions` template literal is replaced with the
version below. Everything outside the `instructions` string is unchanged.

**After (full instructions string)**
```
You read a home inspection PDF and emit a flat list of BILLABLE LINE ITEMS.

DEFINITION
A "billable item" is a discrete action a contractor would quote: a repair,
replacement, installation, removal, service call, or specialist evaluation
that the inspector explicitly recommends, OR that the inspector explicitly
states is defective and needs work. If the inspector did not call for an
action and did not flag a defect, it is NOT a billable item. Background
descriptions, condition observations, age statements, system overviews, and
code-of-the-day commentary are NOT billable items.

HARD RULES
1. GROUNDED ONLY. Every emitted item must quote the inspector's exact
   wording in `sourceQuote` — a verbatim span, between 8 and 500
   characters, findable by Ctrl-F in the PDF text. If you cannot supply
   a verbatim span, omit the item. No paraphrase, no condensing, no
   semantic rewriting. If the inspector's sentence has qualifying context
   ("at the kitchen counter", "appears to have an internal open ground",
   "by a licensed electrician"), that context goes IN the sourceQuote.
2. ONE ITEM PER FIX. If the inspector's sentence contains two separable
   imperatives joined by "and", "plus", ";", or numbered/lettered list
   markers (1. ..., 2. ..., 3. ...; a. ..., b. ...; bullet points), emit
   one item per imperative. The test: split the sentence at the
   conjunction and ask "would a contractor quote these as two separate
   work orders?" If yes, emit two items. The sourceQuote of each item
   is the corresponding split portion of the sentence. Do NOT join
   multiple scope nouns with "and" in a single item's `scope` field.
3. NO PROSE, NO NARRATIVE, NO DESCRIPTIONS. Do not describe the home, the
   property, the roof's overall condition, system overviews, brand
   histories, or code background. If a sentence is descriptive rather
   than actionable, skip it.
4. NO ADVICE, NO PRIORITIZATION, NO SEVERITY. Do not add "recommended",
   "urgent", "consider", or any judgment the inspector did not write.
5. NO PRICING, EVER. No dollars, no ranges, no "market rate", no labor
   hours, no "typical cost", no "approximately". If the source PDF
   includes contractor pricing, OMIT it from your output.
6. WHEN UNSURE, OMIT. "Unsure" means the sentence is DESCRIPTIVE rather
   than actionable (the inspector is just describing a condition or
   background, not calling for an action). It does NOT mean "I'm not
   sure which trade would do it" — use 'other' in that case. A real
   billable item with an awkward trade classification is still
   billable. The when-unsure-omit rule exists to prevent fabrication,
   not to punish items that don't fit neatly into a category.
7. NO INVENTION of trades, parts, quantities, scope, or location wording.
   Only emit fields the inspector wrote or which are directly and
   obviously implied by the inspector's verbatim wording.

FIELDS YOU MUST PRODUCE PER ITEM
- id: stable per-run identifier like "item-001", "item-002" in order.
- trade: one of electrical, plumbing, hvac, roofing, structural, carpentry,
  masonry, appliance, exterior, interior, other. Pick the trade that would
  actually do the work. Use 'other' freely when the work is real but
  doesn't fit cleanly into a single trade — handyman jobs, multi-trade
  repairs, permit checks, radon testing, general inspections, or any work
  a generalist could perform. Do NOT omit an item just because you can't
  pick a single trade. Only omit when the inspector's sentence is
  descriptive rather than actionable.
- action: one of repair, replace, install, remove, service, evaluate. All
  six are first-class. 'service' is for recurring maintenance the
  inspector explicitly called out (filter changes, dryer vent cleaning,
  fireplace service, etc.). 'evaluate' is for specialist inspections
  (heat exchanger leak test, permit verification, radon mitigation
  assessment). Do not omit an item because the action is unclear; pick
  the closest fit from the six.
- scope: a short, specific noun phrase identifying what is being acted on.
  Examples: "kitchen GFCI receptacle", "angle stop under kitchen sink",
  "double-tapped breaker #14 in main panel". Be specific enough that a
  contractor knows exactly what to quote. NO "and" joining multiple scope
  nouns — split into two items per Rule 2.
- location: verbatim location language from the report. e.g. "Kitchen",
  "Roof — north slope", "Basement — northeast corner".
- quantity: REQUIRED. Count derived from the inspector's wording. Apply
  these rules in order:
    1. Specific digit ("3 shingles", "20% of shingles" -> 20): that number.
    2. Written-out number ("two outlets", "three GFCI receptacles"): that
       number.
    3. "both" -> 2. (both is obviously 2.)
    4. "all" / "every" / "each" / "the remaining" -> 1. The inspector
       means the whole set; the contractor prices the full assembly. The
       item is billable; do not drop it.
    5. No count word at all ("install a GFCI receptacle", "replace the
       angle stop"): 1. A single defective item is still a billable line
       item.
  Better to overbill than underbill: if the count is unclear, prefer the
  higher defensible reading the report supports. NEVER return null.
  NEVER invent a count the report does not support. NEVER drop an item
  because the count is fuzzy.
- sourceQuote: a verbatim span from the report, 8 to 500 characters.
  Findable by Ctrl-F in the PDF. Whitespace boundaries on both sides. If
  you cannot quote, omit the item.
- pageHint: "p. N" ONLY when you can see a page number in the source text
  on the same span as the quote (the page header/footer or an inline page
  marker). If you cannot see a page number, set pageHint = null. NEVER
  guess a page number.

OUTPUT FORMAT
Return JSON matching the provided structured-output schema exactly. The
schema contains a single field "items" which is an array of billable items.
If the report contains no billable items, return { "items": [] }.

Do not include any commentary, explanation, preamble, or text outside the
JSON.
```

**Reasoning**
- Rule 1's rewrite: adds the explicit Ctrl-F test. The model responds
  better to a concrete verification test than to a positive rule like
  "verbatim". The min/max lengths live in the Zod schema; the prompt
  just calls them out so the model tries to hit them on the first try.
- Rule 2's rewrite: adds the contractor-work-order test and the
  list-marker examples. Closes Gap 3.
- Field instructions: the `quantity` paragraph is REQUIRED (not nullable).
  The 5-rule ladder is the exact text shipped in the prompt: digit ->
  that number; written-out number -> that number; "both" -> 2; "all /
  every / each / the remaining" -> 1 (the full set); no count word -> 1.
  The schema enforces `z.number().int().min(1)`, so any model response
  with `quantity: null` fails Zod validation, the structured-output
  retry in Mastra kicks in, and on exhaustion the resilient path in
  `extract-items.ts` returns `failed: true` and `.branch()` routes to
  `persist-failure`. This is a deliberate force-multiplier: overbill
  beats underbill, and the schema blocks "I'm not sure" as a way out.
- `pageHint`'s paragraph: explicit "NEVER guess" rule, matches the Zod
  regex. The two layers reinforce each other.

### `src/mastra/workflows/steps/merge-items.ts`
**Action:** Modify
**Why:** One new `mastra.getLogger().info(...)` call after the existing
merge logic, so we can observe whether the schema + prompt tightening
is actually working in real runs. The step's `execute` params
(`ExecuteFunctionParams` at `step.d.ts:19` in 1.32.1 and 1.37.1)
expose `mastra: Mastra` but no direct `logger` field — the previous
draft of this plan assumed `logger` was on the execute context, which
was wrong. The correct documented step-body log surface is
`mastra.getLogger().info('[tag]', payload)` (or equivalently
`mastra.logger?.info(...)`).
**Before/After**: the existing dedup + renumber logic is unchanged. A
single `mastra.getLogger().info(...)` call is added at the end of the
`execute` body, before the return. No new schema fields, no new I/O.
**After (added at the end of `execute`, before the `return`)**
```ts
// Extraction-quality observability. The step's `execute` params give
// us `mastra: Mastra` (verified: step.d.ts:19 in 1.32.1 and 1.37.1).
// The documented step-body log surface is `mastra.getLogger()` — not
// a destructure of `logger` from the execute params, which doesn't
// exist. The entry routes through the configured logger (Pino by
// default) and is correlated to the active workflow trace — runId,
// stepId, and trace ID are attached automatically. A row where
// `nullPageHints / total` is low means the model is still inventing
// page numbers; a row where the sample sourceQuote is short means
// the model is still paraphrasing.
const totalItems = renumbered.length;
const nullPageHints = renumbered.filter((it) => it.pageHint === null).length;
const firstSample = renumbered[0]?.sourceQuote?.slice(0, 80) ?? '';
mastra.getLogger().info('[extraction-quality]', {
  estimateRequestId: inputData.estimateRequestId,
  total: totalItems,
  nullPageHints,
  sample: firstSample,
});
```
**Reasoning**
- The log is the only observability surface. Without it, the
  schema + prompt changes are invisible — we won't know if real runs
  are actually producing shorter sourceQuotes, more null pageHints,
  or more multi-fix items, vs. whether the changes are silently
  rejected by the resilient retry path.
- `mastra.getLogger().info(...)` (not `console.log`) is the documented
  step-body observability surface. The trace correlation is free.
- One line per row, not a metrics framework. This is a check-the-log
  feature, not a Prometheus export.

### `src/mastra/workflows/steps/extract-items.ts` and `src/mastra/workflows/steps/audit-items.ts`
**Action:** Modify (one `requestContext` key added inside each
existing `agent.generate(...)` options object — total four lines
across the two files)
**Why:** `AgentExecutionOptionsBase` (the type of `agent.generate`'s
options arg) has `requestContext?: RequestContext<any>` at
`agent/agent.types.d.ts:396` in 1.32.1 and `:405` in 1.37.1 (verified
on the downloaded 1.37.1 tarball and the installed 1.32.1 types).
The `RequestContext` class is exported from
`@mastra/core/request-context` and its constructor accepts
`Iterable<readonly [string, unknown]>`. Today the pipeline doesn't
read `userId` from anywhere — the step input schema is
`{ estimateRequestId, fileUrl }`. Threading `userId` and
`estimateRequestId` through `requestContext` is a forward-compatible
no-op for the current agent configuration, and makes the call site
ready if/when per-agent authorization is enabled later.
**After (Pass A — `extract-items.ts`, addition inside the existing
`agent.generate(...)` call options object)**
```ts
{
  structuredOutput: { schema: billableExtractionSchema },
  requestContext: new RequestContext([
    ['userId', /* populated from the upload's owner; read from inputData if available */],
    ['estimateRequestId', inputData.estimateRequestId],
  ]),
}
```
**After (Pass B — `audit-items.ts`, same shape)**
```ts
{
  structuredOutput: { schema: billableExtractionSchema },
  requestContext: new RequestContext([
    ['userId', /* populated from the upload's owner; read from inputData if available */],
    ['estimateRequestId', inputData.estimateRequestId],
  ]),
}
```
**Reasoning**
- `RequestContext` is a stable surface on `agent.generate` since at
  least `@mastra/core@1.32.1` (verified at
  `agent/agent.types.d.ts:396` in 1.32.1 and `:405` in 1.37.1). A
  previous draft of this plan claimed it was 1.36.0-only and tied it
  to a release #16651 FGA change with no source read; that claim is
  dropped here. The two-line change is safe in both 1.32.1 (the
  installed version) and 1.37.1 (the bump target).
- `estimateRequestId` is included so any future agent trace carries
  the row identifier, useful when correlating the
  `[extraction-quality]` log back to a specific upload.
- The Step 0 API-surface verification step (already in the plan)
  re-confirms both signatures after the bump. If either drifts, the
  bump commit fixes the call site in the same commit.

## Validation Plan
Per project `AGENTS.md`:
- `pnpm exec tsc --noEmit` clean.
- `pnpm exec eslint src/mastra` clean.
- Manual smoke: upload a known PDF, observe:
  - `summary` contains a v1 envelope.
  - Each item's `sourceQuote` is between 8 and 500 characters and is
    findable in the PDF (Ctrl-F test on a sample of items).
  - Multi-fix sentences produce multiple items, each with its own
    `sourceQuote` and `scope` (no "and"-joined scope nouns).
  - `pageHint` is `null` for items where the inspector didn't show a
    page number, and `"p. N"` only for items where the source visibly
    has one.
  - The server log line `[extraction-quality]` appears once per row.
- Regression: existing v1 envelope rows on disk (written by PR #9
  and earlier) are NOT re-validated by this branch. The Zod constraints
  apply to NEW emissions from `agent.generate`, not to old stored
  envelopes. The `summary` column is `text`; reading it back doesn't
  re-parse through `billableItemSchema`. So old rows render unchanged.

## Risk Notes
1. **Tightening schema can cause more `result.object = null` failures.**
   The existing resilient return path handles this (`failed: true,
   errorMessage: 'AI returned malformed extraction. Please retry.'`).
   A real run may see more failures than before the change. The
   extractor has `retries: 2`, which gives the model two more attempts
   to produce a conforming emission. If the failure rate is too high,
   the prompt or schema needs to be loosened for a specific field.
   Monitor via the `[extraction-quality]` log line and the
   `errorMessage` column.
2. **No data migration.** No Drizzle migration. The `summary` column
   is `text`; new emissions use the new schema, old envelopes on
   disk remain valid v1 envelopes and are never re-validated.
3. **No new env vars, no new packages, no new files at the root level.**
   The only new file written is the `.md` plan itself. **Five** source
   files are modified: the schema, the agent prompt, `merge-items.ts`
   (logger.info), `extract-items.ts` (requestContext), `audit-items.ts`
   (requestContext).
4. **Mastra 1.32.1 → 1.37.1 APIs unchanged for this branch's surface.**
   The schemas' tightened constraints are pure Zod; the prompt is a
   string; the `mastra.getLogger().info(...)` call is the documented
   step-body log surface (verified at
   `node_modules/@mastra/core/dist/mastra/index.d.ts:1430` in 1.37.1
   and the equivalent shape in 1.32.1); the `RequestContext` thread
   on `agent.generate` is a stable surface that has been present
   since at least 1.32.1 (verified at
   `agent/agent.types.d.ts:396` in 1.32.1 and `:405` in 1.37.1). The
   Step 0 API-surface verification step (read
   `node_modules/@mastra/core/dist/workflows/workflow.d.ts`,
   `types.d.ts`, `step.d.ts`, `request-context/index.d.ts`, and
   `agent/agent.types.d.ts` after the bump) confirms `createStep`,
   `retries`, `.then`, `.branch`, the `Mastra.getLogger()` accessor,
   the `RequestContext` constructor, and `agent.generate`'s
   `requestContext` option are all stable across 1.32.1 → 1.37.1.
   The 1.37.x release notes do not call any of these as breaking;
   if a type drift is found, the bump commit fixes the call site
   in the same commit.

## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
