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
