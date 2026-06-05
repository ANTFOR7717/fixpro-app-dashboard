/**
 * Cosmetic post-processor for `scope`.
 *
 * Strips a leading English article and Title-Cases the first character
 * so we never retry the LLM over a missing "The" or lowercase first
 * letter. This is deliberately a *softener* — it is NOT a validator.
 * The guard still rejects scope violations that matter (leading action
 * verb, sentence punctuation, single-token scope) by routing through
 * the LLM retry loop. The cleaner only handles the two cosmetic
 * issues that are cheaper to fix than to re-prompt for.
 *
 * Pure function. No I/O. Easy to test.
 */

const ARTICLES = new Set(['a', 'an', 'the']);

export function cleanScope(scope: string): string {
  const words = scope.trim().split(/\s+/);
  if (words.length > 1 && ARTICLES.has(words[0]!.toLowerCase())) {
    words.shift();
  }
  const cleaned = words.join(' ');
  if (cleaned.length === 0) return scope;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
