<!--
Sync Impact Report
Version change: N/A (template) → 1.0.0
Modified principles: none (initial ratification)
Added sections:
  - Core Principles I–VI (One-Door Module Boundaries, Pipeline Purity,
    Explicit Throw/Retry Failure Model, No Hand-Rolled Agent Orchestration,
    Verification Discipline Over Guessing, No Slop)
  - Governance
Removed sections: none
Templates requiring updates:
  - .specify/templates/plan-template.md: ✅ no change needed — its
    "Constitution Check" section already reads gates dynamically from this
    file rather than hardcoding principle names.
  - .specify/templates/spec-template.md: ✅ no change needed — no
    constitution-specific references found.
  - .specify/templates/tasks-template.md: ✅ no change needed — no
    constitution-specific references found.
  - Installed speckit command/skill files (.claude/skills/speckit-*): ✅
    stock, freshly installed, no project-specific text to realign.
Follow-up TODOs: RATIFICATION_DATE set to the date this constitution was
first authored (today), since no earlier constitution existed for this
project — not a deferred placeholder.
-->

# fixpro-app-dashboard Constitution

## Core Principles

### I. One-Door Module Boundaries (NON-NEGOTIABLE)

Every module under `src/features/estimate-extraction-pipeline/` (currently
`document/`, `extraction/`, `classification/`, `pricing/`, and any module
added later) exposes its complete public contract through its own
`index.ts` only. No file outside a module's folder may import a deeper
path (`schema`, `agent`, `steps`, `scorer`, `price-line`, `workflow`, etc.)
directly. This is mechanically enforced, not aspirational: `AGENTS.md`
carries one grep per module, and all of them MUST return zero results
before a change is considered done. A module's door exports exactly what
consumers need — not everything that exists in the folder — and that
asymmetry is the boundary. Rationale: a contract with more than one
legitimate import path silently erodes to "whichever path was convenient
that day," which is how the codebase arrived at duplicate/dead
re-exports and deep-import exceptions this constitution exists to prevent
from recurring.

### II. Pipeline Purity

The `estimate-extraction-pipeline` package never imports `@/db` or
`@/features/estimate/`. It has no knowledge of persistence, database
rows, or the estimate feature's own domain layer. All estimate-row
read/write lifecycle logic lives in exactly one external caller. Rationale:
a pipeline that can be constructed and run without a database connection
is independently testable, and a single writer eliminates the class of
bug where two different call sites disagree about how a row is persisted.

### III. Explicit Throw/Retry Failure Model (NON-NEGOTIABLE)

Steps THROW on failure — malformed structured output, empty response,
transport error, or a business-logic invariant violation (e.g. an
unclassified finding). Per-step `retries` re-run the step; the workflow's
caller inspects `run.start().status` to decide what happened. In-workflow
persistence-as-you-go and `.branch()`-based failure routing are
deliberately retired and MUST NOT be reintroduced — both were tried,
both were removed, and reintroducing either without a new, explicitly
recorded decision is a regression, not a stylistic choice. Rationale:
one failure model, applied uniformly, is what makes "the caller checks
status" a reliable contract instead of a per-step guessing game.

### IV. No Hand-Rolled Agent Orchestration (NON-NEGOTIABLE)

Governed in full by `plans/MASTRA-AGENT-WORKFLOW-STANDARD.md`
(status: BINDING), whose rules are incorporated here by reference and
restated in summary:

- Agents ARE steps. A step whose only job is "call this agent, get
  structured output" is composed with `createStep(agent, {
  structuredOutput })` — never wrapped in a hand-written `async function`
  that calls `.generate()`/`.stream()` manually. The one documented
  exception: a step needing per-call runtime control (e.g. picking
  between two `structuredOutput` schemas at runtime) calls the agent
  inside that step's own `execute()` — still a `createStep(...)`, never a
  free exported function.
- Every data transform between steps is a named step or a `.map()`
  callback — never logic inlined inside an agent-calling function.
- Tools are always `createTool()` — never a plain object, and never a
  tool that just echoes back data the caller already has in hand.
- No manual stream-draining loops (`for await (... of stream.textStream)`
  used only to "keep the connection open") — ever.

A partial match to the Standard is a failure, not a pass. Code that
deviates must be corrected in full, not partially patched or left "close
enough." Rationale: this codebase has already shipped, and had to rip
out, hand-rolled orchestration that duplicated SDK-native primitives
(including an unverified stream-drain loop with no documented basis) —
this principle exists specifically so that mistake is structurally
prevented from recurring, not merely discouraged.

### V. Verification Discipline Over Guessing (NON-NEGOTIABLE)

Every technical claim about SDK, library, or framework behavior — what an
API accepts, how a type resolves, whether a pattern is documented — MUST
be sourced from the installed package itself (types, source) or the
framework's own current documentation before being relied on in a plan or
an implementation. For Mastra specifically, that means the Mastra MCP
tools (`mcp__mastra__mastraDocs`, `mcp__mastra__searchMastraDocs`), not
public search results and not training-data recall. The exact doc path or
file/line MUST be cited next to the claim so it can be independently
re-verified. "Try it and see what error comes back" is not an acceptable
substitute for checking first. Rationale: this codebase has directly hit
production failures (a 504 Gateway Timeout, a crash reading
`mastra.getLogger()` on `undefined`) caused by code shipped on an assumed
rather than verified understanding of the SDK's behavior.

### VI. No Slop

No hand-rolled mechanical code that duplicates a primitive the SDK or
standard library already provides. No duplication of a contract across
two "legitimate-looking" paths (see Principle I). No scope creep beyond
what a plan's own stated request covers. No God functions — a function
that does one cohesive thing via a discriminated branch is not a God
function merely for having a branch. No invented "consistency" that costs
the architecture precision it already has (e.g. widening a type to match
a sibling type when the narrower type correctly makes an invalid state
unrepresentable). The one sanctioned category of hand-written code is
trivial data normalization with no SDK equivalent (e.g. content-address
IDs, dedup sets, scope filters) — sanctioned only when confirmed, not
assumed, to have no SDK primitive covering it (see Principle V).
Rationale: every one of these failure modes has a specific, named,
previously-shipped instance in this codebase's own history; this
principle exists to keep them from being reintroduced under a new name.

## Additional Constraints

**Stack**: Next.js (App Router, `after()` for post-response background
work), Drizzle ORM against Postgres, `@mastra/core` for AI
agents/workflows, pnpm as the package manager. Mastra's version is never
hardcoded into guidance docs (`AGENTS.md`, this constitution, or any plan)
— reference `package.json` instead, so the next dependency bump does not
recreate a staleness trap.

**Migrations**: any DB schema change ships with a `drizzle-kit generate`d
migration in `drizzle/` and is applied via `pnpm db:migrate` against the
dev DB before a PR is opened. A migration with no remaining consumer in
the codebase it ships alongside (e.g. enabling an extension for a feature
deleted in the same change) is a defect to resolve before merge, not an
artifact to carry forward silently.

## Development Workflow

**Validation gates**, required before any PR: `pnpm exec tsc --noEmit`
clean; `pnpm exec eslint <changed paths>` clean (project-level `pnpm
lint` is broken under the current Next.js version and is not the gate);
every one-door boundary grep and the purity grep from `AGENTS.md` return
zero results; `pnpm build` clean.

**Plan-driven work**: non-trivial features, fixes, and refactors follow
the Spec-Driven Development workflow in strict order — constitution →
specify → clarify → plan → tasks → analyze → implement — with each
artifact requiring explicit user approval before the next phase begins.
`[NEEDS CLARIFICATION]` markers block `/speckit-plan`; they are resolved
via `/speckit-clarify` or an explicit user answer, never by assumption.

**Version control**: feature branches only (`feat/`, `fix/`, `refactor/`,
`chore/`), never direct commits to `main`; PRs via `gh pr create`,
merged only by a human reviewer.

## Governance

This constitution supersedes ad-hoc conventions and prior informal
practice. `AGENTS.md` and any binding standard document referenced from
it (e.g. `plans/MASTRA-AGENT-WORKFLOW-STANDARD.md`) are the living
implementation detail underneath these principles — they may grow more
specific rules, but none may contradict a principle here without first
amending this document.

**Amendments** require the same evidence-based sourcing as the original
principles: cite the repository evidence (an incident, a shipped file, a
documented pattern) motivating the change, not an unstated preference.
Amendments bump this document's version per semantic versioning (MAJOR:
backward-incompatible principle removal/redefinition; MINOR: new
principle or materially expanded guidance; PATCH: clarification/wording).

**Compliance**: every plan (`plan.md`) and task list (`tasks.md`)
produced under this workflow must satisfy every principle above or record
an explicit, justified exception in the plan's own risk/audit section —
never silently violate a principle. `/speckit-plan`'s Constitution Check
gate is where this is verified before implementation begins, and again
after Phase 1 design.

**Version**: 1.0.0 | **Ratified**: 2026-07-14 | **Last Amended**: 2026-07-14
