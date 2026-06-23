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
