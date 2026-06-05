/**
 * Pull the first JSON object out of an LLM response string.
 *
 * Handles the two common shapes:
 *   1. Raw JSON: `{"items": [...]}`
 *   2. Fenced markdown: ```json\n{"items": [...]}\n```
 *
 * Returns `null` if no top-level `{...}` is found OR if jsonrepair+parse fail.
 *
 * This is a focused, single-purpose utility. It is NOT a general-purpose
 * JSON parser. It exists because the LLM sometimes wraps the structured
 * response in markdown fences, and Zod needs a parsed value to validate.
 *
 * `jsonrepair` is a tiny dedicated lib that handles LLM-typical JSON slop:
 * trailing commas, unquoted keys, single quotes, comments, Python literals
 * (None/True/False), and unterminated strings (it will close them). It's
 * safer than a hand-rolled walker because it has unit-tested corner cases
 * (e.g. braces inside strings, escaped quotes).
 */

import { jsonrepair } from 'jsonrepair';

const FENCE_RE = /```(?:json)?\s*([\s\S]*?)```/;

export function extractFirstJsonObject(text: string): unknown | null {
  const fenceMatch = text.match(FENCE_RE);
  const candidate = fenceMatch ? fenceMatch[1]! : text;
  const start = candidate.indexOf('{');
  if (start === -1) return null;
  const end = findBalancedEnd(candidate, start);
  if (end === -1) return null;
  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(jsonrepair(slice));
  } catch {
    return null;
  }
}

function findBalancedEnd(s: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i]!;
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
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
