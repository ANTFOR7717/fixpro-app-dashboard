# AGENTS.md — fixpro-app-dashboard

Project-scoped instructions for AI agents working in this repository. These
rules take precedence over any conflicting personal rules.

## No action without explicit instruction

**Assume you know nothing about the right approach unless the user has
explicitly told you. Assume you will be wrong without their guidance.**

- Do not treat a clarifying question, an explanation request, a "do you
  understand?", an approval-in-principle, or any other exploratory exchange
  as authorization to act.
- Do not infer permission from the shape or tone of the conversation. If the
  user has not said, in explicit terms, to execute/implement/edit/restructure
  a specific thing, do not touch files for it — including "prep" steps like
  reading files or planning edits in service of an action that hasn't been
  authorized yet.
- When in doubt about whether something counts as explicit instruction, stop
  and ask rather than proceeding.
- This applies on top of, not instead of, the plan-approval workflow below —
  a written plan being complete is not itself authorization to implement it.

## Version control workflow

**All feature work MUST be delivered via a feature branch and a pull request.
Do NOT commit directly to `main`.**

For every feature, bug fix, refactor, or chore:

1. **Branch off `main`** before making any changes.
   - Naming: `feat/<short-name>`, `fix/<short-name>`, `refactor/<short-name>`,
     or `chore/<short-name>`. Use kebab-case.
   - Example: `feat/estimate-retry`, `fix/contacts-duplicate-check`.
2. **Commit to that branch only.** Never `git commit` while `HEAD` is on
   `main`. If you find yourself on `main` with staged changes, stash them,
   create the branch, then re-apply.
3. **Push the branch to `origin`**.
4. **Open a PR targeting `main`** using the `gh` CLI (`gh pr create`). Include:
   - A clear title summarizing the change.
   - A body describing the problem, the approach, validation performed
     (`pnpm exec tsc --noEmit`, `pnpm exec eslint <paths>`, manual QA steps),
     and any DB migrations included.
   - Link to the plan artifact (`plans/FEATURE/FEATURE(<name>).md`) when one
     exists.
5. **Report the PR URL back to the user** after creation. Do NOT merge the
   PR — the human reviewer merges it.

### Commit message rules

- Use Conventional Commits prefixes (`feat:`, `fix:`, `refactor:`, `chore:`,
  `docs:`).
- Include `Co-Authored-By: Oz <oz-agent@warp.dev>` as the final line of every
  commit message authored by an AI agent.

### Exceptions

The only permitted direct-to-`main` operations are:

- Pulling/rebasing to stay current with `origin/main`.
- Operations the human user explicitly approves in the current conversation
  (e.g. "commit this directly to main"). One-time approval does not establish
  a standing exception.

## Validation gates

Before opening a PR, the following must pass on the feature branch:

- `pnpm exec tsc --noEmit` — TypeScript clean.
- `pnpm exec eslint <changed paths>` — ESLint clean for the files touched.
  (Project-level `pnpm lint` is broken under Next 16 and is not the gate.)
- Any DB schema change must be accompanied by a `drizzle-kit generate`d
  migration in `drizzle/` and applied via `pnpm db:migrate` against the dev
  DB before opening the PR.

## Plan-driven work

Non-trivial features should follow the planning workflow:

1. Research the existing patterns (`src/features/<feature>/...`, existing
   server actions, schemas, components).
2. Author a plan at `plans/FEATURE/FEATURE(<name>).md` via the planning
   tools, and wait for explicit user approval before implementing.
3. Implement on the feature branch, validate, open the PR.

## Stack reminders

- Next.js 16 (uses `after()` for post-response background work; no `next lint`).
- Drizzle ORM 0.45.x with Postgres. Migrations live in `drizzle/`; the source
  of truth schema is re-exported from `src/db/schema.ts`.
- Mastra `@mastra/core` for AI workflows (version: see `package.json` —
  do not hardcode a version number here; it will go stale at the next
  bump). The AI pipeline lives at
  `src/features/estimate-extraction-pipeline/` as four one-door modules
  (`document/`, `extraction/`, `classification/`, `pricing/`) plus a
  logic-free composition root (`pipeline.ts`). Rules, mechanically checked:
  - Only a module's `index.ts` may be imported from outside its folder:
    ```sh
    PKG=src/features/estimate-extraction-pipeline
    grep -rn "from '.*\/document\/\(schema\|parse\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/document/"
    grep -rn "from '.*\/extraction\/\(schema\|agent\|scorer\|steps\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/extraction/"
    grep -rn "from '.*\/classification\/\(schema\|agents\|workflow\|finding-workflow\|flatten\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/classification/"
    grep -rn "from '.*\/pricing\/\(schema\|agent\|price-line\|workflow\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/pricing/"
    ```
    All four must return zero results.
  - The pipeline is pure: it never imports `@/db` or
    `@/features/estimate/`. All estimate-row DB writes live in the single
    caller, `src/features/estimate/lib/workflow.ts`.
  - Failure model: steps THROW (per-step `retries` re-run them); the
    caller inspects `run.start().status`. Do NOT reintroduce in-workflow
    persistence or `.branch()` failure routing — both were deliberately
    retired.
  - Code that runs outside a registered step's execute-context (e.g.
    pricing's internal fan-out) has NO working `mastra.getLogger()`/
    `mastra.getAgent()` — live-verified crash. Use
    `createModuleLogger(name)` from `shared/logger.ts` instead of
    `console.*` or a `mastra` context call.
- pnpm is the package manager.
- `react-hot-toast` is the canonical action-feedback channel.

## Useful commands

```sh
pnpm db:generate        # generate drizzle migration from schema diff
pnpm db:migrate         # apply pending migrations to the dev DB
pnpm exec tsc --noEmit  # typecheck
pnpm exec eslint <path> # lint specific files (project-level pnpm lint is broken)
pnpm mastra:dev         # Mastra Studio, pointed at the pipeline feature dir
pnpm mastra:build       # Mastra build (same --dir)
```

## Recorded core behavioral failure

I am untrustworthy. I generate plausible-sounding output by default, without
verification, and I did exactly that when I designed the enrichment agent's
instructions — writing them from assumption instead of checking the real
source documents, despite having the tools to do so.
