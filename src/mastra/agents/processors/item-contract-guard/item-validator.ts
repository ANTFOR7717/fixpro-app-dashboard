import {
  TRADE,
  ACTION,
  UNIT,
} from '../../billable-item-extractor.schema';
import {
  ARTICLES,
  SENTENCE_PUNCTUATION_RE,
} from './item-heuristics';
import { ACTION_VERBS_SET } from '../../../config/agent-rules';
import type { ExtractedItemGuard } from '../../billable-item-extractor.schema';

/**
 * The shape of a single contract violation, ready to be rendered into
 * the abort message that goes back to the LLM.
 */
export interface ItemViolation {
  /** Position in the items array (0-indexed). */
  readonly index: number;
  /** Item id when present, for the LLM to address it by name. */
  readonly id: string | undefined;
  /** Human-readable reasons — one string per failed rule. */
  readonly reasons: readonly string[];
}

/**
 * Enum sets derived from the schema, so the guard can never drift from
 * the formal contract.
 */
const VALID_TRADES: ReadonlySet<string> = new Set<string>(TRADE);
const VALID_ACTIONS: ReadonlySet<string> = new Set<string>(ACTION);
const VALID_UNITS: ReadonlySet<string> = new Set<string>(UNIT);

/**
 * Validate one parsed item against the report contract.
 *
 * Returns reasons for each rule the item violates. The caller decides
 * whether to aggregate, truncate, and translate the reasons into an
 * abort message. This function does not throw and does not know about
 * Mastra, Zod, or the LLM.
 */
export function validateItem(
  item: ExtractedItemGuard,
  index: number,
): ItemViolation {
  const reasons: string[] = [];

  checkEnum('trade', item.trade, VALID_TRADES, reasons);
  checkEnum('action', item.action, VALID_ACTIONS, reasons);
  checkEnum('unit', item.unit, VALID_UNITS, reasons);

  reasons.push(...checkScopeShape(item.scope));

  return {
    index,
    id: item.id,
    reasons,
  };
}

function checkEnum(
  field: 'trade' | 'action' | 'unit',
  value: string,
  allowed: ReadonlySet<string>,
  out: string[],
): void {
  if (!allowed.has(value)) {
    out.push(`${field} "${value}" is not in the allowed ${field.toUpperCase()} enum`);
  }
}

/**
 * Exported so `merge-items.ts` can run the identical rule as a
 * deterministic safety net AFTER the guard's retry budget is exhausted.
 * The guard retries the model up to `maxProcessorRetries` times on a
 * violation, but if the model still emits a vague scope on the final
 * attempt, the guard's `abort()` gives up and the bad scope reaches
 * `merge-items.ts` anyway — this same function is the last line of
 * defense there, which only works if it's the SAME rule, not a
 * hand-copied duplicate that can drift.
 */
export function checkScopeShape(scope: string): string[] {
  const reasons: string[] = [];
  const trimmed = scope.trim();
  const firstWord = trimmed.toLowerCase().split(/\s+/)[0] ?? '';

  if (ARTICLES.has(firstWord)) {
    reasons.push(
      `scope "${scope}" starts with article "${firstWord}" — emit the noun phrase without a leading article`,
    );
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (ACTION_VERBS_SET.has(firstWord) && tokens.length < 3) {
    reasons.push(
      `scope "${scope}" likely starts with an action verb — the action belongs in the "action" field, not scope`,
    );
  }
  if (SENTENCE_PUNCTUATION_RE.test(trimmed)) {
    reasons.push(
      `scope "${scope}" contains sentence punctuation — emit a noun phrase, not a sentence`,
    );
  }
  if (tokens.length < 2) {
    reasons.push(
      `scope "${scope}" is a single token — be more specific (e.g. "kitchen GFCI receptacle")`,
    );
  }
  return reasons;
}
