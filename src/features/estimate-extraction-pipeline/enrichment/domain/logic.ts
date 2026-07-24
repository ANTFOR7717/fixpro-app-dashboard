import { createStep, createWorkflow } from '@mastra/core/workflows';
import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import { billableLineSchema, type BillableLine } from '../../classification';
import { enrichmentAgent } from '../agent';
import { pioneerGateway } from '../../shared/gateway';
import { resolveTracingOptions } from '../../shared/tracing';
import { enrichedLineSchema, type EnrichedLine } from '../schema';

const lineInputSchema = z.object({
  line: billableLineSchema,
  materialsContext: z.array(enrichedLineSchema).optional(),
});

const priceSchema = z.object({
  rate: z.number().int().min(0),
  currency: z.literal('USD'),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.string().min(1),
});

/** Matches `enrichedMaterialLineSchema`'s unit set — never "hrs". */
const materialAmountSchema = z.object({
  quantity: z.number().positive(),
  unit: z.enum(['ea', 'lf', 'sf', 'cy']),
});

/**
 * Matches `enrichedLaborLineSchema`'s unit set — always "hrs". `quantity`
 * is transformed (not just validated) to a 1-hour floor — a fixed
 * billing-minimum policy, not something to leave to the model's own
 * judgment. `.transform()` deterministically floors the value; `.min(1)`
 * would only reject sub-1 values, risking a wasted retry or the whole
 * line dropping if the model returns something small again.
 */
const laborAmountSchema = z.object({
  quantity: z
    .number()
    .positive()
    .transform((quantity) => Math.max(1, quantity)),
  unit: z.literal('hrs'),
});

const enrichmentResponseSchema = z.object({
  amount: z.union([materialAmountSchema, laborAmountSchema]),
  price: priceSchema,
});

/**
 * Builds one explicit, targeted search-query instruction per value
 * needed (amount, then price) — each following the same "exact estimate
 * for X for Y for average Z" phrasing, which asks directly for a number
 * instead of reading as a general descriptive search. `costType` is
 * already known before this call, so the query is built for the correct
 * value (quantity vs. hours) directly — the agent is never asked to
 * figure out which kind of line this is.
 *
 * For labor, `materialsContext` (that same finding's already-resolved
 * material lines) is folded into the hours query — labor hours scale
 * with how much material is involved, so "hours for X repair" alone is
 * under-specified without it.
 */
function buildEnrichmentPrompt(line: BillableLine, materialsContext?: EnrichedLine[]): string {
  if (line.costType === 'material') {
    return `Find the EXACT QUANTITY of "${line.material}" needed for this job, then its price.

JOB: ${line.scope} — ${line.descriptionQuote}
LOCATION: ${line.location}

Search explicitly for the quantity using this exact phrasing: "exact
estimate for ${line.material} quantity for ${line.scope} for average
${line.location}".

Then search explicitly for the price using this exact phrasing: "exact
estimate for ${line.material} price per unit for ${line.scope} for
average ${line.location}".`;
  }

  const materials = materialsContext
    ?.filter((m): m is Extract<EnrichedLine, { costType: 'material' }> => m.costType === 'material')
    .map((m) => `${m.quantity} ${m.unit} of ${m.material}`)
    .join(', ');

  return `Find the EXACT HOURS for this labor, then its price.

JOB: ${line.scope} — ${line.descriptionQuote}
LOCATION: ${line.location}
MATERIALS ALREADY DETERMINED FOR THIS JOB: ${materials || 'none determined'}

Search explicitly for the hours using this exact phrasing: "exact
estimate for hours to install ${materials || 'the determined materials'} for ${line.scope} for average
${line.location}".

Then search explicitly for the hourly rate using this exact phrasing:
"exact estimate for hourly rate for ${line.scope} for average
${line.location}".`;
}

/**
 * Hand-rolled `execute()` — the documented exception to Rule 1
 * (MASTRA-AGENT-WORKFLOW-STANDARD.md), needed here for
 * `structuredOutput.model`: a separate, tools-free model that only turns
 * the main agent's already-completed tool-calling turn (documentLookupTool,
 * tavilySearch, perplexitySearch) into schema-conformant JSON (Mastra's
 * own "Structuring agent" pattern, docs/agents/structured-output). This is
 * what stops "model returns a tool call's arguments where the final
 * object should be," which only happens when one call has to both use
 * tools AND honor response_format together. Still `.stream()`, not
 * `.generate()` (Rule 5 — `.generate()` previously reproduced a 504
 * Gateway Timeout from pioneerGateway on a long-running, tool-calling
 * agent call in this exact codebase); still no textStream draining
 * (Rule 4) — only `.object` is read off the resolved stream.
 */
const enrichmentAgentStep = createStep({
  id: 'enrichment',
  inputSchema: lineInputSchema,
  outputSchema: enrichmentResponseSchema,
  retries: 2,
  execute: async ({ inputData, tracingContext }) => {
    const amountSchema = inputData.line.costType === 'material' ? materialAmountSchema : laborAmountSchema;
    const stream = await enrichmentAgent.stream(buildEnrichmentPrompt(inputData.line, inputData.materialsContext), {
      structuredOutput: {
        schema: z.object({ amount: amountSchema, price: priceSchema }),
        model: pioneerGateway().chat('gpt-5.5'),
      },
      tracingOptions: resolveTracingOptions(tracingContext),
    });
    const result = await stream.object;
    // Thrown here (inside the step that has retries: 2), not in a later
    // .map() — a .map() transformation has no retry capability of its
    // own, so an incomplete-structured-output failure here gets a real
    // second/third attempt instead of failing immediately.
    if (!result.amount || !result.price) {
      throw new Error(`enrichment: incomplete result for ${inputData.line.id}`);
    }
    return result;
  },
});

/**
 * Determines the amount and price for ONE billable line. Composed
 * directly into `wrapper.ts`'s `enrichOneLine` (below), which gives it
 * per-item resilience — isolating one line's failure (after
 * `enrichmentAgentStep`'s own retries are exhausted) from the rest of
 * its `.foreach()` batch in `enrichment/workflow.ts`.
 */
export const enrichLineWorkflow = createWorkflow({
  id: 'enrich-one-line',
  inputSchema: lineInputSchema,
  outputSchema: enrichedLineSchema,
})
  .then(enrichmentAgentStep)
  .map(async ({ getInitData, getStepResult }) => {
    const { line } = getInitData<z.infer<typeof lineInputSchema>>();
    const { amount, price } = getStepResult(enrichmentAgentStep);
    return enrichedLineSchema.parse({ ...line, ...amount, ...price });
  })
  .commit();

/**
 * Callable helper wrapping `enrichLineWorkflow`'s `createRun()`/try-catch
 * — used by `domain/wrapper.ts`'s `enrichMaterialLineStep` and
 * `enrichLaborLineStep`, each composed via `.foreach()` in
 * `enrichment/workflow.ts` for real Mastra-native concurrency limiting
 * and per-item trace spans.
 */
export async function enrichOneLine(
  input: z.infer<typeof lineInputSchema>,
  requestContext: RequestContext,
  tracingOptions: { traceId: string; parentSpanId: string } | undefined,
): Promise<EnrichedLine | null> {
  try {
    const run = await enrichLineWorkflow.createRun();
    const result = await run.start({ inputData: input, requestContext, tracingOptions });
    return result.status === 'success' ? result.result : null;
  } catch {
    return null;
  }
}
