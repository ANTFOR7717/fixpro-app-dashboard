import type { ParsedDocument } from './schema';

/** Budget for fetching the source PDF from blob storage. */
const FETCH_TIMEOUT_MS = 60_000;

type DOMMatrixInit = number[] | Float32Array | Float64Array;

class PdfParseDOMMatrixShim {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: DOMMatrixInit) {
    if (init) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = Array.from(init);
    }
  }

  translate(tx = 0, ty = 0) {
    return new PdfParseDOMMatrixShim([this.a, this.b, this.c, this.d, this.e + tx, this.f + ty]);
  }

  scale(scaleX = 1, scaleY = scaleX) {
    return new PdfParseDOMMatrixShim([
      this.a * scaleX,
      this.b * scaleX,
      this.c * scaleY,
      this.d * scaleY,
      this.e,
      this.f,
    ]);
  }

  multiplySelf(other: PdfParseDOMMatrixShim) {
    const a = this.a * other.a + this.c * other.b;
    const b = this.b * other.a + this.d * other.b;
    const c = this.a * other.c + this.c * other.d;
    const d = this.b * other.c + this.d * other.d;
    const e = this.a * other.e + this.c * other.f + this.e;
    const f = this.b * other.e + this.d * other.f + this.f;
    [this.a, this.b, this.c, this.d, this.e, this.f] = [a, b, c, d, e, f];
    return this;
  }

  preMultiplySelf(other: PdfParseDOMMatrixShim) {
    const current = new PdfParseDOMMatrixShim([this.a, this.b, this.c, this.d, this.e, this.f]);
    [this.a, this.b, this.c, this.d, this.e, this.f] = [
      other.a,
      other.b,
      other.c,
      other.d,
      other.e,
      other.f,
    ];
    return this.multiplySelf(current);
  }

  invertSelf() {
    const det = this.a * this.d - this.b * this.c;
    if (det === 0) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = [NaN, NaN, NaN, NaN, NaN, NaN];
      return this;
    }

    const a = this.d / det;
    const b = -this.b / det;
    const c = -this.c / det;
    const d = this.a / det;
    const e = (this.c * this.f - this.d * this.e) / det;
    const f = (this.b * this.e - this.a * this.f) / det;
    [this.a, this.b, this.c, this.d, this.e, this.f] = [a, b, c, d, e, f];
    return this;
  }
}

function ensurePdfParseNodeGlobals() {
  globalThis.DOMMatrix ??= PdfParseDOMMatrixShim as unknown as typeof DOMMatrix;
}

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
  ensurePdfParseNodeGlobals();
  const { PDFParse } = await import('pdf-parse');

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
