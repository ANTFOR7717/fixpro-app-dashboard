# Feature Specification: Estimate-Extraction-Pipeline Accuracy Eval Harness

**Feature Branch**: `002-pipeline-eval-harness`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "Build a repeatable, non-UI, non-Playwright test/eval loop for the estimate-extraction-pipeline (document parse -> extraction -> classification -> pricing) that runs against real inspection-report PDF fixtures checked into the repo. There is currently no usable fixture (the only PDF present, dummy.pdf, is an empty placeholder with no content stream) -- more real PDFs will be added over time as test cases. The eval must genuinely check accuracy end-to-end per pipeline stage (not just 'did it run without throwing') against known/expected findings for each fixture PDF, so pipeline regressions in extraction/classification/pricing accuracy are caught automatically. Must avoid overengineering: no bloated test framework, no mocked-LLM harness, no speculative abstraction beyond what's needed to run a fixture through the real pipeline and diff the result against expected output."

> **Framing note**: this spec's subject is a developer-facing accuracy tool
> for an existing internal pipeline, not an end-user product feature. The
> "user" throughout is the developer/maintainer who changes
> `estimate-extraction-pipeline` code and needs fast, trustworthy signal on
> whether that change broke real-world accuracy — the closest fit to this
> template's "user scenarios" framing, and the actual stakeholder this
> feature serves.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Catch an accuracy regression before it ships (Priority: P1)

A developer changes something in the pipeline — the extraction agent's
instructions, a classification rule, a pricing lookup — and needs to know,
before opening a PR, whether that change silently made the pipeline worse
at its actual job (finding the right defects, classifying them correctly,
pricing them sensibly) on real inspection reports. Today the only way to
find out is to manually run the full app through the browser and eyeball
one report. This story replaces that manual step with a single command
that runs every checked-in fixture PDF through the real, unmodified
pipeline and reports whether each pipeline stage's output still matches
what that fixture is known to produce.

**Why this priority**: This is the entire point of the feature — without
it, nothing else in this spec has value. A developer must be able to
answer "did I just regress accuracy?" without touching a browser.

**Independent Test**: Can be fully tested by running the eval command
against the current (working) pipeline and confirming every fixture
reports pass, then deliberately introducing a known regression (e.g.
dropping a required field from the extraction agent's output schema) and
confirming the eval command now reports a failure that names the stage
and the fixture affected.

**Acceptance Scenarios**:

1. **Given** a fixture PDF and its expected output are checked into the
   repo, **When** the developer runs the eval command, **Then** the real
   pipeline runs against that PDF and the command reports pass/fail for
   each of the extraction, classification, and pricing stages for that
   fixture.
2. **Given** the pipeline's current behavior matches every fixture's
   expected output, **When** the eval command runs the full fixture set,
   **Then** it exits reporting all fixtures passing, with a per-fixture,
   per-stage summary.
3. **Given** a code change that causes the extraction stage to miss a
   defect a fixture's expected output requires, **When** the eval command
   runs, **Then** it reports that fixture's extraction stage as failed and
   names the specific missing/mismatched finding — not merely "run
   failed."

---

### User Story 2 - Add a new real-world test case without touching harness code (Priority: P2)

Over time, more real inspection-report PDFs will be added as test cases —
each one exercising different report structures, defect types, and edge
cases the pipeline must handle correctly. A developer adding a new fixture
should only need to (a) drop the PDF in the fixtures location and (b)
author the expected output for it by hand once (reading the report and
recording what the pipeline *should* find/classify/price). No change to
the harness's own code should be required for the new fixture to be
picked up and run alongside existing ones.

**Why this priority**: Without this, the harness stops scaling the moment
a second real fixture is needed, which the input explicitly says is
coming. This is what makes the harness a durable regression net instead
of a one-off script tied to one PDF.

**Independent Test**: Can be fully tested by adding one new fixture PDF
and one new expected-output file, running the eval command with no other
changes, and confirming the new fixture is discovered and evaluated
alongside the existing ones.

**Acceptance Scenarios**:

1. **Given** an existing, passing fixture set, **When** a developer adds a
   new fixture PDF and its expected-output file following the established
   convention, **Then** the next eval run includes and evaluates the new
   fixture without any harness code change.
2. **Given** a new fixture PDF is added without its expected-output file
   (or vice versa), **When** the eval command runs, **Then** it reports
   that fixture as invalid/incomplete rather than silently skipping it or
   reporting a false pass.

---

### User Story 3 - Diagnose exactly what regressed, at which stage (Priority: P3)

When a fixture fails, the developer needs enough detail from the eval
output alone to understand what changed — which stage, which finding or
line, expected vs. actual — without adding temporary `console.log`
statements or re-running the pipeline manually to investigate.

**Why this priority**: Valuable but secondary to detection (US1) and
scaling (US2) — a bare "fixture X failed" is already better than nothing,
but this story is what makes the tool efficient to act on day-to-day.

**Independent Test**: Can be fully tested by deliberately breaking one
specific field (e.g. a finding's `action` value) for one specific fixture
and confirming the eval output names that fixture, that stage, and shows
the expected vs. actual value for the specific finding involved — not
just a pass/fail boolean.

**Acceptance Scenarios**:

1. **Given** a fixture's classification stage produces a wrong `action`
   for one finding, **When** the eval command reports that failure,
   **Then** the report identifies the specific finding and shows the
   expected value against the actual value produced.

---

### Edge Cases

- What happens when a fixture PDF's expected output declares zero
  billable findings (a "clean" report with no defects)? The eval must
  still be able to pass such a fixture — an empty `findings` array is a
  legitimate, correct outcome for extraction to reach, not something the
  harness should treat as a fixture-authoring error.
- What happens when the pipeline's real, non-deterministic LLM output
  varies in wording between two runs of the same fixture, with no
  underlying accuracy change? The eval must not flap between pass and
  fail purely from cosmetic wording differences (see SC-004).
- What happens when a developer intentionally changes pipeline behavior
  (e.g. a deliberate, reviewed change to what counts as a billable
  finding) such that old fixtures' expected output is now stale by
  design? The harness has no way to distinguish an intentional change
  from a regression automatically — updating expected-output files by
  hand to reflect an intentional, reviewed behavior change is the
  developer's responsibility, not the harness's.
- What happens when the pricing stage cannot price a line at all (a
  legitimate "price unavailable" outcome that already exists in
  production)? The eval must be able to assert "this line is expected to
  be unavailable" as a valid, passing outcome, not only "priced
  successfully."
- What happens when a fixture PDF is present but its expected-output file
  is missing, malformed, or references a schema that no longer matches
  the pipeline's current output shape? The eval must report this
  distinctly from an accuracy failure, so a developer isn't left guessing
  whether the pipeline regressed or the fixture itself just needs
  updating.
- What happens when an eval run cannot complete at all for a fixture (a
  thrown error from the real pipeline, e.g. an exhausted-retries network
  failure)? This is distinct from an accuracy mismatch and must be
  reported as its own category, not folded into "this fixture's findings
  were wrong."

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a single command a developer can run
  from the command line, with no browser, UI automation tool, or manual
  interaction required, that executes the real pipeline against one or
  more fixture PDFs.
- **FR-002**: The system MUST evaluate accuracy independently at each of
  the three LLM-driven pipeline stages this feature covers — extraction,
  classification, and pricing — such that a regression confined to one
  stage is reported against that stage, not just as an undifferentiated
  end-to-end failure.
- **FR-003**: Each fixture PDF MUST have an associated, version-controlled,
  hand-authored expected-output record capturing the ground truth that
  fixture's pipeline run should produce.
- **FR-004**: The system MUST run the pipeline's real, production code
  path for every evaluated fixture — no mocked, stubbed, or replayed LLM
  responses — consistent with this project's existing testing precedent
  (no automated test runner exists today specifically because prior
  practice treats a real run as the only trustworthy verification for
  this pipeline).
- **FR-005**: The system MUST compare actual pipeline output against each
  fixture's expected output using a method that tolerates legitimate
  non-substantive LLM output variance (e.g. paraphrased-but-equivalent
  wording) while still failing on substantive accuracy differences (a
  missed finding, a wrong action/scope/classification, a quantity or
  hours value that doesn't match a stated fact). Exact matching
  philosophy for findings/lines is defined in FR-005a; for pricing in
  FR-005b.
- **FR-005a** (resolved): Matching is recall-focused — every finding/line
  in a fixture's expected output MUST be found (by content-equivalence,
  not literal string match) in the actual pipeline output for that
  fixture's stage to pass. Additional findings/lines present in the
  actual output beyond what's expected are NOT, by themselves, treated as
  a stage failure — over-extraction of genuinely distinct, valid findings
  is not penalized.
- **FR-005b** (resolved): Pricing-stage accuracy is judged structurally
  only — whether each line was priced or correctly flagged unavailable,
  matching what the fixture's expected output declares. No dollar-amount
  tolerance-band checking is required; pricing is itself
  agent/market-estimate-driven and not byte-reproducible run-to-run, and
  requiring fixture authors to also supply and maintain plausible price
  ranges would be scope the user explicitly asked not to add.
- **FR-006**: The system MUST mechanically verify that every extracted
  finding's source quote is an actual verbatim substring of that
  fixture's parsed document text — independent of the expected-output
  comparison — so a hallucinated (non-grounded) quote is caught even for
  fixtures whose expected output happens not to flag it.
- **FR-007**: The system MUST report, for every fixture, a clear pass/fail
  result per stage plus enough expected-vs-actual detail (the specific
  finding/line and field involved) for a developer to diagnose a failure
  directly from the eval output, without adding temporary instrumentation
  or re-running the pipeline by hand.
- **FR-008**: Adding a new fixture (a PDF plus its expected-output record)
  MUST NOT require any change to the harness's own code — the harness
  discovers and evaluates whatever fixtures are present in the designated
  fixtures location at run time.
- **FR-009**: The system MUST distinguish, in its report, three separate
  outcome categories per fixture: (a) accuracy mismatch against expected
  output, (b) a fixture itself being invalid/incomplete (missing or
  malformed expected-output record), and (c) the pipeline run failing to
  complete at all (a thrown error). A developer must never have to infer
  which of these three occurred from ambiguous output.
- **FR-010**: The system MUST support running the eval against a single
  named fixture (fast iteration while authoring or debugging one test
  case) as well as against the full fixture set (a full regression
  sweep), from the same command.
- **FR-011**: The system MUST exit with a failing status when any
  evaluated fixture reports an accuracy mismatch, an invalid-fixture
  condition, or a pipeline run failure, so the result is usable as a pass/
  fail signal by a human or by later automation, even though wiring this
  into CI is explicitly out of scope for this feature (see Assumptions).
- **FR-012**: This feature is scoped to evaluating the accuracy of the
  existing `document → extraction → classification → pricing` pipeline as
  built. It MUST NOT add new pipeline functionality, a new UI, or CI
  wiring — those are explicitly out of scope (see Assumptions).

### Key Entities *(include if feature involves data)*

- **Fixture**: a real inspection-report PDF checked into the repository,
  representing one test case. Distinct from `dummy.pdf` (an empty
  placeholder with no usable content), which this feature does not treat
  as a valid fixture.
- **Expected Output**: a hand-authored, version-controlled record
  attached to one fixture, capturing the ground-truth outcome a correct
  pipeline run against that fixture should produce — expected findings
  (with their grounding facts), expected classifications, and expected
  pricing outcomes (per FR-005b's resolution).
- **Eval Result**: the outcome of running one fixture through the
  pipeline and comparing it to that fixture's expected output — a
  per-stage pass/fail plus diagnostic detail (FR-007), and the
  invalid-fixture / run-failure distinctions from FR-009.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can obtain a per-fixture, per-stage pass/fail
  result for the entire fixture set by running a single command, with
  zero browser or manual UI interaction.
- **SC-002**: Adding a new real inspection-report fixture and its expected
  output — for a developer already familiar with the report's content —
  takes no code changes to the harness itself, only adding the new PDF
  and its expected-output record.
- **SC-003**: A deliberately introduced accuracy regression (a missing
  required field, a wrong classification value, or a finding the
  extraction stage should have caught but didn't) is reported as a
  failure naming the affected stage and fixture, in 100% of cases tried
  during validation of this feature.
- **SC-004**: Running the eval loop twice against an unchanged pipeline
  and an unchanged fixture set does not flip a passing fixture to failing
  due to non-substantive LLM wording variance alone — false-flap rate
  across repeated runs on the same fixture set is zero for any fixture
  whose underlying facts (findings, classifications, prices) did not
  change.
- **SC-005**: A developer can identify which specific finding, field, or
  pipeline stage caused a fixture to fail directly from the eval report,
  without needing to re-run the pipeline with extra logging to find out.

## Assumptions

- At least one real (non-empty, non-trivial) inspection-report PDF must
  be supplied by the user as the first real fixture, plus its
  hand-authored expected output; `dummy.pdf` is confirmed empty (a
  212-byte placeholder with no content stream, no text) and unusable.
  **Resolved**: no such PDF exists anywhere in this repository or its git
  history (exhaustively checked — working tree, every local/remote
  branch, full history of added-then-removed files); the user supplied a
  real one from outside the repo instead — a 42-page InterNACHI-standard
  home inspection report for 4014 Sparrow House Ln, Burtonsville, MD,
  confirmed real by parsing it with this project's own `pdf-parse`
  dependency. Staged at
  `specs/002-pipeline-eval-harness/fixtures/4014-sparrow-house-ln-inspection-report.pdf`
  pending `plan.md`'s decision on the harness's actual runtime fixtures
  location — not committed to git yet. Its hand-authored expected-output
  record (FR-003) still needs to be written (requires reading all 42
  pages and recording the ground-truth findings) before this fixture can
  be used in an eval run.
- No CI-integration step is in scope for this feature. The eval command
  is a local, on-demand developer loop; whether and how to wire it into a
  CI pipeline is a separate, future decision (FR-012).
- No new heavyweight test-framework dependency is assumed necessary to
  satisfy this spec — the exact technical approach (e.g. a plain script
  vs. a lightweight runner) is a planning-phase decision, not a
  specification-phase one; this spec only requires that no bloated
  framework or speculative abstraction is introduced beyond what running
  a fixture through the real pipeline and diffing its output requires.
- Because pipeline output (both LLM-generated findings/classifications and
  agent/market-derived pricing) is not byte-reproducible run-to-run,
  "accuracy" is evaluated via structural/semantic comparison against
  expected output rather than exact string/number equality — consistent
  with this pipeline's existing established verification precedent
  (`quickstart.md`'s prior live-verification guidance for this same
  pipeline).
- Real LLM calls cost real money and time per eval run; this is accepted
  as the cost of testing the real, unmocked pipeline (FR-004), consistent
  with this project's own existing precedent of never mocking this
  pipeline's LLM calls.
- Expected-output records are maintained by hand by developers when they
  make a deliberate, reviewed change to pipeline behavior; the harness
  itself has no mechanism (and this spec does not require one) to
  distinguish an intentional behavior change from a genuine regression —
  that judgment remains a human review responsibility.
