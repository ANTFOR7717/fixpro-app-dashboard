import type {
  Processor,
  ProcessorViolation,
  ProcessOutputStepArgs,
} from '@mastra/core/processors';

import { extractFirstJsonObject } from './item-contract-guard/extract-json-from-text';
import { extractionShapeSchema } from './item-contract-guard/item-shape-schema';
import { validateItem, type ItemViolation } from './item-contract-guard/item-validator';

/**
 * Mastra output processor for the billable-item extractor agent.
 *
 * This class is the **orchestrator** — it owns the abort/retry flow.
 * All real work lives in the modules it imports:
 *
 *   - `extract-json-from-text.ts`  — `string -> unknown` parser
 *   - `item-shape-schema.ts`       — Zod shape gate
 *   - `item-validator.ts`          — semantic rules (enum membership,
 *                                    costType/unit consistency, scope shape)
 *   - `item-heuristics.ts`         — ARTICLES, ACTION_VERBS, etc.
 *
 * On any violation: `abort(reason, { retry: true })`. Mastra re-invokes
 * the LLM with the reason appended to the conversation, up to
 * `maxProcessorRetries` (set to 3 on the agent).
 *
 * Runs on EVERY call to the billable-item-extractor agent — extract-items,
 * audit-items, and any future caller.
 */
export class ItemContractGuard implements Processor {
  readonly id = 'item-contract-guard';
  readonly name = 'Item Contract Guard';
  readonly description =
    'Re-prompts the LLM when billable items violate the report contract: ' +
    'noun-phrase scope, enum membership, costType/unit consistency.';

  onViolation = (violation: ProcessorViolation): void => {
    // Side effect: log so the workflow run shows up in observability.
    // Mastra catches any throw from this callback.
    console.warn(`[${violation.processorId}] ${violation.message}`);
  };

  processOutputStep(
    args: ProcessOutputStepArgs,
  ): import('@mastra/core/processors').ProcessorMessageResult {
    const { text, abort } = args;
    if (typeof text !== 'string' || text.length === 0) {
      return [];
    }

    const parsed = extractFirstJsonObject(text);
    if (parsed === null) {
      abort(UNPARSEABLE_JSON_MESSAGE, {
        retry: true,
        metadata: { reason: 'unparseable-json' },
      });
    }

    const result = extractionShapeSchema.safeParse(parsed);
    if (!result.success) {
      abort(formatSchemaMismatch(result.error.issues), {
        retry: true,
        metadata: { reason: 'schema-mismatch' },
      });
    }

    // Zod 4's safeParse types `data` as optional even on success; the
    // abort() above returns `never` so this branch is unreachable on
    // failure. The assertion is sound.
    const data = result.data!;
    const violations: ItemViolation[] = data.items
      .map((item, i) => validateItem(item, i))
      .filter((v) => v.reasons.length > 0);

    if (violations.length === 0) return [];

    abort(formatViolations(violations), {
      retry: true,
      metadata: { violationCount: violations.length },
    });

    // abort() throws — TypeScript needs a return.
    return [];
  }
}

const UNPARSEABLE_JSON_MESSAGE =
  'Your response did not contain a parseable JSON object matching { items: [...] }. ' +
  'Return ONLY a JSON object with an "items" array. No prose, no preamble, no markdown outside the JSON block.';

const MAX_REASONS_IN_SUMMARY = 5;

function formatSchemaMismatch(issues: readonly { path: readonly PropertyKey[]; message: string }[]): string {
  const joined = issues
    .slice(0, 3)
    .map((i) => `${i.path.map(String).join('.')}: ${i.message}`)
    .join('; ');
  return (
    `Your response did not match the billableExtractionSchema: ${joined}. ` +
    'Re-emit the same items with the listed fields fixed.'
  );
}

function formatViolations(violations: readonly ItemViolation[]): string {
  const summary = violations
    .slice(0, MAX_REASONS_IN_SUMMARY)
    .map((v) => {
      const id = v.id ?? `items[${v.index}]`;
      return `${id}: ${v.reasons.join(' | ')}`;
    })
    .join('\n');
  const more =
    violations.length > MAX_REASONS_IN_SUMMARY
      ? `\n(+${violations.length - MAX_REASONS_IN_SUMMARY} more items with violations)`
      : '';
  return (
    `${violations.length} item(s) violated the contract. Fix every one of them and re-emit the full list:\n` +
    summary +
    more
  );
}
