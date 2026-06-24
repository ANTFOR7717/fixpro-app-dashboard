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
import type { Action } from '../agents/billable-item-extractor.schema';

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
 * Verbs that the extractor is told to keep out of `scope`. Six of these
 * are the model's canonical ACTION enum values; the rest are common
 * home-repair verbs the model has been observed slipping into scope.
 *
 * Re-exported from item-heuristics so the prompts, the cleaner, and
 * the guard all read the same source of truth.
 */
export const ACTION_VERBS_SET: ReadonlySet<string> = ACTION_VERBS;
