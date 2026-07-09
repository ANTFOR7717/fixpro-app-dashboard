/**
 * Domain heuristics for the billable-item extractor guard.
 *
 * These are deliberately simple, deliberately explicit, and deliberately
 * kept out of the guard's control flow. They're constants, not code paths.
 * Adding a new verb or article is a one-line change here, not a refactor
 * of the validator.
 *
 * If the heuristic ever needs to grow (e.g. POS tagging, a small ML
 * model, or pulling from a config file), this is the only file that
 * changes.
 */

/** English articles. A `scope` that starts with one is a sentence fragment. */
export const ARTICLES: ReadonlySet<string> = new Set(['a', 'an', 'the']);

/**
 * Verbs that the extractor is told to keep out of `scope` — the `action`
 * field is the right home for them. Six of these are the model's
 * canonical ACTION enum values; the rest are common home-repair verbs
 * the model has been observed slipping into scope.
 */
export const ACTION_VERBS: ReadonlySet<string> = new Set([
  'replace',
  'repair',
  'install',
  'remove',
  'service',
  'evaluate',
  'fix',
  'patch',
  'seal',
  'paint',
  'rebuild',
  'refill',
  'recharge',
  'reset',
  'secure',
  'tighten',
  'loosen',
  'adjust',
  'align',
  'clean',
  'rinse',
  'flush',
  'drain',
  'pump',
  'treat',
  'test',
  'inspect',
  'check',
  'monitor',
  'cap',
  'plumb',
  'wire',
  'strap',
  'anchor',
  'mount',
  'demo',
  'demolish',
  'excavate',
  'backfill',
  'grade',
  'compact',
]);

/** Sentence-ending punctuation. A `scope` containing any of these is a sentence. */
export const SENTENCE_PUNCTUATION_RE: RegExp = /[.!?]/;

/**
 * Materials real contractors quote by SQUARE FOOTAGE, never "each" — even
 * when the inspection report gives no explicit measurement. A scope
 * naming one of these with `unit: 'ea'` is implausible on its face: nobody
 * buys or bids "1 each" of siding or drywall.
 */
export const AREA_MATERIAL_KEYWORDS: ReadonlySet<string> = new Set([
  'siding', 'drywall', 'roofing', 'shingle', 'shingles', 'flooring',
  'subfloor', 'sheathing', 'insulation', 'stucco', 'plaster', 'underlayment',
  'membrane', 'paneling',
]);

/**
 * Materials real contractors quote by LINEAR FOOTAGE, never "each" — same
 * rationale as `AREA_MATERIAL_KEYWORDS`, for length-measured trim/edge
 * components.
 */
export const LENGTH_MATERIAL_KEYWORDS: ReadonlySet<string> = new Set([
  'trim', 'fascia', 'soffit', 'gutter', 'downspout', 'fencing', 'fence',
  'railing', 'baseboard', 'casing', 'molding', 'coping', 'flashing',
  'weatherstripping',
]);
