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
 * Professional line-item title for an invoice/estimate row.
 *
 * Standard trade-invoice convention is `<Action verb> <specific scope>`,
 * with location and quantity surfaced as secondary metadata — not
 * `<trade> — <action>` (e.g. "interior — replace"), which reads like a
 * tracking tag instead of a description of the work.
 *
 * Action verbs are normalized to a professional imperative phrase:
 *   - repair   -> "Repair"
 *   - replace  -> "Replace"
 *   - install  -> "Install"
 *   - remove   -> "Remove"
 *   - service  -> "Service"
 *   - evaluate -> "Inspect & evaluate"
 *
 * The scope is the inspector-grounded noun phrase from the extractor
 * ("kitchen GFCI receptacle", "double-tapped breaker #14", ...), so we
 * just lower-case its first character when joining to keep sentence-case
 * flow. We deliberately don't append the location here — the report
 * renders that on its own muted line so the title stays scannable.
 */
export function formatItemTitle(item: {
  action: string;
  scope: string;
}): string {
  const verb = formatActionVerb(item.action);
  const scope = leadLower(item.scope);
  return `${verb} ${scope}`;
}

function formatActionVerb(action: string): string {
  switch (action) {
    case 'repair':
      return 'Repair';
    case 'replace':
      return 'Replace';
    case 'install':
      return 'Install';
    case 'remove':
      return 'Remove';
    case 'service':
      return 'Service';
    case 'evaluate':
      return 'Inspect & evaluate';
    default: {
      if (action.length === 0) return 'Address';
      return action.charAt(0).toUpperCase() + action.slice(1);
    }
  }
}

/**
 * Lower-cases only the first character when the rest of the string isn't
 * already mid-sentence-cased (e.g. don't downcase a proper noun "GFCI").
 * The scope is short noun-phrase content like "GFCI receptacle" or
 * "angle stop under kitchen sink"; we only nudge a plain leading capital
 * down to flow after the verb.
 */
function leadLower(s: string): string {
  if (s.length === 0) return s;
  const first = s.charAt(0);
  const second = s.charAt(1);
  // If the first two chars are both uppercase (acronym like "GFCI"),
  // leave the original casing alone.
  if (first === first.toUpperCase() && second && second === second.toUpperCase()) {
    return s;
  }
  return first.toLowerCase() + s.slice(1);
}
