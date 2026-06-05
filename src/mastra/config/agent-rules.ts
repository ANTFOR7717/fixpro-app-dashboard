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

/**
 * `costType -> set of units that are not allowed for that costType`.
 * A lookup keeps the validator free of nested conditionals and makes
 * the rules trivially diffable in code review.
 */
export const INCOMPATIBLE_UNITS: Readonly<Record<string, ReadonlySet<string>>> = {
  material: new Set(['hrs']),
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
