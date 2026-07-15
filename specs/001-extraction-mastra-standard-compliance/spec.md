# Feature Specification: Extraction Module — Clean-Room Rebuild + Removal of the Fake-Grounding Citation Mechanism

**Feature Branch**: `001-extraction-mastra-standard-compliance`

**Created**: 2026-07-14

**Revised**: 2026-07-15 (scope corrected — see Revision Note)

**Status**: Draft

**Input**: User description: "Rebuild the extraction/ module of
src/features/estimate-extraction-pipeline/ so it fully complies with
plans/MASTRA-AGENT-WORKFLOW-STANDARD.md (status: BINDING)." Later
corrected, verbatim: "remove [the sentence-citation mechanism], that was
before the pdf-parse... redo the spec, if you leave any more hand-rolled
slop because of [narrow scoping] assumptions..."

## Revision Note (read first)

The original version of this spec scoped the rebuild to `extraction/`
only, on the assumption that the module's sentence-citation-and-resolve
mechanism was legitimate, preservable business logic. That assumption was
wrong, and the user corrected it directly:

**The mechanism is fake grounding, not real grounding.** Today,
`findingExtractorAgent` first invents a list of "meaningful sentences"
(with self-assigned IDs) as part of its own response, then cites one of
those IDs per finding, and `resolveFindingsStep` mechanically looks the
ID up in that SAME response's sentence list. Nothing in this chain checks
a cited sentence against the actual `parsedDocument` the model was given
— the "resolution" step only proves a finding's citation matches the
model's own self-reported list, not that the list itself is accurate to
the source PDF. If the model hallucinates a sentence AND a finding citing
it, resolution succeeds silently. This design made sense under an earlier
architecture (pre-`pdf-parse`, when this pipeline pre-chunked/embedded
document text deterministically before the model ever saw it — see
`plans/FEATURE/FEATURE(docling-extraction-pipeline)` history and the
already-deleted `document/embed.ts`/`vector-store.ts`). It does not make
sense now: `document/parse.ts`'s `parsePdfFromUrl` hands the ENTIRE
report to the agent as plain prompt text in one shot (this is Rule 3 of
`plans/MASTRA-AGENT-WORKFLOW-STANDARD.md`'s own stated reasoning for why
no tool-mediation is needed). A citation scheme designed to resolve
references into pre-chunked, code-verified text has no verified text left
to resolve into — it resolves into the model's own unverified claims
about itself.

**Corrected scope**: the mechanism is removed entirely, not preserved.
`findingExtractorAgent` emits `sourceQuote`/`pageHint` directly on each
finding (single pass, no sentence-invention step, no citation, no
resolution step). This ripples beyond `extraction/`, traced end-to-end in
this revision: `pipeline.ts` (drops `resolveFindingsStep` from the chain,
drops `sentences` from its output), `estimate/lib/envelope.ts` (drops
`sentences` from the v3 schema), `estimate/lib/workflow.ts` (drops
`sentences` from the persisted envelope), `estimate/components/items-section.tsx`
(drops the "Meaningful Sentences" debug JSON panel — the data it rendered
no longer exists), `estimate/components/estimate-report.tsx` (drops the
now-unused `sentences` variable/prop). All five outside `extraction/` are
confirmed, real, currently-shipped consumers of the data being removed —
verified by reading each file's current content, not assumed.

## Framing note

This is not a user-facing product feature — it is a structural
correction that also removes a specific piece of business logic
(business logic itself is normally out of scope for this kind of spec,
but this specific mechanism is being removed because it does not do what
it claims to do, which is a defect, not a design preference). "User"
below means whoever is affected: the person submitting an inspection
report (their debug view stops showing meaningless self-referential
JSON; extraction gets simpler and slightly cheaper — one fewer step), and
the engineer maintaining this pipeline (no longer maintains a mechanism
that looks like a safety net but isn't one).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The fake-grounding citation mechanism is removed end-to-end, not just restructured (Priority: P1)

`extraction/`'s sentence-invention-and-citation scheme is deleted, not
kept in a different shape. `findingExtractorAgent` emits
`sourceQuote`/`pageHint` directly, verbatim from the source text it was
given, per finding — no intermediate sentence list, no ID, no separate
resolution step. Every downstream consumer of the removed `sentences`
data (`pipeline.ts`, `envelope.ts`, `workflow.ts`, `items-section.tsx`,
`estimate-report.tsx`) is updated to match — none of them are left
importing or referencing a type/field that no longer exists.

**Why this priority**: This is the actual defect this spec exists to
fix — a mechanism that presents as a grounding/reliability feature while
providing none, and the user's explicit, repeated instruction not to
leave hand-rolled slop in place because of an artificially narrow scope
boundary.

**Independent Test**: `grep -rn "sourceSentenceId\|resolveFindingsStep\|meaningfulSentenceSchema\|MeaningfulSentence\|resolvedExtractionSchema\|ResolvedExtraction" src/` returns zero results anywhere in the codebase after this change. A real inspection report run still produces findings with real `sourceQuote`/`pageHint` values.

**Acceptance Scenarios**:

1. **Given** the rebuilt `extraction/schema.ts`, **When** inspected,
   **Then** `meaningfulSentenceSchema`, `rawFindingSchema`,
   `resolvedExtractionSchema` (and their inferred types) no longer exist
   — `extractedFindingSchema` is the ONLY finding shape, used both as the
   agent's structured-output schema and as the public contract handed to
   `classification/`.
2. **Given** the rebuilt `extraction/steps.ts`, **When** inspected,
   **Then** `resolveFindingsStep` no longer exists; `findingExtractorAgentStep`'s
   output feeds `classification/`'s prompt-building step directly.
3. **Given** `pipeline.ts`, `envelope.ts`, `workflow.ts`,
   `items-section.tsx`, `estimate-report.tsx`, **When** inspected,
   **Then** none references `sentences`, `MeaningfulSentence`, or the
   "Meaningful Sentences" debug panel — each is updated to the shape that
   exists post-removal, not left pointing at a deleted field.
4. **Given** a real inspection report, **When** it runs through the
   updated pipeline, **Then** every finding's `sourceQuote` is verbatim
   text the inspector actually wrote (spot-checked against the source
   PDF) and `pageHint` is accurate — the actual reliability property this
   whole mechanism was meant to provide, now delivered by the agent's own
   direct instruction discipline instead of a self-referential citation
   scheme that never verified it.

---

### User Story 2 - `findingExtractorAgentStep` retries automatically on transient failure (Priority: P1)

Unchanged from the prior version of this spec: `findingExtractorAgentStep`
— the workflow's single highest-blast-radius network call — gains
`retries: 2`, matching `parseDocumentStep`'s existing precedent. Verified
against the installed `@mastra/core` package's actual implementation
(`createStepFromAgent` in `chunk-CJAAPSS7.cjs`), not assumed from types.

**Acceptance Scenarios**: unchanged from the prior version — see
Functional Requirements FR-004.

---

### User Story 3 - Every rule in the binding Standard is true of the rebuilt code (Priority: P1)

Unchanged in intent from the prior version: all 5 rules in
`plans/MASTRA-AGENT-WORKFLOW-STANDARD.md` verified against the code as it
exists AFTER User Story 1's removal — not before. Rule 5's prior
"Unresolved" status is closed with a sourced answer, written into the
Standard document itself.

### Edge Cases

- What happens to the `extraction-consistency` scorer's own logic — does
  it depend on `sentences`/citation data? → Must be checked during
  implementation (`extraction/scorer.ts` is unchanged/out of prior scope,
  but if it reads `sentences` from the run output, it breaks silently
  once removed — this is exactly the kind of downstream dependency this
  revision exists to catch, so it must be checked, not assumed clear).
- What happens to the "Show Debug JSON" toggle's UI once the "Meaningful
  Sentences" panel is removed — does the toggle still make sense with
  only one panel (`parsedDocument`)? → Keep the toggle and the one
  remaining panel; removing the toggle entirely is a UI-scope decision
  beyond what this spec's data-layer removal requires, and the toggle
  still serves its purpose (showing the raw parsed document) with one
  panel instead of two.
- What happens to persisted v3 envelope ROWS that already have a
  `sentences` field from before this change (this session's own earlier
  PR added it, live on `refactor/extraction-mastra-native-workflow`,
  possibly not yet merged/deployed)? → `sentences` was added with
  `.default([])` specifically so old rows without it still parse;
  removing the field entirely means NEW rows never have it and old rows
  with it just have an extra ignored JSON key when re-parsed (Zod drops
  unknown keys by default unless `.strict()` is used — confirmed not
  used here). No migration needed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `extraction/schema.ts`, `agent.ts`, `steps.ts`, `index.ts`
  MUST be rebuilt with the sentence-invention-and-citation mechanism
  removed entirely: no `meaningfulSentenceSchema`, `rawFindingSchema`,
  `resolvedExtractionSchema`, `sourceSentenceId`, or `resolveFindingsStep`
  anywhere. `extractedFindingSchema` becomes the agent's direct
  structured-output shape.
- **FR-002**: `findingExtractorAgent`'s instructions MUST be rewritten so
  the agent emits `sourceQuote` (verbatim source text) and `pageHint`
  directly per finding, in the SAME single response, with no
  intermediate sentence-listing step. The DEFINITION of a billable
  finding, the HARD RULES (one finding per fix, no prose, no
  trade/unit/pricing, etc.), and the per-field semantics for
  `action`/`scope`/`location`/`statedQuantity`/`inspectorHours` MUST be
  preserved unchanged — only the citation/grounding mechanism changes,
  not what counts as a finding or what its other fields mean.
- **FR-003**: `pipeline.ts` MUST be updated to remove `resolveFindingsStep`
  from the workflow chain and stop threading `sentences` through to its
  final output. This is a real composition change, not import-path
  wiring — `pipeline.ts` is explicitly IN scope for this revision
  (superseding the prior version's exclusion).
- **FR-004**: `findingExtractorAgentStep` MUST retry automatically on
  failure (`retries: 2`, matching `parseDocumentStep`'s precedent),
  verified against the installed package's actual implementation.
- **FR-005**: `estimate/lib/envelope.ts`'s v3 schema MUST drop the
  `sentences` field and its `meaningfulSentenceSchema` import.
  `estimate/lib/workflow.ts` MUST stop writing `sentences` into the
  persisted envelope.
- **FR-006**: `estimate/components/items-section.tsx` MUST drop the
  `sentences` prop, the `MeaningfulSentence` import, and the "Meaningful
  Sentences (Semantic Selection)" debug JSON panel — the data it
  displayed no longer exists. The "Parsed Document (page-level)" panel
  and the "Show Debug JSON" toggle itself are kept (see Edge Cases).
- **FR-007**: `estimate/components/estimate-report.tsx` MUST drop its now-
  unused `sentences` variable and the `sentences={sentences}` prop pass.
- **FR-008**: `extraction/scorer.ts` MUST be checked for any dependency
  on the removed `sentences`/citation data during implementation, and
  updated if one exists — not assumed clear.
- **FR-009**: Every rule in `plans/MASTRA-AGENT-WORKFLOW-STANDARD.md`
  (Rules 1–5) MUST be verified against the code as it exists AFTER this
  removal, each with a pass/fail verdict and citation. Rule 5's
  "Unresolved" status MUST be resolved with a sourced answer written
  into the Standard document itself.
- **FR-010**: Every doc comment in every touched file MUST describe
  current, post-removal behavior — none may describe the removed
  mechanism as if it still exists.
- **FR-011**: The rebuild MUST NOT expand into `classification/`'s or
  `pricing/`'s own internal logic beyond the minimum wiring needed to
  consume `extraction/`'s new (simpler) output shape — their own
  business logic stays untouched.
- **FR-012**: MUST pass every validation gate established for this
  pipeline: `pnpm exec tsc --noEmit` (whole project, since this now
  touches files outside `extraction/`), `pnpm exec eslint` on every
  touched file, all one-door boundary/purity greps in `AGENTS.md`, `pnpm
  build`.

### Key Entities

- **`extractedFindingSchema`**: now the ONLY finding shape — both the
  agent's structured-output contract and the public shape handed to
  `classification/`. Gains direct `sourceQuote`/`pageHint` fields the
  agent itself populates (previously computed by `resolveFindingsStep`
  from a citation).
- **`findingExtractorAgentStep`**: unchanged subject of the `retries: 2`
  requirement (FR-004).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `grep -rn "sourceSentenceId\|resolveFindingsStep\|meaningfulSentenceSchema\|MeaningfulSentence\|resolvedExtractionSchema\|ResolvedExtraction" src/` returns zero results after implementation.
- **SC-002**: `findingExtractorAgentStep` recovers automatically from a single transient failure, verified by a forced-failure test.
- **SC-003**: A rule-by-rule audit of the POST-REMOVAL `extraction/` against all 5 Standard rules shows zero unresolved items, each with a citation; Rule 5's answer is recorded in the Standard document.
- **SC-004**: A real inspection report run produces findings whose `sourceQuote` is verbatim, spot-check-accurate source text, and whose `pageHint` is correct — confirming the citation mechanism's removal did not silently degrade grounding quality, it just stopped faking a guarantee it never actually enforced.
- **SC-005**: `classification/`'s own typecheck and boundary greps still pass, confirming its contract with `extraction/` (now just `extractedFindingSchema`/`ExtractedFinding`/`ACTION`) is intact.
- **SC-006**: `pnpm exec tsc --noEmit` (whole project), `pnpm exec eslint`, all one-door boundary/purity greps, `pnpm build` all pass clean.

## Assumptions

- Removing `sourceSentenceId`/the citation mechanism is a NET reliability
  improvement, not a regression, because the mechanism never verified
  citations against the real source document — it only proved
  self-consistency within one model response. This is stated as fact,
  not a hedge, per the Revision Note's analysis; if evidence during
  implementation contradicts this (e.g. `extraction-consistency` scorer
  data showing the mechanism caught real errors), that must be surfaced
  immediately, not silently overridden.
- The "Show Debug JSON" toggle and its remaining "Parsed Document" panel
  stay in `items-section.tsx` — only the "Meaningful Sentences" panel is
  removed (Edge Cases). If the user wants the whole toggle removed
  instead, that's a distinct, smaller follow-up.
- No new dependency, infrastructure, or persistence required. This is a
  removal, net negative in lines of code and moving parts.
- `classification/`'s own equivalent missing-`retries` gap remains out of
  scope (unchanged from the prior version of this spec) — noted for a
  future pass.
