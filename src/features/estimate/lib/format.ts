/**
 * Format a whole-USD integer dollar amount as a US currency string.
 * Inputs are integers (the pricer agent and DB schema enforce that).
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

/**
 * Render a per-line total. When the pricer was unable to defend a price
 * (`unitPrice === null`), return the literal sentinel the report uses so
 * the grand-total row can also detect partial coverage by counting
 * sentinels.
 */
export const PRICE_UNAVAILABLE = 'Price unavailable' as const;

export function formatLineTotal(
  quantity: number,
  unitPrice: number | null,
): string {
  if (unitPrice === null) return PRICE_UNAVAILABLE;
  return formatCurrency(quantity * unitPrice);
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
 * lowercase short codes ("hvac", "interior", ...); invoices and estimates
 * print these as capitalized category labels ("HVAC", "Interior"). The
 * report uses this as the small eyebrow above each line title.
 */
export function formatTradeLabel(trade: string): string {
  switch (trade) {
    case 'hvac':
      return 'HVAC';
    case 'electrical':
      return 'Electrical';
    case 'plumbing':
      return 'Plumbing';
    case 'roofing':
      return 'Roofing';
    case 'structural':
      return 'Structural';
    case 'carpentry':
      return 'Carpentry';
    case 'masonry':
      return 'Masonry';
    case 'appliance':
      return 'Appliance';
    case 'exterior':
      return 'Exterior';
    case 'interior':
      return 'Interior';
    case 'other':
      return 'General';
    default: {
      if (trade.length === 0) return 'General';
      return trade.charAt(0).toUpperCase() + trade.slice(1);
    }
  }
}

/**
 * Renderer-side noun-phrase title for a billable item.
 *
 * Post-PR #13 the model emits `scope` as a Title-Cased noun phrase
 * (e.g. "Damaged Drywall Section", "GFCI Receptacle"). The renderer
 * does NOT invent a verb prefix and does NOT append a disambiguation
 * suffix — those were the v1 plan's rules and they drifted from the
 * prototype. The renderer's job is consistent Title Casing with an
 * acronym allowlist so a downcased "gfci" or "nec" still renders
 * correctly.
 *
 * Acronyms are intentionally a small explicit set: every entry is one
 * the extractor prompt tells the model to use in the noun phrase.
 * Adding a new acronym is a one-line change here. The set lives in
 * `format.ts` (not in the agent's `item-heuristics.ts`) because acronym
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
 * Display label for a `BillableItem.unit` chip: the uppercased unit
 * ("EA", "SF", "LF", "CY", "HRS"). `sqft` renders as "SF" — old persisted
 * envelopes may still contain the alias; `merge-items.ts` normalizes new
 * data to 'sf'.
 *
 * Labor lines show their stored unit. The pricer prices per that unit
 * (per-fixture, per-SF labor rates are standard trade convention); the
 * removed prototype rule that forced "HRS" onto every labor line
 * misstated those per-unit rates as hours.
 */
export function formatUnit(unit: string): string {
  switch (unit) {
    case 'ea':
      return 'EA';
    case 'lf':
      return 'LF';
    case 'sf':
    case 'sqft':
      return 'SF';
    case 'cy':
      return 'CY';
    case 'hrs':
      return 'HRS';
    default:
      return unit.toUpperCase();
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
