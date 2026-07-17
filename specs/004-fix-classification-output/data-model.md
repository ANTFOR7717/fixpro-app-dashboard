# Data Model: Fix Classification Structured-Output Design

## New: `agentUndeterminedSchema` — the minimal shape an AGENT itself may produce

```ts
export const agentUndeterminedSchema = z.object({
  status: z.literal('flagged_for_web_search'),
  reason: z.string().min(1).max(300),
});
export type AgentUndetermined = z.infer<typeof agentUndeterminedSchema>;
```

No `searchContext`. This is the ONLY thing an agent must produce when it
cannot determine a value — its own judgment, nothing echoed.

`determinedOr()` gains a second, optional parameter so the SAME helper
serves both the agent-facing (minimal) and combine-step-facing (full)
cases without duplicating the "determined" branch. `F`'s constraint MUST
be `z.core.$ZodTypeDiscriminable` (the exact type `z.discriminatedUnion`
itself requires each member to satisfy — verified via
`node_modules/zod/v4/classic/schemas.d.ts:490` and
`node_modules/zod/v4/core/api.d.ts:216`), not the looser `z.ZodTypeAny`:
a first implementation attempt used `F extends z.ZodTypeAny` and
`pnpm exec tsc --noEmit` rejected it (`Type 'F' is not assignable to
type '$ZodTypeDiscriminable'... 'PropValues | undefined' is not
assignable to 'PropValues'`) — a generic parameter erases the concrete
"has a computed literal discriminant" guarantee that `z.ZodTypeAny` alone
doesn't carry, even though every actual call site's concrete argument
(`webSearchFlagSchema`, `agentUndeterminedSchema`) does satisfy it.

```ts
export function determinedOr<T extends z.ZodTypeAny, F extends z.core.$ZodTypeDiscriminable = typeof webSearchFlagSchema>(
  valueSchema: T,
  flagSchema: F = webSearchFlagSchema as unknown as F,
) {
  return z.discriminatedUnion('status', [
    z.object({ status: z.literal('determined'), value: valueSchema }),
    flagSchema,
  ]);
}
```

## Unchanged: `webSearchFlagSchema` — the full, assembled, PUBLIC shape

No change to this schema's own definition or its export from
`classification/index.ts` — `envelope.ts`'s persisted
`flaggedForWebSearch: z.array(webSearchFlagSchema)` and its consumers
are unaffected. What changes is WHO constructs a value of this shape:
previously the agent was asked to; now only `combineResultStep`
(TypeScript, not a model) ever constructs one.

## Changed: the three per-finding agent step output schemas — now use `agentUndeterminedSchema`, not `webSearchFlagSchema`

```ts
const materialsStepOutputSchema = z.object({
  materials: z.array(
    z.object({
      material: z.string().min(1),
      quantity: determinedOr(
        z.object({ amount: z.number().positive(), unit: z.enum(EXTENT_UNIT) }),
        agentUndeterminedSchema,
      ),
      amountSource: z.string().min(1).optional(),
    }),
  ),
});

const laborStepOutputSchema = z.object({
  labor: z.object({
    laborType: z.string().min(1),
    hours: determinedOr(z.number().multipleOf(0.25).min(0.25), agentUndeterminedSchema),
    hoursSource: z.string().min(1).optional(),
  }),
});

const tradeStepOutputSchema = z.object({
  trade: determinedOr(z.enum(TRADE), agentUndeterminedSchema),
});
```

`classificationResultSchema` itself (the output of `combineResultStep`,
consumed by `flatten.ts`) is UNCHANGED — its `materials[].quantity`,
`labor.hours`, and `trade` fields still use `determinedOr(valueSchema)`
with the FULL `webSearchFlagSchema` (the default), since that is what
`flatten.ts` already expects and what gets persisted.

## Changed: `combineResultStep` — now assembles the full `WebSearchFlag` itself

```ts
function toFullFlag(
  agentFlag: AgentUndetermined,
  finding: ExtractedFinding,
  documentExcerpt: string,
  partialFindings: WebSearchFlag['searchContext']['partialFindings'],
): WebSearchFlag {
  return {
    status: 'flagged_for_web_search',
    reason: agentFlag.reason,
    searchContext: { finding, documentExcerpt, partialFindings },
  };
}
```

`combineResultStep`'s own `execute()` — which already calls
`getInitData()` and `getStepResult(materialsAgentStep)`/
`getStepResult(laborAgentStep)` — calls `toFullFlag()` for each of
`materials[].quantity`, `labor.hours`, and `trade` whenever the
corresponding agent step's own result has `status === 'flagged_for_web_search'`,
passing `partialFindings` built from whatever the OTHER two steps DID
determine (already available in scope, not re-derived): e.g. if trade is
flagged, `partialFindings.materials`/`partialFindings.labor` are built
from the already-fetched `materials`/`labor` step results, converting
each `determined` entry to its plain value shape and dropping any
themselves-flagged entries (a flag doesn't need to carry another flag
inside it).

## Not adopted: `errorStrategy`/`fallbackValue`

Per research.md R3 (revised): `materialsAgentStep`/`laborAgentStep`/
`tradeAgentStep` remain bare `createStep(agent, { structuredOutput:
{ schema }, retries: 2 })` compositions — `errorStrategy`/`fallbackValue`
do not appear on their `structuredOutput` options. The installed
package's own type declaration for this exact composition form
(`node_modules/@mastra/core/dist/workflows/workflow.d.ts:70`) types
`structuredOutput` as `{ schema: StandardSchemaWithJSON<TStepOutput> }`
only; `pnpm exec tsc --noEmit` confirmed this by rejecting
`errorStrategy`/`fallbackValue` there during a first implementation
attempt. Only each step's `structuredOutput.schema` changes (to
reference the new step output schemas using `agentUndeterminedSchema`,
above).

## Unchanged: `findingClassificationStep`'s try/catch wrapper

No code or doc-comment change. It already catches a structured-output
schema-validation failure in any of the three agent steps today —
`perFindingClassificationWorkflow.createRun()/.start()` surfaces such a
failure as a thrown error, which this wrapper's existing `catch` block
handles exactly like any other per-finding failure, degrading to a
`flagged_for_web_search` result and logging via the existing
`log.warn(...)` call. This fix does not touch this wrapper at all — its
job was never mis-scoped; the defect was entirely in what the three
agent steps' own schemas required the model to produce (R1), not in how
failures were caught.
