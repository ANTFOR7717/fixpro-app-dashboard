import type { Trade } from '@/features/estimate-extraction-pipeline/classification';

/**
 * Format a whole-USD integer dollar amount as a US currency string.
 * Example: 1250 -> "$1,250.00".
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatLineTotal(quantity: number, rate: number): string {
  return formatCurrency(quantity * rate);
}

/**
 * Render the submitter role as a human badge label.
 *
 * `estimate_requests.submitter_role` is a plain `varchar` with no enum
 * constraint. The application currently writes 'agent' or 'homeowner' but
 * the column is not narrowed at the DB level, so this function accepts any
 * string and falls back to a sentence-cased version of the raw value for
 * anything it doesn't recognize. That keeps the report rendering and never
 * crashes on a legacy or future value.
 */
export function formatPartyRole(role: string): string {
  switch (role) {
    case 'agent':
      return 'Agent';
    case 'homeowner':
      return 'Homeowner';
    case 'listing-agent':
      return 'Listing agent';
    case 'buyer-agent':
      return 'Buyer agent';
    default: {
      if (role.length === 0) return 'Submitter';
      // "some-role" -> "Some role"
      const spaced = role.replace(/[-_]+/g, ' ');
      return spaced.charAt(0).toUpperCase() + spaced.slice(1);
    }
  }
}

/**
 * Display label for a `BillableItem.trade`. The schema's `TRADE` enum is
 * lowercase short codes ("hvac", "siding", ...); invoices and estimates
 * print these as capitalized category labels ("HVAC", "Siding"). The
 * report uses this as the small eyebrow above each line title.
 *
 * Exhaustively covers the current 23-value taxonomy (classification's
 * rebuilt `TRADE`, specs/003-classification-rebuild) only. The retired
 * 11-value taxonomy's special-cased labels this function used to also
 * carry (`structural`, `appliance`, `exterior`, `interior`, `other`) were
 * dead code — those values could only ever have reached this function
 * from v1/v2-persisted rows, and v1/v2 support is deleted entirely
 * (specs/007-pipeline-schema-cleanup finding #17) — so `trade`'s
 * parameter type tightens from `string` to the real `Trade` union
 * (finding #15/FR-020): every live caller now only ever passes one.
 */
export function formatTradeLabel(trade: Trade): string {
  switch (trade) {
    case 'hvac':
      return 'HVAC';
    case 'electrical':
      return 'Electrical';
    case 'plumbing':
      return 'Plumbing';
    case 'fire_protection':
      return 'Fire Protection';
    case 'roofing':
      return 'Roofing';
    case 'siding':
      return 'Siding';
    case 'carpentry':
      return 'Carpentry';
    case 'drywall':
      return 'Drywall';
    case 'flooring':
      return 'Flooring';
    case 'glazing':
      return 'Glazing';
    case 'masonry':
      return 'Masonry';
    case 'painting':
      return 'Painting';
    case 'insulation':
      return 'Insulation';
    case 'concrete':
      return 'Concrete';
    case 'waterproofing':
      return 'Waterproofing';
    case 'tile':
      return 'Tile';
    case 'foundation':
      return 'Foundation';
    case 'excavation_grading':
      return 'Excavation & Grading';
    case 'landscaping':
      return 'Landscaping';
    case 'fencing':
      return 'Fencing';
    case 'mold_remediation':
      return 'Mold Remediation';
    case 'pest_control':
      return 'Pest Control';
    case 'general_contractor':
      return 'General Contractor';
  }
}

/**
 * Renderer-side noun-phrase title for a billable item.
 *
 * The model emits `scope` as a Title-Cased noun phrase (e.g. "Damaged
 * Drywall Section", "GFCI Receptacle"). The renderer's job is consistent
 * Title Casing with an acronym allowlist so a downcased "gfci" or "nec"
 * still renders correctly.
 *
 * Acronyms are intentionally a small explicit set: every entry is one
 * the extractor prompt tells the model to use in the noun phrase.
 * Adding a new acronym is a one-line change here. The set lives in
 * `format.ts` (not in the extraction module) because acronym
 * preservation is a renderer-side concern: the schema stores the raw
 * string the model produced, and the renderer is what the user sees.
 */
const ACRONYMS: ReadonlySet<string> = new Set([
  'GFCI',
  'AFCI',
  'NEC',
  'PT',
  'PVC',
  'PEX',
  'CO',
  'CO2',
  'HVAC',
  'GF',
  'WH',
  'R',
  'RCP',
]);

export function formatScope(scope: string): string {
  return titleCaseTokens(scope, ACRONYMS);
}

/**
 * Renderer-side title for a billable line's row. A split pair's Material
 * and Labor rows share the identical `scope` string; they are
 * differentiated by the separate MATERIAL/LABOR badge rendered alongside
 * this title (`items-section.tsx`'s `formatCostType`), not by any
 * action-dependent suffix here.
 */
export function formatItemTitle(scope: string): string {
  return formatScope(scope);
}

export function formatLocation(location: string): string {
  // ZIP codes are not words; leave them verbatim.
  if (/^\d{5}(-\d{4})?$/.test(location)) return location;
  return titleCaseTokens(location, ACRONYMS);
}

function titleCaseTokens(s: string, acronyms: ReadonlySet<string>): string {
  if (s.length === 0) return s;
  return s
    .split(/(\s+)/) // keep whitespace as separators
    .map((token) => titleCaseToken(token, acronyms))
    .join('');
}

function titleCaseToken(token: string, acronyms: ReadonlySet<string>): string {
  if (token.length === 0) return token;
  // If the token matches an acronym (case-insensitive), use the canonical form.
  const upper = token.toUpperCase();
  if (acronyms.has(upper)) return upper;
  // Otherwise, Title Case the first character and leave the rest alone.
  return token.charAt(0).toUpperCase() + token.slice(1);
}

/**
 * Display label for a unit chip: the uppercased unit ("EA", "SF", "LF",
 * "CY", "HRS"). Enriched lines carry their unit structurally — material
 * lines are ea/lf/sf/cy and labor lines are always hrs, enforced by
 * `enrichment/schema.ts`'s discriminated union, so this function never
 * decides anything for them.
 */
export function formatUnit(unit: 'ea' | 'lf' | 'sf' | 'cy' | 'hrs'): string {
  switch (unit) {
    case 'ea':
      return 'EA';
    case 'lf':
      return 'LF';
    case 'sf':
      return 'SF';
    case 'cy':
      return 'CY';
    case 'hrs':
      return 'HRS';
  }
}

/**
 * Display label for a `BillableItem.costType` pill. The renderer is the
 * only place this enum is Title Cased; the schema stores the raw
 * lowercase value.
 */
export function formatCostType(costType: string): string {
  switch (costType) {
    case 'labor':
      return 'Labor';
    case 'material':
      return 'Material';
    default:
      return costType.charAt(0).toUpperCase() + costType.slice(1);
  }
}
