/**
 * Round to the nearest quarter-hour, floored at 0.25. Shared by
 * classification (inspector-stated hours) and pricing (estimated hours) —
 * domain-free arithmetic, not a decision either module owns.
 */
export function roundToQuarter(hours: number): number {
  return Math.max(0.25, Math.round(hours * 4) / 4);
}
