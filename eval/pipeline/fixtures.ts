import { readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expectedOutputSchema, type ExpectedOutput } from './schema';

export interface ValidFixture {
  slug: string;
  pdfPath: string;
  expected: ExpectedOutput;
}

export interface InvalidFixture {
  slug: string;
  reason: string;
}

export interface DiscoveredFixtures {
  valid: ValidFixture[];
  invalid: InvalidFixture[];
}

/**
 * Discovers `<slug>.pdf` + `<slug>.expected.ts` pairs under `dir`.
 * Adding a new fixture requires no change here (FR-008) — any matching
 * pair present at run time is picked up automatically. A `.pdf` with no
 * matching, schema-valid `.expected.ts` is reported invalid, never
 * silently skipped or scored as a pass (FR-009b).
 */
export async function discoverFixtures(dir: string): Promise<DiscoveredFixtures> {
  const entries = readdirSync(dir);
  const pdfSlugs = entries
    .filter((name) => name.endsWith('.pdf'))
    .map((name) => basename(name, '.pdf'));

  const valid: ValidFixture[] = [];
  const invalid: InvalidFixture[] = [];

  for (const slug of pdfSlugs) {
    const expectedFile = `${slug}.expected.ts`;
    if (!entries.includes(expectedFile)) {
      invalid.push({ slug, reason: `Missing ${expectedFile}` });
      continue;
    }
    const expectedPath = join(dir, expectedFile);
    let mod: unknown;
    try {
      mod = await import(pathToFileURL(expectedPath).href);
    } catch (error) {
      invalid.push({
        slug,
        reason: `${expectedFile} failed to load: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    const candidate = (mod as { default?: unknown }).default;
    const parsed = expectedOutputSchema.safeParse(candidate);
    if (!parsed.success) {
      invalid.push({
        slug,
        reason: `${expectedFile}'s default export does not match expectedOutputSchema: ${parsed.error.message}`,
      });
      continue;
    }
    valid.push({ slug, pdfPath: join(dir, `${slug}.pdf`), expected: parsed.data });
  }

  return { valid, invalid };
}
