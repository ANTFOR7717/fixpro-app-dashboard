# Quickstart: Validating the Extraction Rebuild

## Prerequisites

- `pnpm install` up to date
- `.env` has `PIONEER_API_KEY`/`PIONEER_API_URL` set (the gateway
  extraction's agent routes through)
- A real inspection-report PDF available to upload (this pipeline's
  established live-verification method — no mocked-LLM test harness
  exists in this repo)

## Static validation (run after every file change, per AGENTS.md gates)

```sh
pnpm exec tsc --noEmit
pnpm exec eslint src/features/estimate-extraction-pipeline/extraction/*.ts
```

## One-door boundary gate (from AGENTS.md, extraction-specific line)

```sh
PKG=src/features/estimate-extraction-pipeline
grep -rn "from '.*\/extraction\/\(schema\|agent\|scorer\|steps\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/extraction/"
```

Expect zero results.

## Dead-code / stale-pattern gate

```sh
grep -rn "\.generate(\|\.stream(\|for await.*textStream" src/features/estimate-extraction-pipeline/extraction/
```

Expect zero results — no hand-rolled agent call anywhere in the rebuilt
module (Standard Rule 1/4).

## Build

```sh
pnpm build
```

Expect clean.

## Live verification (the only test harness this pipeline has)

1. `pnpm dev`, upload a real inspection report through the estimate flow.
2. Confirm the run completes and produces the same class of output as
   before the rebuild — findings extracted, each grounded to a cited
   sentence, no null `sourceQuote`.
3. **Retry behavior** (spec.md SC-002): force a single transient failure
   on `findingExtractorAgentStep` — e.g. temporarily point
   `PIONEER_API_URL` at an invalid endpoint for the first attempt only
   (a proxy/toggle), or inspect `execute.retryCount` via a temporary log
   line — confirm the step retries automatically before failing the run.
   Remove any temporary instrumentation afterward.
4. Compare the finding set from a before/after run on the same document —
   should be behaviorally identical (spec.md SC-004). Exact LLM output
   isn't byte-reproducible run-to-run, but the SHAPE, grounding
   discipline, and null-handling rules must be unchanged.

## Studio check

```sh
pnpm mastra:dev
```

Confirm `finding-extractor` agent and `extraction-consistency` scorer
still list correctly in Studio — the rebuild must not change anything
about how `estimate-extraction-pipeline/index.ts` registers them.
