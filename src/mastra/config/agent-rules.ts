/**
 * Centralized business rules for the billable-item extractor agent.
 *
 * These are rules that encode product policy, not tokenizer heuristics.
 * They are kept here (and not in the validator or schema) so that
 * non-engineers (PM, QA) can adjust coupling and verb policy without
 * touching guard code.
 *
 * Two kinds of rules live here:
 *   1. `incompatibleUnitByCostType` — unit/costType coupling. Adding a
 *      new rule is one line. The validator consumes it as a lookup.
 *   2. `ACTION_VERBS` — the canonical list of verbs the extractor is
 *      told to keep out of `scope`. Re-exported from item-heuristics
 *      so that downstream code (the cleaner, the prompts) reads the
 *      same source of truth.
 *
 * If a future rule needs to make an LLM call, route an HTTP request, or
 * read from a feature flag service, define a getter or async resolver
 * here and let the guard call it.
 */

import { ACTION_VERBS } from '../agents/processors/item-contract-guard/item-heuristics';
import type { Action, CostType } from '../agents/billable-item-extractor.schema';

/**
 * Whether an action implies ONLY labor, or BOTH a material purchase and
 * labor to install/replace it.
 *
 * This is deterministic, not a model judgment call: `repair`, `service`,
 * `evaluate`, and `remove` never involve buying a new part — you fix,
 * maintain, inspect, or take away something that already exists.
 * `install` and `replace` always do — a receptacle, a damper door, a
 * drain stop, etc. is a physical thing the contractor must buy before
 * they can charge labor to put it in.
 *
 * `merge-items.ts` reads this to assign `costType` and to decide whether
 * an item becomes one billable line (`'labor-only'`) or two
 * (`'material-and-labor'` — a `material` line + a `labor` line).
 *
 * This replaces the old `INCOMPATIBLE_UNITS` cross-check, which existed
 * only to catch a bad model-emitted `costType` guess. Once `costType` is
 * no longer model output (see `extractedItemSchema`), that failure mode
 * is structurally impossible and the cross-check has nothing left to
 * catch.
 */
export const ACTION_COST_PROFILE: Readonly<
  Record<Action, 'labor-only' | 'material-and-labor'>
> = {
  repair: 'labor-only',
  service: 'labor-only',
  evaluate: 'labor-only',
  remove: 'labor-only',
  install: 'material-and-labor',
  replace: 'material-and-labor',
};

/**
 * What the pricer must include in its number for one billable line.
 * Derived deterministically from (action, costType) — never a model
 * judgment call:
 *
 *   - 'material-part-only'   — material half of a split install/replace
 *     pair. Price the part; the sibling labor line covers installation.
 *   - 'labor-excluding-part' — labor half of a split pair. Price the
 *     labor to perform the action; the sibling material line covers
 *     the part.
 *   - 'all-in-job'           — labor-only actions (repair / service /
 *     evaluate / remove). There is NO sibling material line, so the
 *     price must be the complete job: labor PLUS incidental materials
 *     (patching compound, sealant, fasteners) PLUS disposal where the
 *     action implies it.
 *
 * `price-items.ts` computes this per line and passes it to the pricer
 * as an explicit input field, so the model never has to infer whether
 * a sibling line exists. Before this rule, the pricer excluded parts
 * from EVERY labor line — correct for split pairs, but for labor-only
 * actions the excluded materials had no other line to land on and
 * silently vanished from the estimate.
 */
export type PricingBasis =
  | 'material-part-only'
  | 'labor-excluding-part'
  | 'all-in-job';

export function pricingBasisFor(action: Action, costType: CostType): PricingBasis {
  if (ACTION_COST_PROFILE[action] === 'labor-only') return 'all-in-job';
  return costType === 'material' ? 'material-part-only' : 'labor-excluding-part';
}

/**
 * Verbs that the extractor is told to keep out of `scope`. Six of these
 * are the model's canonical ACTION enum values; the rest are common
 * home-repair verbs the model has been observed slipping into scope.
 *
 * Re-exported from item-heuristics so the prompts, the cleaner, and
 * the guard all read the same source of truth.
 */
export const ACTION_VERBS_SET: ReadonlySet<string> = ACTION_VERBS;
