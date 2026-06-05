import {
  TRADE,
  ACTION,
  UNIT,
  COST_TYPE,
} from '../../billable-item-extractor.schema';
import {
  ARTICLES,
  ACTION_VERBS,
  SENTENCE_PUNCTUATION_RE,
} from './item-heuristics';
import type { ItemShape } from './item-shape-schema';

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
const VALID_COST_TYPES: ReadonlySet<string> = new Set<string>(COST_TYPE);

/**
 * Validate one parsed item against the report contract.
 *
 * Returns reasons for each rule the item violates. The caller decides
 * whether to aggregate, truncate, and translate the reasons into an
 * abort message. This function does not throw and does not know about
 * Mastra, Zod, or the LLM.
 */
export function validateItem(
  item: ItemShape,
  index: number,
): ItemViolation {
  const reasons: string[] = [];

  checkEnum('trade', item.trade, VALID_TRADES, reasons);
  checkEnum('action', item.action, VALID_ACTIONS, reasons);
  checkEnum('unit', item.unit, VALID_UNITS, reasons);
  checkEnum('costType', item.costType, VALID_COST_TYPES, reasons);

  if (item.costType === 'material' && item.unit === 'hrs') {
    reasons.push(
      'costType=material cannot pair with unit=hrs (HRS is for labor)',
    );
  }

  checkScopeShape(item.scope, reasons);

  return {
    index,
    id: item.id,
    reasons,
  };
}

function checkEnum(
  field: 'trade' | 'action' | 'unit' | 'costType',
  value: string,
  allowed: ReadonlySet<string>,
  out: string[],
): void {
  if (!allowed.has(value)) {
    out.push(`${field} "${value}" is not in the allowed ${field.toUpperCase()} enum`);
  }
}

function checkScopeShape(scope: string, out: string[]): void {
  const trimmed = scope.trim();
  const firstWord = trimmed.toLowerCase().split(/\s+/)[0] ?? '';

  if (ARTICLES.has(firstWord)) {
    out.push(
      `scope "${scope}" starts with article "${firstWord}" — emit the noun phrase without a leading article`,
    );
  }
  if (ACTION_VERBS.has(firstWord)) {
    out.push(
      `scope "${scope}" starts with action verb "${firstWord}" — the action belongs in the "action" field, not scope`,
    );
  }
  if (SENTENCE_PUNCTUATION_RE.test(trimmed)) {
    out.push(
      `scope "${scope}" contains sentence punctuation — emit a noun phrase, not a sentence`,
    );
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    out.push(
      `scope "${scope}" is a single token — be more specific (e.g. "kitchen GFCI receptacle")`,
    );
  }
}
