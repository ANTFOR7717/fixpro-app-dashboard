/**
 * Pull the first JSON object out of an LLM response string.
 *
 * Handles the two common shapes:
 *   1. Raw JSON: `{"items": [...]}`
 *   2. Fenced markdown: ```json\n{"items": [...]}\n```
 *
 * Returns `null` if no balanced top-level `{...}` is found OR if the
 * candidate slice fails to parse as JSON.
 *
 * This is a focused, single-purpose utility. It is NOT a general-purpose
 * JSON parser. It exists because the LLM sometimes wraps the structured
 * response in markdown fences, and Zod needs a parsed value to validate.
 */

const FENCE_RE = /```(?:json)?\s*([\s\S]*?)```/;

export function extractFirstJsonObject(text: string): unknown | null {
  const fenceMatch = text.match(FENCE_RE);
  const candidate = fenceMatch ? fenceMatch[1]! : text;
  const start = candidate.indexOf('{');
  if (start === -1) return null;
  return sliceBalancedObject(candidate, start);
}

/**
 * Walk forward from `start` (assumed to point at `{`) and return
 * `JSON.parse` of the balanced object, or `null` if no balance is found
 * or parsing fails. Respects string boundaries and escape sequences.
 */
function sliceBalancedObject(candidate: string, start: number): unknown | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') {
      depth++;
      continue;
    }
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
