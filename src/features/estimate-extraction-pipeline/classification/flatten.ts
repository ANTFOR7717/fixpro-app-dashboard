import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  billableLineSchema,
  classificationResultSchema,
  materialLineSchema,
  webSearchFlagSchema,
  type ClassificationResult,
} from './schema';

/**
 * One named, typed source of truth for a billable line's id — replacing
 * the scrapped module's scattered inline string-suffixing
 * (`${f.id}-material`, `${f.id}-material-${i}`, `${f.id}-labor`) with a
 * single call site per kind. Trivial data normalization with no SDK
 * equivalent — the sanctioned exception in Constitution Principle VI.
 */
export function buildLineId(
  findingId: string,
  kind: 'material' | 'labor',
  index?: number,
): string {
  return kind === 'labor' ? `${findingId}:labor` : `${findingId}:material:${index}`;
}

/**
 * Turns one finding's `ClassificationResult` into zero or more
 * `BillableLine`s (the flattened shape `pricing/price-line.ts` already
 * consumes) plus zero or more `WebSearchFlag`s. Runs once, after
 * `.foreach()` collects every finding's own result — the documented
 * `.foreach().then(aggregateStep)` map-reduce shape
 * (docs/workflows/control-flow).
 *
 * Rules (data-model.md):
 * 1. If `trade` is not `determined`, the WHOLE finding produces no
 *    `BillableLine` this pass — a finding's lines all need a real trade
 *    value, so a finding whose trade can't be resolved can't produce a
 *    line pricing could act on regardless of how well materials/labor
 *    resolved individually. Its trade flag (which already carries
 *    whatever materials/labor context the trade agent was given) is
 *    pushed to `flaggedForWebSearch` as-is.
 * 2. Otherwise, each material with a `determined` quantity becomes one
 *    `materialLineSchema` line (`pricingBasis: 'material-part-only'`); a
 *    flagged material's quantity is pushed to `flaggedForWebSearch`
 *    instead — deferring only THAT material, not its siblings or labor.
 * 3. Labor with `determined` hours becomes one `laborLineSchema` line;
 *    `pricingBasis` is `'labor-install-hourly'` when at least one
 *    material line was emitted for this finding, else
 *    `'labor-all-in-hourly'` — the same rule `pricing/price-line.ts`'s
 *    prompt already relies on. Flagged hours are pushed to
 *    `flaggedForWebSearch` instead.
 *
 * `amountSource`/`hoursSource` are read from inside each determined
 * branch's own value (`material.quantity.value.amountSource`,
 * `result.labor.hours.value.hoursSource`) — no longer dangling optional
 * siblings, so no runtime guard is needed to enforce their presence; the
 * schema itself makes "determined but sourceless" unrepresentable
 * (specs/007-pipeline-schema-cleanup FR-004/FR-005).
 */
function flattenOneResult(result: ClassificationResult): {
  lines: z.infer<typeof billableLineSchema>[];
  flagged: z.infer<typeof webSearchFlagSchema>[];
} {
  const lines: z.infer<typeof billableLineSchema>[] = [];
  const flagged: z.infer<typeof webSearchFlagSchema>[] = [];

  if (result.trade.status !== 'determined') {
    flagged.push(result.trade);
    return { lines, flagged };
  }
  const trade = result.trade.value;

  const materialLines: z.infer<typeof materialLineSchema>[] = [];
  result.materials.forEach((material, index) => {
    if (material.quantity.status !== 'determined') {
      flagged.push(material.quantity);
      return;
    }
    materialLines.push({
      id: buildLineId(result.findingId, 'material', index),
      trade,
      action: result.action,
      scope: result.scope,
      location: result.location,
      sourceQuote: result.sourceQuote,
      material: material.material,
      quantity: material.quantity.value.amount,
      unit: material.quantity.value.unit,
      amountSource: material.quantity.value.amountSource,
      costType: 'material',
      pricingBasis: 'material-part-only',
    });
  });
  lines.push(...materialLines);

  if (result.labor.hours.status !== 'determined') {
    flagged.push(result.labor.hours);
  } else {
    lines.push({
      id: buildLineId(result.findingId, 'labor'),
      trade,
      action: result.action,
      scope: result.scope,
      location: result.location,
      sourceQuote: result.sourceQuote,
      laborType: result.labor.laborType,
      quantity: result.labor.hours.value.amount,
      unit: 'hrs',
      hoursSource: result.labor.hours.value.hoursSource,
      costType: 'labor',
      pricingBasis: materialLines.length > 0 ? 'labor-install-hourly' : 'labor-all-in-hourly',
    });
  }

  return { lines, flagged };
}

export const flattenClassificationResultsStep = createStep({
  id: 'flatten-classification-results',
  inputSchema: z.array(classificationResultSchema),
  outputSchema: z.object({
    lines: z.array(billableLineSchema),
    flaggedForWebSearch: z.array(webSearchFlagSchema),
  }),
  execute: async ({ inputData }) => {
    const lines: z.infer<typeof billableLineSchema>[] = [];
    const flaggedForWebSearch: z.infer<typeof webSearchFlagSchema>[] = [];
    for (const result of inputData) {
      const { lines: resultLines, flagged } = flattenOneResult(result);
      lines.push(...resultLines);
      flaggedForWebSearch.push(...flagged);
    }
    return { lines, flaggedForWebSearch };
  },
});
