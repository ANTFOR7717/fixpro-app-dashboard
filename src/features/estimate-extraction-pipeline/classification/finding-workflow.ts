import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { extractedFindingSchema, type ExtractedFinding } from '../extraction';
import { parsedDocumentSchema, type ParsedDocument } from '../document';
import { materialsAgent, laborAgent, tradeAgent } from './agents';
import {
  TRADE,
  EXTENT_UNIT,
  determinedOr,
  agentUndeterminedSchema,
  classificationResultSchema,
  materialQuantityValueSchema,
  laborHoursValueSchema,
} from './schema';
import { createModuleLogger } from '../shared/logger';

/** Module-scoped: constructed once, not per finding classified. */
const log = createModuleLogger('classification-finding');

const findingWithDocumentSchema = z.object({
  finding: extractedFindingSchema,
  parsedDocument: parsedDocumentSchema,
});

/**
 * The full parsed document, formatted for an agent prompt — mirrors
 * `extraction/steps.ts`'s existing `buildExtractionPrompt()` exactly,
 * the only document-context mechanism already proven working in this
 * codebase (specs/007-pipeline-schema-cleanup FR-002, research.md R3).
 * Replaces the removed page-citation-anchored windowing this feature
 * deletes (FR-001/FR-002).
 */
function formatDocumentContext(parsedDocument: ParsedDocument): string {
  return parsedDocument.pages
    .map((page) => `[p. ${page.pageNumber}]\n${page.content}`)
    .join('\n\n');
}

function describeFinding(finding: ExtractedFinding): string {
  return (
    `action: ${finding.action}\n` +
    `scope: ${finding.scope}\n` +
    `location: ${finding.location}\n` +
    `statedQuantity: ${finding.statedQuantity ?? 'not stated'}\n` +
    `inspectorHours: ${finding.inspectorHours ?? 'not stated'}\n` +
    `sourceQuote: ${JSON.stringify(finding.sourceQuote)}`
  );
}

/**
 * These three step output schemas use `agentUndeterminedSchema` (the
 * MINIMAL flag shape — status + reason, nothing echoed) as
 * `determinedOr()`'s flag branch, NOT the default full
 * `webSearchFlagSchema` — an agent's own structured output must never be
 * asked to reproduce the finding, document excerpt, or partial findings
 * it was given (specs/004-fix-classification-output). `combineResultStep`
 * below upgrades a flagged value into the full shape after the fact.
 * The determined-value schemas (`materialQuantityValueSchema`,
 * `laborHoursValueSchema`) are imported from `./schema` rather than
 * retyped here (specs/007-pipeline-schema-cleanup FR-006).
 */
const materialsStepOutputSchema = z.object({
  materials: z.array(
    z.object({
      material: z.string().min(1),
      quantity: determinedOr(materialQuantityValueSchema, agentUndeterminedSchema),
    }),
  ),
});

const laborStepOutputSchema = z.object({
  labor: z.object({
    laborType: z.string().min(1),
    hours: determinedOr(laborHoursValueSchema, agentUndeterminedSchema),
  }),
});

const tradeStepOutputSchema = z.object({
  trade: determinedOr(z.enum(TRADE), agentUndeterminedSchema),
});

/**
 * Bare `createStep(agent, { structuredOutput })` composition for all
 * three agents — none needs per-call runtime control (research.md R4).
 * Mastra owns the transport entirely; no hand-rolled
 * `.generate()`/`.stream()` call anywhere in this file
 * (MASTRA-AGENT-WORKFLOW-STANDARD.md Rule 1).
 *
 * `structuredOutput.errorStrategy`/`fallbackValue` are deliberately NOT
 * used here — verified (`node_modules/@mastra/core/dist/workflows/workflow.d.ts:70`,
 * Mastra's own `reference-workflows-step.md`) not to be exposed on this
 * exact composition form; only `{ schema }` is. A structured-output
 * schema-validation failure for any of these three steps is caught by
 * `findingClassificationStep`'s existing try/catch below, unchanged
 * (specs/004-fix-classification-output research.md R3).
 */
const materialsAgentStep = createStep(materialsAgent, {
  structuredOutput: { schema: materialsStepOutputSchema },
  retries: 2,
});

const laborAgentStep = createStep(laborAgent, {
  structuredOutput: { schema: laborStepOutputSchema },
  retries: 2,
});

const tradeAgentStep = createStep(tradeAgent, {
  structuredOutput: { schema: tradeStepOutputSchema },
  retries: 2,
});

const combineResultStep = createStep({
  id: 'combine-classification-result',
  inputSchema: tradeStepOutputSchema,
  outputSchema: classificationResultSchema,
  execute: async ({ inputData, getInitData, getStepResult }) => {
    const { finding, parsedDocument } = getInitData<z.infer<typeof findingWithDocumentSchema>>();
    const documentExcerpt = formatDocumentContext(parsedDocument);
    const { materials: rawMaterials } = getStepResult(materialsAgentStep);
    const { labor: rawLabor } = getStepResult(laborAgentStep);

    // Whatever THIS pass DID determine, for a future web-search step's
    // benefit — built here from data already in scope, never asked of
    // the model itself (specs/004-fix-classification-output).
    const determinedMaterials: { material: string; quantity: number; unit: (typeof EXTENT_UNIT)[number] }[] = [];
    for (const m of rawMaterials) {
      if (m.quantity.status === 'determined') {
        determinedMaterials.push({
          material: m.material,
          quantity: m.quantity.value.amount,
          unit: m.quantity.value.unit,
        });
      }
    }
    const partialFindingsValue: {
      materials?: { material: string; quantity: number; unit: (typeof EXTENT_UNIT)[number] }[];
      labor?: { laborType: string; hours: number };
    } = {};
    if (determinedMaterials.length > 0) partialFindingsValue.materials = determinedMaterials;
    if (rawLabor.hours.status === 'determined') {
      partialFindingsValue.labor = { laborType: rawLabor.laborType, hours: rawLabor.hours.value.amount };
    }

    const toFullFlag = (agentFlag: { status: 'flagged_for_web_search'; reason: string }) => ({
      status: 'flagged_for_web_search' as const,
      reason: agentFlag.reason,
      searchContext: { finding, documentExcerpt, partialFindings: partialFindingsValue },
    });

    const materials = rawMaterials.map((m) =>
      m.quantity.status === 'determined'
        ? { material: m.material, quantity: m.quantity }
        : { material: m.material, quantity: toFullFlag(m.quantity) },
    );

    const labor =
      rawLabor.hours.status === 'determined'
        ? { laborType: rawLabor.laborType, hours: rawLabor.hours }
        : { laborType: rawLabor.laborType, hours: toFullFlag(rawLabor.hours) };

    const trade = inputData.trade.status === 'determined' ? inputData.trade : toFullFlag(inputData.trade);

    return {
      findingId: finding.id,
      action: finding.action,
      scope: finding.scope,
      location: finding.location,
      sourceQuote: finding.sourceQuote,
      materials,
      labor,
      trade,
    };
  },
});

/**
 * The per-finding nested workflow: build-materials-prompt -> materials
 * -> labor -> trade -> combine. The first `.map()` builds the materials
 * prompt directly from the workflow's own init data (its `inputData` at
 * this position, before any `.then()`, is the workflow's own declared
 * `inputSchema` — confirmed directly against the installed
 * `@mastra/core` package's own `Workflow` class type declaration:
 * `map()`'s `TPrevSchema` generic defaults to `TInput`, so `.map()` is a
 * fully generic composition method with no constraint requiring a prior
 * `.then()` — matching `pipeline.ts`'s own established "prompt right
 * before an agent step via a bare `.map()`" pattern exactly, rather than
 * a named step). Each `.map()` between agent steps builds that step's
 * own prompt from `getInitData()` (the finding + the full parsed
 * document, research.md R3) and, for labor/trade, the earlier steps' own
 * results via `getStepResult()` (research.md R5) — offered as optional
 * context only, never a hard dependency (spec.md FR-005/FR-006).
 * NOT registered on the top-level `Mastra` instance and not exported
 * outside this file — `findingClassificationStep` below is the one thing
 * `workflow.ts` composes.
 */
const perFindingClassificationWorkflow = createWorkflow({
  id: 'classify-one-finding',
  inputSchema: findingWithDocumentSchema,
  outputSchema: classificationResultSchema,
})
  .map(async ({ inputData }) => {
    const excerpt = formatDocumentContext(inputData.parsedDocument);
    return {
      prompt:
        "Determine this finding's material(s), if any.\n\n" +
        `FINDING\n${describeFinding(inputData.finding)}\n\n` +
        `DOCUMENT EXCERPT NEAR THIS FINDING\n${excerpt}`,
    };
  })
  .then(materialsAgentStep)
  .map(async ({ getInitData, getStepResult }) => {
    const { finding, parsedDocument } = getInitData<z.infer<typeof findingWithDocumentSchema>>();
    const excerpt = formatDocumentContext(parsedDocument);
    const { materials } = getStepResult(materialsAgentStep);
    const materialsContext =
      materials.length > 0
        ? materials
            .map((m) =>
              m.quantity.status === 'determined'
                ? `${m.material}: ${m.quantity.value.amount} ${m.quantity.value.unit}`
                : `${m.material}: quantity undetermined`,
            )
            .join('; ')
        : '(no materials determined for this finding — a normal labor-only case)';
    return {
      prompt:
        "Determine this finding's labor: type and hours.\n\n" +
        `FINDING\n${describeFinding(finding)}\n\n` +
        'MATERIALS ALREADY DETERMINED FOR THIS FINDING (context only, may be empty ' +
        `— that is normal, not a degraded input)\n${materialsContext}\n\n` +
        `DOCUMENT EXCERPT NEAR THIS FINDING\n${excerpt}`,
    };
  })
  .then(laborAgentStep)
  .map(async ({ getInitData, getStepResult }) => {
    const { finding, parsedDocument } = getInitData<z.infer<typeof findingWithDocumentSchema>>();
    const excerpt = formatDocumentContext(parsedDocument);
    const { materials } = getStepResult(materialsAgentStep);
    const { labor } = getStepResult(laborAgentStep);
    const materialsContext = materials.length > 0 ? materials.map((m) => m.material).join(', ') : '(none)';
    const laborContext =
      labor.hours.status === 'determined'
        ? `${labor.laborType} (${labor.hours.value.amount} hours)`
        : `${labor.laborType} (hours undetermined)`;
    return {
      prompt:
        "Determine this finding's trade, given its materials and labor.\n\n" +
        `FINDING\n${describeFinding(finding)}\n\n` +
        `MATERIALS: ${materialsContext}\n` +
        `LABOR: ${laborContext}\n\n` +
        `DOCUMENT EXCERPT NEAR THIS FINDING\n${excerpt}`,
    };
  })
  .then(tradeAgentStep)
  .then(combineResultStep)
  .commit();

/**
 * One failure-isolated unit of work per finding — wraps
 * `perFindingClassificationWorkflow` in its own try/catch so a genuine
 * failure for ONE finding never fails the whole `.foreach()` batch in
 * `workflow.ts`. Mirrors `pricing/price-line.ts`'s own already-accepted
 * per-item resilience pattern — a per-item failure degrades to a typed,
 * honest result instead of throwing, AND is logged (matching
 * `price-line.ts`'s own `log.warn(...)`). A caught failure downgrades to
 * the SAME `flagged_for_web_search` shape FR-010 already defines for an
 * honest "couldn't determine" — not a second, competing error path.
 *
 * This wrapper is UNCHANGED by specs/004-fix-classification-output. It
 * already catches a structured-output schema-validation failure in any
 * of the three agent steps above (`perFindingClassificationWorkflow.createRun()/.start()`
 * surfaces such a failure as a thrown error, same as any other
 * per-finding failure) — `structuredOutput.errorStrategy`/`fallbackValue`
 * was considered as an alternative, narrower-scoped mechanism but is not
 * available on the bare `createStep(agent, {...})` composition form
 * these three steps use (research.md R3), so this wrapper's job and
 * scope are exactly what they already were in feature 003. Confirmed
 * this session (specs/007-pipeline-schema-cleanup research.md R8) as a
 * legitimate, documented Mastra idiom, not a defect — untouched here.
 */
export const findingClassificationStep = createStep({
  id: 'classify-finding',
  inputSchema: findingWithDocumentSchema,
  outputSchema: classificationResultSchema,
  execute: async ({ inputData }) => {
    try {
      const run = await perFindingClassificationWorkflow.createRun();
      const result = await run.start({ inputData });
      if (result.status !== 'success') {
        throw new Error(`classify-one-finding workflow ended non-success: ${result.status}`);
      }
      return result.result;
    } catch (error) {
      const { finding, parsedDocument } = inputData;
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.warn('[classify-finding] per-finding failure', {
        findingId: finding.id,
        error: errorMessage,
      });
      const reason = `classification failed: ${errorMessage}`;
      const documentExcerpt = formatDocumentContext(parsedDocument);
      const flag = {
        status: 'flagged_for_web_search' as const,
        reason,
        searchContext: { finding, documentExcerpt, partialFindings: {} },
      };
      return {
        findingId: finding.id,
        action: finding.action,
        scope: finding.scope,
        location: finding.location,
        sourceQuote: finding.sourceQuote,
        materials: [],
        labor: { laborType: 'unavailable — classification step failed', hours: flag },
        trade: flag,
      };
    }
  },
});
