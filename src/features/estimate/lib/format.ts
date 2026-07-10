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
 * Labor-row noun suffix for the two actions that ever produce a
 * material+labor split. Deliberately a NOUN ("Installation"/"Replacement"),
 * not a verb ("Install"/"Replace") — see `formatItemTitle` below for why.
 */
const LABOR_SPLIT_SUFFIX: Partial<Record<string, string>> = {
  install: 'Installation',
  replace: 'Replacement',
};

/**
 * Renderer-side title for a billable line's row, differentiating a split
 * pair's Material and Labor rows without an action-verb prefix.
 *
 * The classification module clones the entire work item — including
 * `scope` — onto both halves of an install/replace split, so both rows
 * would otherwise call `formatScope(scope)` on the identical string: same
 * bold title on both rows, nothing but the small MATERIAL/LABOR badge to
 * tell them apart. Fix is a trailing NOUN qualifier on the labor half only
 * ("Wood Siding Board Replacement" vs "Wood Siding Board") — NOT an
 * action-verb prefix, since a verb prefix was previously tried and
 * dropped for drifting from the report's product-style naming.
 *
 * Labor-only actions (repair, service, evaluate, remove) have no material
 * counterpart to differentiate against, so they get no suffix and render
 * exactly as `formatScope` alone would produce.
 */
export function formatItemTitle(
  scope: string,
  action: string,
  costType: string,
): string {
  const base = formatScope(scope);
  if (costType !== 'labor') return base;
  const suffix = LABOR_SPLIT_SUFFIX[action];
  return suffix ? `${base} ${suffix}` : base;
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
 * "CY", "HRS"). v3 lines carry their unit structurally — material lines
 * are ea/lf/sf/cy and labor lines are always hrs, enforced by the
 * classification module's discriminated union, so this function never
 * decides anything for them. Legacy v1/v2 rows render whatever unit they
 * were persisted with, including the retired 'sqft' alias (displays as
 * "SF").
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
