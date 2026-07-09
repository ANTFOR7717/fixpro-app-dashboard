import {
  TRADE,
  ACTION,
  UNIT,
} from '../../billable-item-extractor.schema';
import {
  ARTICLES,
  SENTENCE_PUNCTUATION_RE,
  AREA_MATERIAL_KEYWORDS,
  LENGTH_MATERIAL_KEYWORDS,
} from './item-heuristics';
import { ACTION_COST_PROFILE, ACTION_VERBS_SET } from '../../../config/agent-rules';
import type { Action, ExtractedItemGuard } from '../../billable-item-extractor.schema';

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
  reasons.push(...checkUnitActionCoupling(item.action, item.unit));
  reasons.push(...checkMaterialUnitPlausibility(item.scope, item.unit));
  reasons.push(...checkMixedMaterialTypeScope(item.scope));

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

/**
 * Split-action / unit coupling. `install` and `replace` items are split
 * by `merge-items.ts` into a material line + a labor line that both
 * inherit `unit` — and hours cannot count a part. The guard asks the
 * model for the physical unit of the thing being installed; if the
 * model still emits 'hrs' after the retry budget, `classifyAndSplit`
 * in `merge-items.ts` coerces the MATERIAL line to 'ea' (the labor
 * line may legitimately keep 'hrs').
 *
 * Same two-layer pattern as `checkScopeShape`: guard retries the model,
 * merge applies the deterministic fallback.
 *
 * An `action` outside the ACTION enum yields no coupling reason here —
 * `checkEnum` already reports it, and `ACTION_COST_PROFILE` lookup is
 * simply undefined for it.
 */
export function checkUnitActionCoupling(action: string, unit: string): string[] {
  if (ACTION_COST_PROFILE[action as Action] === 'material-and-labor' && unit === 'hrs') {
    return [
      `unit "hrs" is not valid for action "${action}" — this item is split into a material line and a labor line, and a part cannot be counted in hours. Use the physical unit of the item being installed ("ea", "lf", "sf", "cy").`,
    ];
  }
  return [];
}

/**
 * Catches the "1 EA of wood siding" failure mode: `unit: 'ea'` on a scope
 * naming a material real contractors quote by area or length, regardless
 * of whether the report stated an explicit measurement. Only fires for
 * `unit === 'ea'` — sf/lf/hrs/cy are never flagged here, since the model
 * already picked a plausible measured unit in that case.
 */
export function checkMaterialUnitPlausibility(scope: string, unit: string): string[] {
  if (unit !== 'ea') return [];
  const lower = scope.toLowerCase();

  for (const keyword of AREA_MATERIAL_KEYWORDS) {
    if (lower.includes(keyword)) {
      return [
        `scope "${scope}" names an area-measured material ("${keyword}") but unit is "ea" — contractors quote this by square footage. Use unit "sf", not "ea", even if the report gives no explicit measurement.`,
      ];
    }
  }
  for (const keyword of LENGTH_MATERIAL_KEYWORDS) {
    if (lower.includes(keyword)) {
      return [
        `scope "${scope}" names a length-measured material ("${keyword}") but unit is "ea" — contractors quote this by linear footage. Use unit "lf", not "ea", even if the report gives no explicit measurement.`,
      ];
    }
  }
  return [];
}

/**
 * Catches a scope naming BOTH an area-measured material AND a
 * length-measured material (e.g. "trim or wood siding" — trim is `lf`,
 * siding is `sf`). This is a provable unit conflict: the scope names two
 * components that can never share one correct unit, so it must become
 * two items, not one.
 *
 * Deliberately NOT a generic "contains the word 'or'/'and'" check — an
 * earlier draft of this rule used exactly that regex and would have
 * incorrectly flagged "Peeling And Chipping Exterior Paint" (one
 * material, two symptoms, joined by "and" — not two different
 * components). Requiring a match from BOTH keyword sets targets the
 * actual defect (mismatched unit types) instead of grammar.
 */
export function checkMixedMaterialTypeScope(scope: string): string[] {
  const lower = scope.toLowerCase();
  const hasArea = [...AREA_MATERIAL_KEYWORDS].some((k) => lower.includes(k));
  const hasLength = [...LENGTH_MATERIAL_KEYWORDS].some((k) => lower.includes(k));
  if (hasArea && hasLength) {
    return [
      `scope "${scope}" names both an area-measured material and a length-measured material — these can never share one correct unit. Emit TWO separate items, one per component, each with its own correct unit ("sf" or "lf").`,
    ];
  }
  return [];
}
