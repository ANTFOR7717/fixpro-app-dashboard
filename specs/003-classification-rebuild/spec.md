# Feature Specification: Classification Module Rebuild — Labor/Material/Trade Determination

**Feature Branch**: `003-classification-rebuild`

**Created**: 2026-07-16

**Status**: Draft

**Input**: User description: "Fully scrap and rebuild the estimate-extraction-pipeline's classification/ module, replacing every part of it -- it is confirmed overengineered, broken in production, and not to be used as a reference for the rebuild's structure, naming, or patterns. Narrow, exact scope: given extraction's already-grounded findings, determine for each finding: (1) whether labor and/or material is involved, (2) for material -- the quantity and the unit type of material, (3) for labor -- how many hours and what type of labor, and (4) which trade is associated, understood through what labor is happening with what materials. Explicitly out of scope: web search / external grounding; pricing logic itself; any dollar-amount determination. Required architecture: a per-finding nested workflow (materials step, then labor step, then trade step), fanned out via `.foreach()`, decoupled so each step's correctness never depends on an earlier step's output being non-empty, but sequenced so later steps can read earlier results as context via getStepResult()/getInitData(). Each step needs access to the relevant original parsed-document context near the finding's pageHint/sourceQuote. Confirmed anti-patterns that must not recur: a false-claim-justified hand-rolled execute()+.stream() fallback instead of bare createStep(agent, {structuredOutput}); a broken external tool patched with prompt text instead of fixed/removed; dead/duplicate exports; an implicit stringly-typed ID-suffixing convention; one large batched agent call with a shared tool-step budget."

> **Framing note**: this spec's subject is an internal pipeline module
> (the classification stage of an AI-driven repair-estimate pipeline),
> not a standalone user-facing feature. Two stakeholders are real here,
> not one: the **developer** rebuilding this module, and — because this
> module's output becomes real line items on a real customer's repair
> estimate — the **end user** requesting that estimate, who is directly
> affected by whether classification's labor/material/hours/trade
> determinations are actually correct. User Scenarios below are framed
> around the end user's stake in correctness; Functional Requirements
> necessarily name technical terms (findings, trade, pageHint) because
> the feature's own subject is a technical determination process — the
> same documented exception already used in this project's `001-`/`002-`
> specs for the same reason.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An estimate correctly separates material and labor for each defect (Priority: P1)

A homeowner uploads an inspection report through FixPro. For each defect
the report's inspector identified, the estimate they receive must
correctly reflect what physical materials are needed (and how much) and
what labor is required (and how many hours) — not a fabricated or
overengineered guess, and not a defect silently dropped or merged with
another.

**Why this priority**: This is the entire reason the module exists. If
this is wrong, every downstream number (and every dollar figure pricing
later attaches) is built on a wrong foundation.

**Independent Test**: Process a real inspection report's findings through
the rebuilt classification stage and confirm, for a defect known to
involve both a physical part and installation work (e.g. a damaged
board), the result names a real material with a real quantity/unit *and*
a real labor-hours figure — not one or the other, and not a placeholder
number.

**Acceptance Scenarios**:

1. **Given** a finding whose text describes a physical component needing
   repair or replacement, **When** it is classified, **Then** the result
   includes at least one material with a real quantity and a real unit
   type grounded in the finding's own content or its surrounding source
   document context.
2. **Given** a finding whose text describes work with no physical part
   involved (e.g. tightening an existing fixture), **When** it is
   classified, **Then** the result includes zero materials and a correct
   labor determination — the absence of material information does not
   block or degrade the labor determination.
3. **Given** a finding, **When** it is classified, **Then** the result
   names a trade consistent with the actual labor and materials
   determined for that finding, not assigned independently of them.

---

### User Story 2 - A defect that needs no material still gets a correct labor determination (Priority: P1)

Many defects (e.g. "loose door hinge," "receptacle not holding plug")
involve no physical material at all — pure labor. The system must
classify these correctly and completely without needing material data
that will never exist for them.

**Why this priority**: Equal priority to User Story 1 — this is the
"decoupled" requirement itself. A design that only works when every
finding has both material and labor is not decoupled, it just hasn't
been tested against the labor-only case yet.

**Independent Test**: Process a finding known to be labor-only (from a
real report) and confirm it receives a complete, correct labor
determination (hours + labor type) with an empty materials result — and
that this does not raise an error, block, or produce a degraded result
compared to a material-and-labor finding.

**Acceptance Scenarios**:

1. **Given** a labor-only finding, **When** classified, **Then** the
   materials determination is an empty result (not an error, not a
   placeholder material), and the labor determination is still complete
   and correct.

---

### User Story 3 - An unresolvable amount is represented honestly, not invented (Priority: P2)

Occasionally a finding's own text and its surrounding document context
give no real basis for a quantity, hour count, or trade (and, per this
pass's scope, no web lookup is available to fill the gap). The system
must represent this honestly — as a flagged result carrying the context
a future web-search step would need — never as a fabricated,
plausible-sounding number or a silent catch-all trade value.

**Why this priority**: Directly enforces this project's own "never
fabricate, never guess" principle for the one case most likely to tempt
a shortcut. Secondary to User Stories 1–2 because it's the less common
path, not because it matters less in principle.

**Independent Test**: Identify or construct a finding whose text and
document context genuinely give no basis for a quantity/hours/trade
determination, classify it, and confirm the result is a
`flagged_for_web_search` result carrying the finding, document excerpt,
and failure reason — never a plausible-sounding invented value or a
generic taxonomy fallback.

**Acceptance Scenarios**:

1. **Given** a finding with no determinable quantity, hours, or trade
   from its own content or surrounding document context, **When**
   classified, **Then** the corresponding value is a
   `flagged_for_web_search` result distinguishable from a real, grounded
   zero or a real, grounded value, and carrying enough context for a
   future web-search step to resolve it without re-deriving anything.

### Edge Cases

- What happens when a finding names multiple physically distinct
  materials (e.g. two different components with two different natural
  units)? See Clarification Q1.
- What happens when a finding is genuinely both material *and* labor
  (the common case) — do the materials and labor determinations run in
  the required sequence (materials first) every time, with labor able to
  read the materials result as context?
- What happens when a finding's surrounding document context (the page(s)
  near its `pageHint`) contains information relevant to a *different*
  finding on the same page? The determination for THIS finding must not
  incorporate facts that only support a different finding's scope.
- What happens when trade cannot be cleanly inferred from the determined
  labor/materials, or genuinely falls outside the sourced taxonomy in
  Clarification Q3? It becomes a `flagged_for_web_search` result (Q2),
  not a generic/`other` taxonomy value.
- What happens when one finding's classification fails outright (e.g. a
  transient error)? It must not prevent any other finding in the same
  batch from being classified (per the decoupled, per-finding
  architecture).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: For every finding produced by extraction, the system MUST
  determine whether the described work involves material, labor, or
  both.
- **FR-002**: For material involved, the system MUST determine, for each
  distinct material identified (a finding may identify zero, one, or
  more — see Clarification Q1), a real quantity and a real unit type,
  grounded in the finding's own content or its surrounding source
  document context — never a fabricated or default quantity. Any
  material quantity that cannot be determined this way MUST use the
  `flagged_for_web_search` representation (FR-010), never a bare null.
- **FR-003**: For labor involved, the system MUST determine a real hour
  count and a description of the labor type, grounded the same way. Any
  labor-hours value that cannot be determined this way MUST use the
  `flagged_for_web_search` representation (FR-010), never a bare null.
- **FR-004**: The system MUST determine which trade is associated with
  each finding, derived from the combination of that finding's
  determined labor and materials — never assigned independently before
  those are known — selected from the closed, sourced taxonomy in
  Clarification Q3. A finding whose trade cannot be derived from that
  taxonomy even with full document context MUST use the same
  `flagged_for_web_search` representation (FR-010) rather than a
  generic/`other` taxonomy value — the taxonomy itself has no such
  value.
- **FR-005**: The materials determination and the labor determination
  MUST each be independently correct regardless of whether the other
  produced a non-empty result — a labor-only finding must classify
  correctly with no material data present (User Story 2), and this MUST
  NOT be treated as a failure or degraded case.
- **FR-006**: The labor determination MAY use the materials determination
  as additional context when present (e.g. to reason about installation
  effort for a specific material), and the trade determination MAY use
  both, but neither is required for the other to succeed (FR-005).
- **FR-007**: The system MUST have access to the source document content
  surrounding a finding's own extracted location (its `pageHint`), not
  only the finding's own summarized fields, so that a nearby stated
  measurement or detail the finding's own text didn't capture can still
  inform the determination.
- **FR-008**: Determinations MUST be based only on (a) the finding's own
  content and (b) its surrounding source-document context — no external
  or web-based lookup in this pass (explicitly deferred, see
  Assumptions).
- **FR-009**: Every finding submitted for classification MUST receive a
  result — no finding may be silently dropped, and one finding's
  processing failure MUST NOT prevent any other finding from being
  classified.
- **FR-010**: When a finding's own content and surrounding document
  context give no real basis for a quantity, hour count, or trade, the
  system MUST represent that value as a `flagged_for_web_search` result
  (User Story 3) — never a bare null and never a fabricated
  plausible-sounding value. This result MUST carry: the full originating
  finding, the surrounding parsed-document excerpt near its `pageHint`,
  a short machine-readable reason the determination failed, and whatever
  else this pass DID successfully determine for the same finding — so a
  future (out-of-scope-for-this-pass) web-search resolution step can act
  without re-deriving any of it. See Clarification Q2 and the
  **Web-Search Flag** key entity.
- **FR-011**: This feature is scoped strictly to the labor/material/
  quantity/unit/hours/trade determination described above. It MUST NOT
  add web-search-based grounding, MUST NOT perform any dollar-amount or
  pricing determination, and MUST NOT alter extraction's or pricing's
  own responsibilities beyond the minimal interface needed to consume
  extraction's findings and hand off a result pricing can use.

### Key Entities *(include if feature involves data)*

- **Finding**: one already-grounded defect from extraction (action,
  scope, location, stated quantity, inspector hours, verbatim source
  quote, page hint) — this feature's input, unchanged by this feature.
- **Material Determination**: one physical material identified for a
  finding — its name, and either a real quantity + real unit type, or a
  Web-Search Flag if no real basis for the quantity exists. A finding
  may determine zero, one, or more of these (see Clarification Q1).
- **Labor Determination**: the labor identified for a finding — a
  description of the labor type, and either a real hour count or a
  Web-Search Flag if no real basis for the hours exists. Every finding
  produces exactly one of these (a "zero labor" finding is not a case
  this spec currently anticipates — flagged as an assumption, not a
  clarification, since no example of one was raised).
- **Trade**: the trade associated with a finding, derived from its
  Material and Labor Determinations together, selected from the closed,
  sourced taxonomy defined in Clarification Q3, or a Web-Search Flag if
  no trade in that taxonomy can be derived.
- **Web-Search Flag**: the shared "couldn't determine" representation
  used identically for material quantity, labor hours, and trade (see
  Clarification Q2 and FR-010) — carries the full originating finding,
  the surrounding document excerpt near its `pageHint`, a short reason
  the determination failed, and whatever else was successfully
  determined for the same finding. Never itself a taxonomy value or a
  bare null.
- **Classification Result**: one finding's complete output — its
  Material Determination(s), Labor Determination, and Trade (each
  possibly a Web-Search Flag instead of a resolved value) — the handoff
  artifact to pricing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Processing a real inspection report's findings produces a
  complete Classification Result for every finding, with no finding
  silently dropped or left unclassified.
- **SC-002**: A labor-only finding (verified against at least one real
  example) receives a correct, complete labor determination with an
  empty materials result, with no error and no degraded outcome compared
  to a material-and-labor finding.
- **SC-003**: A material-and-labor finding (verified against at least one
  real example) receives both a real material determination and a real
  labor determination, each independently correct.
- **SC-004**: The trade assigned to a sample of real classified findings
  is, on human review, consistent with the labor and materials actually
  determined for each — not assignable independently of them.
- **SC-005**: At least one real finding with no determinable quantity,
  hours, or trade (from its own content and surrounding document
  context) is classified with that value represented as a
  `flagged_for_web_search` result carrying the finding, document
  excerpt, and failure reason, never a fabricated number or a generic
  taxonomy value.
- **SC-006**: One finding's classification failing (simulated or real)
  does not prevent any other finding in the same batch from being
  classified and reported.

## Clarifications

### Question 1: Multiple distinct materials per finding — RESOLVED

**Resolution**: Option A. A finding's Material Determination is an array
(possibly empty, possibly 2+) — a finding may name zero, one, or several
physically distinct materials, each with its own name/quantity/unit. See
FR-002 and Key Entities.

### Question 2: What "undetermined" means for downstream handoff — RESOLVED

**Resolution**: Neither offered option (both were rejected as
under-designed — silently passing null, or excluding the finding
wholesale for manual resolution, are both a form of giving up rather
than designing for the feature's actual future). The undetermined case
hands off automatically (the pipeline stays fully automated end-to-end,
matching Option A's automation property) but the undetermined value
itself is **not a bare null** — it is a `flagged_for_web_search` result
carrying every piece of context a future (out-of-scope-for-this-pass)
web-search resolution step would need to succeed without re-deriving
anything: the full originating finding, the surrounding parsed-document
excerpt near its `pageHint` (captured once now via `getInitData()`/
`getStepResult()`, not re-fetched later), a short machine-readable
reason the determination failed, and whatever this pass DID manage to
determine for the same finding (e.g. materials succeeded but labor
hours didn't). This is a single reusable shape, applied identically
wherever a value can't be determined: material quantity, labor hours,
*and* trade (see Question 3) — not three separate ad hoc
undetermined-handling schemes. See FR-010, updated FR-004, and the new
**Web-Search Flag** key entity.

### Question 3: Trade taxonomy — RESOLVED

**Resolution**: Neither offered option — reusing the existing 11-value
set (rejected: it is unsourced, and its `other` fallback is exactly the
laziness being eliminated from this rebuild) nor inventing a new list
from scratch (which would be guessing, not researching) is acceptable.
Instead the taxonomy is **derived from real, published state contractor
licensing classifications**, not guessed:

- Primary source: **Tennessee Board for Licensing Contractors,
  "Classification Outline with Trade Exam Requirements"** (Rev. 5/2019,
  tn.gov) — read directly (full text extracted from the published PDF,
  not summarized from memory) — its 34 residential "Building Categories"
  (BC-1..BC-34), its Mechanical Contracting classes (CMC-A plumbing,
  CMC-C HVAC, CMC-D fire protection/sprinklers), its Electrical
  Contracting classes (CE), and its Specialty/Environmental classes
  (S-F mold remediation, etc.).
- Cross-referenced against Maryland's separate Board of Electricians /
  Board of Plumbing / Board of HVACR Contractors and Virginia DPOR's
  classification structure, confirming the same three-tier shape
  (general building trades / mechanical-electrical trades /
  environmental-specialty trades) is a standard multi-state pattern,
  not one state's idiosyncrasy.

The resulting taxonomy — scoped down to the trades a *residential home
inspection* finding can plausibly implicate (dropping this source's
commercial/industrial/heavy-construction/highway categories entirely,
since those cannot arise from a home inspection report) — is a **closed
set with no `other` value**:

`electrical`, `plumbing`, `hvac`, `fire_protection`, `roofing`,
`siding`, `carpentry`, `drywall`, `flooring`, `glazing`, `masonry`,
`painting`, `insulation`, `concrete`, `waterproofing`, `tile`,
`foundation`, `excavation_grading`, `landscaping`, `fencing`,
`mold_remediation`, `pest_control`, `general_contractor`.

`pest_control` is included even though it falls outside general
contractor licensing boards in every source checked (it is separately
licensed as structural pest control in every state researched) because
wood-destroying-insect findings are common in home inspection reports
and it is a real, named, licensed trade — not a guess.
`general_contractor` is included because it is itself one of this
source's own real, licensed categories (TN's BC-A, "Residential
Building Contractor," authorized to perform any of the 34 building
categories on a single-family dwelling) — used deliberately for a
finding whose repair is legitimately general/multi-scope, never as a
silent catch-all for a failed determination.

A finding whose trade genuinely cannot be derived from this set even
with full document context does **not** fall back to a 24th "other"
value — it produces the same `flagged_for_web_search` result defined
in Question 2, keeping exactly one mechanism for "couldn't determine,"
not two competing ones. See FR-004 and the **Trade** key entity.

## Assumptions

- Web-search/external grounding for quantities, hours, or trade is
  explicitly deferred to a future pass (per the user's own description)
  — this feature works only from the finding's own content and its
  surrounding parsed-document context. This pass only produces the
  `flagged_for_web_search` data contract (Clarification Q2); it does not
  build the web-search step itself, and does not call any external
  search tool or API.
- Pricing's own logic, schema, and responsibilities are unchanged by this
  feature — this feature only changes what classification hands to it,
  not how pricing itself works.
- Every finding is assumed to produce exactly one Labor Determination
  (never zero) — no example of a finding needing zero labor was raised
  in this feature's description; if one exists, it is out of scope for
  this spec to anticipate speculatively and should surface as a real
  case during implementation, not be guessed at now.
- The per-finding processing architecture (a nested per-finding sequence,
  fanned out across all findings) is a settled architectural decision
  from prior discussion, not re-litigated as a clarification here.
