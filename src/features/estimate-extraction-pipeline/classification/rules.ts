import type { Action } from '../extraction/schema';
import type { CostType } from './schema';

/**
 * Whether an action implies ONLY labor, or BOTH a material purchase and
 * labor to install/replace it. Deterministic, not a model judgment call:
 * `repair`, `service`, `evaluate`, `remove` never involve buying a new
 * part; `install`/`replace` always do.
 */
export const ACTION_COST_PROFILE: Readonly<Record<Action, 'labor-only' | 'material-and-labor'>> = {
  repair: 'labor-only',
  service: 'labor-only',
  evaluate: 'labor-only',
  remove: 'labor-only',
  install: 'material-and-labor',
  replace: 'material-and-labor',
};

/**
 * What the pricer's number must cover for one line. Derived
 * deterministically from (action, costType):
 *
 *   - 'material-part-only'   — material half of an install/replace pair.
 *     Price the part per physical unit; the sibling labor line covers
 *     installation.
 *   - 'labor-install-hourly' — labor half of an install/replace pair.
 *     HOURLY RATE for installing the sibling part; exclude the part cost.
 *   - 'labor-all-in-hourly'  — labor-only actions. No material sibling, so
 *     the hourly rate must be the all-in rate a contractor quotes: labor
 *     PLUS incidental materials PLUS disposal where the action implies it.
 */
export type PricingBasis = 'material-part-only' | 'labor-install-hourly' | 'labor-all-in-hourly';

export function pricingBasisFor(action: Action, costType: CostType): PricingBasis {
  if (costType === 'material') return 'material-part-only';
  return ACTION_COST_PROFILE[action] === 'labor-only'
    ? 'labor-all-in-hourly'
    : 'labor-install-hourly';
}
