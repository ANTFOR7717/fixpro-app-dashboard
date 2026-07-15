import { PDFParse } from 'pdf-parse';
import type { ParsedDocument } from './schema';

/** Budget for fetching the source PDF from blob storage. */
const FETCH_TIMEOUT_MS = 60_000;

/**
 * Fetch a PDF from its URL and extract plain text page by page.
 *
 * Uses `pdf-parse`'s `PDFParse` class — there is no PDF primitive in
 * `@mastra/core`. This is the ONLY place in the pipeline that reads PDF
 * bytes directly — extraction's agent call reads this function's
 * page-indexed plain-text output, never the raw PDF file itself, so the
 * quality of this text extraction directly bounds what extraction can
 * ground its findings in.
 *
 * Throws on any failure (fetch, parse). Per this pipeline's established
 * failure model (`AGENTS.md`: "steps THROW; retries re-run them"), the
 * calling step's `retries` handles transient failures — this function does
 * not catch-and-wrap into a non-throwing result.
 */
export async function parsePdfFromUrl(fileUrl: string): Promise<ParsedDocument> {
  const response = await fetch(fileUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(
      `Could not fetch source PDF (${response.status} ${response.statusText}): ${fileUrl}`,
    );
  }
  const data = new Uint8Array(await response.arrayBuffer());

  const parser = new PDFParse({ data });
  try {
    const info = await parser.getInfo();
    const pages: ParsedDocument['pages'] = [];
    for (let pageNumber = 1; pageNumber <= info.total; pageNumber++) {
      const result = await parser.getText({ partial: [pageNumber] });
      // Malformed PDF text streams can decode to literal NUL characters.
      // Postgres's jsonb type cannot represent \u0000 at all (live-verified
      // this session: `PgVector.upsert` fails with "unsupported Unicode
      // escape sequence" the moment such a chunk reaches the metadata
      // column) — strip it here, the one place raw PDF bytes are read, so
      // every downstream consumer (chunking, embedding, the stored quote)
      // sees clean text.
      const content = result.text.replace(/\u0000/g, '');
      if (content.trim().length > 0) {
        pages.push({ pageNumber, content });
      }
    }
    return { pages };
  } finally {
    await parser.destroy();
  }
}
