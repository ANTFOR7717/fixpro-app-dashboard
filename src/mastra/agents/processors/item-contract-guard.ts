import { z } from 'zod';
import type {
  Processor,
  ProcessorViolation,
  ProcessOutputStepArgs,
} from '@mastra/core/processors';
import {
  TRADE,
  ACTION,
  UNIT,
  COST_TYPE,
} from '../billable-item-extractor.schema';

/**
 * Semantic guardrail for the billable-item extractor.
 *
 * Zod (in billableExtractionSchema) catches shape errors: missing fields,
 * wrong enum values, wrong types. The guard catches rules Zod can't express:
 *   - scope is a noun phrase (no leading article, no leading action verb,
 *     no sentence punctuation, at least 2 tokens)
 *   - trade is in TRADE
 *   - action is in ACTION
 *   - costType + unit are consistent (e.g. costType=material cannot pair
 *     with unit=hrs)
 *
 * On violation: abort(reason, { retry: true }). Mastra re-invokes the LLM
 * with the reason appended to the conversation. Repeated up to
 * `maxProcessorRetries` (set to 3 on the agent).
 *
 * Runs on EVERY call to the billable-item-extractor agent, including
 * extract-items, audit-items, and any future caller. One place to evolve
 * the contract.
 */

const VALIDATION_TRADE = new Set<string>(TRADE);
const VALIDATION_ACTION = new Set<string>(ACTION);
const VALIDATION_UNIT = new Set<string>(UNIT);
const VALIDATION_COST_TYPE = new Set<string>(COST_TYPE);

const ACTION_VERBS = new Set([
  'replace',
  'repair',
  'install',
  'remove',
  'service',
  'evaluate',
  'fix',
  'patch',
  'seal',
  'paint',
  'rebuild',
  'refill',
  'recharge',
  'reset',
  'secure',
  'tighten',
  'loosen',
  'adjust',
  'align',
  'clean',
  'rinse',
  'flush',
  'drain',
  'pump',
  'treat',
  'test',
  'inspect',
  'check',
  'monitor',
  'cap',
  'plumb',
  'wire',
  'strap',
  'anchor',
  'mount',
  'demo',
  'demolish',
  'excavate',
  'backfill',
  'grade',
  'compact',
]);

const ARTICLES = new Set(['a', 'an', 'the']);

const billableItemShapeSchema = z.object({
  id: z.string(),
  trade: z.string(),
  action: z.string(),
  scope: z.string(),
  location: z.string(),
  quantity: z.number(),
  unit: z.string(),
  costType: z.string(),
  sourceQuote: z.string().optional(),
  pageHint: z.string().nullable().optional(),
});

const extractionShapeSchema = z.object({
  items: z.array(billableItemShapeSchema),
});

/** Pull the first JSON object out of the LLM text (handles ```json fences). */
function extractFirstJsonObject(text: string): unknown | null {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1]! : text;
  const start = candidate.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

interface ItemViolation {
  index: number;
  id: string | undefined;
  reasons: string[];
}

function validateItem(raw: unknown, index: number): ItemViolation {
  const reasons: string[] = [];
  const item = raw as {
    id?: unknown;
    trade?: unknown;
    action?: unknown;
    scope?: unknown;
    costType?: unknown;
    unit?: unknown;
  };

  if (typeof item.trade === 'string' && !VALIDATION_TRADE.has(item.trade)) {
    reasons.push(
      `trade "${item.trade}" is not in the allowed TRADE enum`,
    );
  }
  if (typeof item.action === 'string' && !VALIDATION_ACTION.has(item.action)) {
    reasons.push(
      `action "${item.action}" is not in the allowed ACTION enum`,
    );
  }
  if (typeof item.unit === 'string' && !VALIDATION_UNIT.has(item.unit)) {
    reasons.push(`unit "${item.unit}" is not in the allowed UNIT enum`);
  }
  if (
    typeof item.costType === 'string' &&
    !VALIDATION_COST_TYPE.has(item.costType)
  ) {
    reasons.push(
      `costType "${item.costType}" is not in the allowed COST_TYPE enum`,
    );
  }

  if (item.costType === 'material' && item.unit === 'hrs') {
    reasons.push(
      'costType=material cannot pair with unit=hrs (HRS is for labor)',
    );
  }

  if (typeof item.scope === 'string') {
    const scope = item.scope.trim();
    const lower = scope.toLowerCase();
    const firstWord = lower.split(/\s+/)[0] ?? '';
    if (ARTICLES.has(firstWord)) {
      reasons.push(
        `scope "${scope}" starts with article "${firstWord}" — emit the noun phrase without a leading article`,
      );
    }
    if (ACTION_VERBS.has(firstWord)) {
      reasons.push(
        `scope "${scope}" starts with action verb "${firstWord}" — the action belongs in the "action" field, not scope`,
      );
    }
    if (/[.!?]/.test(scope)) {
      reasons.push(
        `scope "${scope}" contains sentence punctuation — emit a noun phrase, not a sentence`,
      );
    }
    const tokens = scope.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) {
      reasons.push(
        `scope "${scope}" is a single token — be more specific (e.g. "kitchen GFCI receptacle")`,
      );
    }
  }

  return {
    index,
    id: typeof item.id === 'string' ? item.id : undefined,
    reasons,
  };
}

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

  processOutputStep(args: ProcessOutputStepArgs): import('@mastra/core/processors').ProcessorMessageResult {
    const { text, abort } = args;
    if (typeof text !== 'string' || text.length === 0) {
      return [];
    }

    const parsed = extractFirstJsonObject(text);
    if (parsed === null) {
      abort(
        'Your response did not contain a parseable JSON object matching { items: [...] }. ' +
          'Return ONLY a JSON object with an "items" array. No prose, no preamble, no markdown outside the JSON block.',
        { retry: true, metadata: { reason: 'unparseable-json' } },
      );
    }

    const result = extractionShapeSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      abort(
        `Your response did not match the billableExtractionSchema: ${issues}. ` +
          'Re-emit the same items with the listed fields fixed.',
        { retry: true, metadata: { reason: 'schema-mismatch' } },
      );
    }

    // Zod 4's safeParse types `data` as optional even on success; the
    // abort() above returns `never` so this branch is unreachable on
    // failure. The assertion is sound.
    const data = result.data!;
    const violations: ItemViolation[] = data.items
      .map((item, i) => validateItem(item, i))
      .filter((v) => v.reasons.length > 0);

    if (violations.length === 0) return [];

    const summary = violations
      .slice(0, 5)
      .map((v) => {
        const id = v.id ?? `items[${v.index}]`;
        return `${id}: ${v.reasons.join(' | ')}`;
      })
      .join('\n');
    const more =
      violations.length > 5
        ? `\n(+${violations.length - 5} more items with violations)`
        : '';

    abort(
      `${violations.length} item(s) violated the contract. Fix every one of them and re-emit the full list:\n${summary}${more}`,
      { retry: true, metadata: { violationCount: violations.length } },
    );

    // abort() throws — TypeScript needs a return.
    return [];
  }
}
