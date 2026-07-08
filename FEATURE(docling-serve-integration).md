# FEATURE(docling-serve-integration)

## Request

Build the application-side integration layer for a **hosted Docling Serve
instance**: uploaded inspection PDFs (already stored as public Vercel Blob
URLs) are **submitted** to the Docling host, the app **polls for completion**,
and the parsed document (markdown with page numbers) is **fetched back** into
the Mastra workflow — the async submit → poll → result flow, so no single
HTTP call has to stay open for the length of a large OCR job.

Scope: HTTP client, Zod contracts, env config, error handling, and a
`parse-document` workflow step. **Application side only** — hosting is out
of scope and already satisfied: the instance is provisioned (IBM DCLS,
Docling SaaS) and its base URL + `X-Api-Key` are stored in the gitignored
`.env.local` under `DOCLING_SERVE_URL` / `DOCLING_SERVE_API_KEY`.

### Coordination contract with the in-flight architecture whiteboard

`FEATURE(extraction-recall-precision-split).md` (being authored concurrently)
plans the 3-stage extraction pipeline whose **Stage 0 consumes this
integration**. To guarantee the two plans compose without conflict:

- **This document owns:** the Docling client + schemas
  (`src/mastra/services/docling/*`), the `parse-document` step
  (`src/mastra/workflows/steps/parse-document.ts`), and the `.env.example`
  additions. No other plan may define these files.
- **This document does NOT touch:** `summarize-estimate.ts` (workflow
  wiring), `extract-items.ts`, `audit-items.ts`, or any agent/prompt file.
  Inserting `parseDocumentStep` into the workflow chain is the architecture
  plan's job (one `.then(parseDocumentStep)` line between `mark-processing`
  and its Stage 1).
- Until that wiring lands, the step is an exported, fully typed, standalone
  unit — compiled, linted, and smoke-testable against the hosted instance
  (see Validation Plan), but not yet called in production.

## Verified facts this plan is grounded on

1. **The PDF bytes are forwarded by the app (multipart).** The hosted
   instance is IBM DCLS (Docling SaaS); its documented usage is the file
   variant — `POST {base}/v1/convert/file/async` with a multipart form
   (`files=@…`) and an `X-Api-Key` header. So the client fetches the PDF
   from its public Vercel Blob URL (`access: "public"`,
   `src/features/estimate/components/estimate-view.tsx:104`) server-side
   and forwards the bytes as multipart form data. A side benefit: Docling
   never needs outbound access to the blob host, and a future switch to
   private/signed blobs only affects the app's own fetch.
   **URL-joining hazard:** the hosted base URL carries a tenant path
   segment (`https://api.aws-c1.dcls.saas.ibm.com/<tenant-id>`).
   `new URL('/v1/…', baseUrl)` would DISCARD that segment (absolute-path
   resolution replaces the whole path), so the client must join by string
   concatenation — this is called out in the client code.
2. **Docling Serve API** (verified against the docling-serve docs,
   `docs/usage.md`):
   - Async submit (file variant, per the hosted instance's own usage
     example): `POST {base}/v1/convert/file/async` with a multipart form —
     the PDF bytes in the `files` field, conversion options as sibling
     form fields (docling-serve's file endpoints take options as form
     fields rather than a JSON `options` object; exact field encoding is
     confirmable against the instance's live OpenAPI at `{base}/docs`
     during the smoke test). Returns `{ "task_id", "task_status":
     "pending" | "started" | "success" | "failure", "task_position" }`.
   - Poll: `GET /v1/status/poll/{task_id}` — same task envelope.
   - Fetch result: `GET /v1/result/{task_id}` — returns the convert
     response: `{ "document": { "md_content", "json_content", ... },
     "status": "success" | "partial_success" | "skipped" | "failure",
     "errors": [...], "processing_time": ... }`.
   - Options include `to_formats` (`"md"`, `"json"`, ...),
     `md_page_break_placeholder` (string inserted between pages in the
     markdown output — this is how we get page numbers), `table_mode`
     (`"fast" | "accurate"`), `do_ocr`, `image_export_mode`,
     `abort_on_error`, and `document_timeout` (float seconds, per-document).
   - Auth on a hosted instance: `X-Api-Key` header; sent on all calls.
3. **Live instance probe (2026-07-07, authoritative for THIS deployment).**
   The DCLS instance was probed directly with the real credentials:
   - Its own error response enumerates the full endpoint inventory:
     `/v1/convert/source/batch`, `/v1/convert/file/async`,
     `/v1/convert/source/async`, `/health`, `/v1/status/poll`,
     `/v1/result`. **No sync convert endpoint and no `/docs`/OpenAPI
     endpoint are exposed** — async is not just preferred, it is the only
     option, and API introspection is unavailable (see Risk Notes).
   - Auth verified: `/health` returns `401 missing_credentials` without
     `X-Api-Key` and `200 {"status":"ok"}` with it.
   - Path-parameter style verified: `GET /v1/status/poll/{task_id}` and
     `GET /v1/result/{task_id}` with an unknown id return
     `404 {"detail":"Task not found."}` — confirming the URL shapes the
     client uses.
   - `/health` is available for connectivity checks (used by the smoke
     test as its first assertion).
   - Published DCLS commercials are page-based (Resource Units: 1 RU =
     1,000 pages, ~$4 per 1,000 pages); no public per-file MB cap was
     found. Oversized uploads would surface as a typed 4xx from the
     client, handled gracefully.
3. **Chain contract:** `mark-processing` outputs
   `{ estimateRequestId, fileUrl, zipCode }` (`mark-processing.ts:21-25`)
   and `extract-items` consumes exactly that shape. `parse-document` mirrors
   it as input and passes all three through, so the architecture plan can
   slot it anywhere in that segment of the chain.

## Directory Map

```text
falcon-bighorn/
├── FEATURE(docling-serve-integration).md                 [CREATE] this plan
├── .env.example                                          [MODIFY] add DOCLING_SERVE_URL / DOCLING_SERVE_API_KEY
└── src/mastra/
    ├── services/                                         [CREATE dir] external non-LLM service clients
    │   └── docling/
    │       ├── docling-client.schema.ts                  [CREATE] Zod contracts + page-break constant
    │       └── docling-client.ts                         [CREATE] fetch client for hosted Docling Serve
    └── workflows/steps/
        └── parse-document.ts                             [CREATE] resilient Mastra step wrapping the client
```

No files are moved or deleted. No DB schema change. No new npm dependencies
(the client is plain `fetch`, available natively in the repo's Node runtime —
Next 16 / Node ≥ 20).

## Modification Table

| File | Action | Why |
|---|---|---|
| `src/mastra/services/docling/docling-client.schema.ts` | Create | Zod contracts for the Docling Serve response (validate only what we consume) and the app-facing `ParsedDocument` shape (pages + markdown). Mirrors the repo's `x.ts` + `x.schema.ts` convention used by both agents. |
| `src/mastra/services/docling/docling-client.ts` | Create | The transport: fetch the PDF bytes from blob storage, submit multipart to `{base}/v1/convert/file/async` (with `md_page_break_placeholder`), poll `{base}/v1/status/poll/{task_id}` until completion, fetch `{base}/v1/result/{task_id}`, validate, split pages deterministically, throw typed errors. Tenant-path-safe URL joining. |
| `src/mastra/workflows/steps/parse-document.ts` | Create | `createStep` wrapper following the repo's resilient-step pattern (`extract-items.ts`): non-throwing failure object, step-level `retries`, pass-through of the chain fields. |
| `.env.example` | Modify | Document the two new env vars next to the existing AI-provider section. |

## Existing Pattern Audit

- **`x.ts` + `x.schema.ts` module pairs** — `billable-item-extractor.ts` /
  `billable-item-extractor.schema.ts` and `item-pricer.ts` /
  `item-pricer.schema.ts`. The Docling client follows the same split.
- **New directory justification** — the repo has no existing home for
  external **non-LLM** HTTP clients: LLM calls go through the `@ai-sdk`
  gateway inside `agents/`, DB through `@/db`, and `workflows/lib/` holds
  step-local helpers (`classify-error.ts`). A Docling parser is none of
  those. `src/mastra/services/docling/` is introduced as the contained,
  documented location for this new category rather than silently overloading
  `agents/` or `workflows/lib/`. (The concurrent architecture whiteboard was
  briefed with this same location, so both plans converge on it.)
- **Resilient-step pattern** — `extract-items.ts`: Zod
  `inputSchema`/`outputSchema`, `retries: N`, outer try/catch that converts
  errors into a non-throwing `{ failed: true, errorMessage }` result the
  workflow can `.branch()` on. `parse-document.ts` copies this shape
  verbatim (field names `parseFailed` / `errorMessage`).
- **Env access** — agents read `process.env.KILO_API_KEY!` at module scope.
  The client instead reads env **at call time** and throws a typed
  configuration error when `DOCLING_SERVE_URL` is missing. This is a
  deliberate, documented deviation: a module-scope `!` assertion on a
  missing var silently passes `undefined` into the client and fails later
  with an opaque fetch error; the call-time check turns misconfiguration
  into a first-class, classifiable failure. It also keeps `import`ing the
  module side-effect-free.
- **Error classification** — `classify-error.ts` maps `statusCode`-carrying
  errors to user-facing strings, but its messages all say "AI service…",
  which would be misleading for a parser outage. `parse-document.ts`
  therefore supplies its own parse-specific messages instead of reusing
  `classifyError`; `classify-error.ts` is not modified.
- **Logging** — steps log one structured line per run
  (`[extraction-quality]` in `merge-items.ts`, `[pricing-quality]` in
  `price-items.ts`). `parse-document` logs `[parse-quality]` with the same
  shape discipline.

## Execution Plan

1. `src/mastra/services/docling/docling-client.schema.ts` — contracts first
   (everything else imports from it).
2. `src/mastra/services/docling/docling-client.ts` — the client.
3. `src/mastra/workflows/steps/parse-document.ts` — the step.
4. `.env.example` — document the vars.
5. Validation gates + standalone smoke test (below), then stop for review.

## File-by-File Changes

### 1. `src/mastra/services/docling/docling-client.schema.ts`

**Action:** Create
**Why:** Single source of truth for (a) what we accept from Docling Serve and
(b) what the rest of the app sees (`ParsedDocument`). Downstream consumers
(the Stage-1 extractor in the architecture plan) import `parsedDocumentSchema`
from here, never the raw Docling response shape.
**Impact:** New module; no existing code affected.

#### Before

*(new file)*

#### After

```ts
import { z } from 'zod';

/**
 * Contracts for the hosted Docling Serve integration.
 *
 * Two layers, deliberately separate:
 *
 *   1. `doclingConvertResponseSchema` — the WIRE shape. Validates only the
 *      fields this app consumes from `POST /v1/convert/source`; unknown
 *      fields are stripped by Zod, so Docling Serve upgrades that ADD
 *      response fields cannot break us.
 *   2. `parsedDocumentSchema` — the APP shape. Everything downstream of the
 *      client (workflow steps, the Stage-1 extractor) consumes this and
 *      never sees Docling's field names, so a future parser swap only
 *      rewrites the client, not its consumers.
 */

/**
 * Injected between pages via the `md_page_break_placeholder` convert option,
 * then split on by the client to recover page numbers. An HTML comment
 * cannot occur in Docling's own markdown output for PDF sources, so the
 * split is unambiguous.
 */
export const PAGE_BREAK_PLACEHOLDER = '<!-- docling-page-break -->' as const;

/**
 * Task envelope returned by `POST {base}/v1/convert/file/async` and
 * `GET {base}/v1/status/poll/{task_id}`. The client polls until
 * `task_status` leaves the pending/started states.
 */
export const doclingTaskSchema = z.object({
  task_id: z.string().min(1),
  task_status: z.enum(['pending', 'started', 'success', 'failure']),
});

export type DoclingTask = z.infer<typeof doclingTaskSchema>;

/**
 * Wire shape of `GET /v1/result/{task_id}` (identical to the sync convert
 * response). `md_content` is null when "md" was not among the requested
 * `to_formats` — the client always requests it, so null is treated as a
 * malformed response.
 */
export const doclingConvertResponseSchema = z.object({
  status: z.enum(['success', 'partial_success', 'skipped', 'failure']),
  document: z.object({
    md_content: z.string().nullable(),
  }),
  errors: z.array(z.unknown()).default([]),
  processing_time: z.number().optional(),
});

export type DoclingConvertResponse = z.infer<typeof doclingConvertResponseSchema>;

export const parsedPageSchema = z.object({
  /** 1-indexed physical page number, from the page-break split order. */
  pageNo: z.number().int().min(1),
  /** Markdown content of that page (tables preserved by Docling). */
  markdown: z.string(),
});

export const parsedDocumentSchema = z.object({
  pages: z.array(parsedPageSchema),
  /** Full-document markdown with the placeholders removed. */
  markdown: z.string(),
  /**
   * True when Docling reported `partial_success` — some pages or elements
   * failed to convert but usable content came back. Consumers decide
   * whether partial content is acceptable for their stage.
   */
  partial: z.boolean(),
});

export type ParsedDocument = z.infer<typeof parsedDocumentSchema>;
```

#### Reasoning

- Only `md_content` is requested and validated. The lossless
  `json_content` (full DoclingDocument) is deliberately **not** requested in
  v1: page numbers come from the placeholder split, tables survive in
  markdown, and the JSON payload for a 60-page inspection report is large.
  If a future stage needs bounding boxes or table cell structure, extending
  `to_formats` is a one-line client change.
- Wire/app shape separation is what lets the concurrent architecture plan
  reference `ParsedDocument` without coupling to Docling.

---

### 2. `src/mastra/services/docling/docling-client.ts`

**Action:** Create
**Why:** The transport itself. One exported entry point
(`parseDocumentFromUrl`), one exported pure helper
(`splitPagesFromMarkdown`, exported for the smoke test and future reuse),
and one typed error class carrying `statusCode`.
**Impact:** New module; consumed only by `parse-document.ts` for now.

#### Before

*(new file)*

#### After

```ts
import {
  PAGE_BREAK_PLACEHOLDER,
  doclingConvertResponseSchema,
  doclingTaskSchema,
  type ParsedDocument,
} from './docling-client.schema';

/**
 * HTTP client for a HOSTED Docling Serve instance.
 *
 * Transport decisions (see FEATURE(docling-serve-integration).md):
 *   - The app fetches the PDF from its public Vercel Blob URL and forwards
 *     the bytes as multipart form data — the hosted instance (IBM DCLS)
 *     documents the file variant (`files=@…`) as its usage shape, and this
 *     keeps Docling from needing outbound access to the blob host.
 *   - Async task flow: submit (`POST {base}/v1/convert/file/async`) → poll
 *     (`GET {base}/v1/status/poll/{task_id}`) → fetch
 *     (`GET {base}/v1/result/{task_id}`). A large scanned report under OCR
 *     can convert for minutes; polling keeps every individual HTTP call
 *     short instead of holding one request open for the whole job.
 *   - URL joining is string concatenation, NEVER `new URL(path, base)`:
 *     the hosted base URL carries a tenant path segment
 *     (https://…/{tenant-id}) that absolute-path resolution would discard.
 *   - Env is read at CALL time, not module scope, so importing this module
 *     has no side effects and a missing DOCLING_SERVE_URL surfaces as a
 *     typed, classifiable error instead of an opaque fetch failure.
 */

/** Per-document processing budget enforced by Docling Serve itself. */
const DOCUMENT_TIMEOUT_SECONDS = 300;

/** Timeout for small HTTP calls (poll / result). */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Timeout for calls that move the PDF itself (blob fetch, multipart
 * submit). Deliberately larger than REQUEST_TIMEOUT_MS: a large scanned
 * report is tens of MB and the submit call carries all of it.
 */
const UPLOAD_TIMEOUT_MS = 120_000;

/** Delay between status polls. */
const POLL_INTERVAL_MS = 3_000;

/** Overall submit→result deadline; slightly above the server-side budget. */
const OVERALL_DEADLINE_MS = 330_000;

export class DoclingServeError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'DoclingServeError';
    this.statusCode = statusCode;
  }
}

/**
 * Join a path onto the configured base URL. Plain concatenation on
 * purpose: the hosted base URL includes a tenant path segment
 * (https://…/{tenant-id}), which `new URL(path, base)` would discard.
 */
function doclingUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path}`;
}

/**
 * One authenticated call against the hosted instance. Sends multipart form
 * data when `form` is given (content-type left to fetch so the boundary is
 * set correctly), plain GET otherwise. Wraps transport failures and non-2xx
 * responses in `DoclingServeError` (carrying the HTTP status so the calling
 * step can classify 401/403/429/5xx).
 */
async function doclingFetch(
  baseUrl: string,
  path: string,
  init?: { method?: 'GET' | 'POST'; form?: FormData },
): Promise<unknown> {
  const apiKey = process.env.DOCLING_SERVE_API_KEY;
  let res: Response;
  try {
    res = await fetch(doclingUrl(baseUrl, path), {
      method: init?.method ?? 'GET',
      // X-Api-Key gates the hosted instance; a keyless (network-restricted)
      // instance simply omits the header.
      headers: apiKey ? { 'x-api-key': apiKey } : {},
      body: init?.form,
      // Multipart submits carry the whole PDF; give them the upload budget.
      signal: AbortSignal.timeout(init?.form ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    // Network failure / DNS / per-call timeout.
    const detail = e instanceof Error ? e.message : String(e);
    throw new DoclingServeError(`Docling Serve request failed: ${detail}`);
  }
  if (!res.ok) {
    throw new DoclingServeError(
      `Docling Serve responded ${res.status} ${res.statusText} on ${path}`,
      res.status,
    );
  }
  return res.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch the PDF from its blob URL, submit the bytes to the hosted Docling
 * Serve instance, poll until the conversion task completes, fetch the
 * result, and return the parsed, page-split markdown. Throws
 * `DoclingServeError` on any transport, auth, conversion, contract, or
 * deadline failure — the calling step decides whether that is fatal for
 * the run.
 */
export async function parseDocumentFromUrl(fileUrl: string): Promise<ParsedDocument> {
  const baseUrl = process.env.DOCLING_SERVE_URL;
  if (!baseUrl) {
    throw new DoclingServeError(
      'DOCLING_SERVE_URL is not configured; cannot parse documents.',
    );
  }

  // 1. Fetch the PDF bytes from blob storage (public URL, server-side).
  let pdf: Blob;
  try {
    const pdfRes = await fetch(fileUrl, {
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (!pdfRes.ok) {
      throw new DoclingServeError(
        `Could not fetch source PDF from blob storage: ${pdfRes.status} ${pdfRes.statusText}`,
        pdfRes.status,
      );
    }
    pdf = await pdfRes.blob();
  } catch (e) {
    if (e instanceof DoclingServeError) throw e;
    const detail = e instanceof Error ? e.message : String(e);
    throw new DoclingServeError(`Could not fetch source PDF from blob storage: ${detail}`);
  }

  // 2. Submit as multipart form data. Options ride as sibling form fields
  // (the file endpoints take them as form fields, not a JSON `options`
  // object — field encoding confirmable at {base}/docs).
  const form = new FormData();
  form.append('files', pdf, 'report.pdf');
  form.append('to_formats', 'md');
  form.append('image_export_mode', 'placeholder');
  form.append('do_ocr', 'true');
  form.append('table_mode', 'accurate');
  form.append('abort_on_error', 'false');
  form.append('md_page_break_placeholder', PAGE_BREAK_PLACEHOLDER);
  form.append('document_timeout', String(DOCUMENT_TIMEOUT_SECONDS));

  const submitted = doclingTaskSchema.safeParse(
    await doclingFetch(baseUrl, 'v1/convert/file/async', {
      method: 'POST',
      form,
    }),
  );
  if (!submitted.success) {
    throw new DoclingServeError(
      'Docling Serve returned an async submission that does not match the expected task contract.',
    );
  }

  // 3. Poll until the task leaves pending/started, or the deadline passes.
  const deadline = Date.now() + OVERALL_DEADLINE_MS;
  let taskStatus = submitted.data.task_status;
  while (taskStatus === 'pending' || taskStatus === 'started') {
    if (Date.now() >= deadline) {
      throw new DoclingServeError(
        `Docling conversion did not complete within ${OVERALL_DEADLINE_MS / 1000}s.`,
      );
    }
    await sleep(POLL_INTERVAL_MS);
    const polled = doclingTaskSchema.safeParse(
      await doclingFetch(baseUrl, `v1/status/poll/${submitted.data.task_id}`),
    );
    if (!polled.success) {
      throw new DoclingServeError(
        'Docling Serve returned a poll response that does not match the expected task contract.',
      );
    }
    taskStatus = polled.data.task_status;
  }
  if (taskStatus === 'failure') {
    throw new DoclingServeError('Docling conversion task ended in failure.');
  }

  // 4. Fetch the result.
  const parsed = doclingConvertResponseSchema.safeParse(
    await doclingFetch(baseUrl, `v1/result/${submitted.data.task_id}`),
  );
  if (!parsed.success) {
    throw new DoclingServeError(
      'Docling Serve returned a result that does not match the expected contract.',
    );
  }

  const { status, document } = parsed.data;
  if (status === 'failure' || status === 'skipped') {
    throw new DoclingServeError(`Docling conversion ended with status "${status}".`);
  }
  if (document.md_content === null || document.md_content.trim().length === 0) {
    throw new DoclingServeError(
      'Docling conversion succeeded but returned no markdown content.',
    );
  }

  return splitPagesFromMarkdown(document.md_content, status === 'partial_success');
}

/**
 * Recover page numbers from the placeholder-delimited markdown. Pure and
 * exported so it can be exercised without a live Docling instance.
 *
 * Page numbering is positional (1-indexed split order), which equals the
 * physical page number because Docling emits pages in order and inserts
 * exactly one placeholder between consecutive pages.
 */
export function splitPagesFromMarkdown(
  markdown: string,
  partial: boolean,
): ParsedDocument {
  const pages = markdown
    .split(PAGE_BREAK_PLACEHOLDER)
    .map((chunk, i) => ({ pageNo: i + 1, markdown: chunk.trim() }));

  return {
    pages,
    markdown: pages.map((p) => p.markdown).join('\n\n'),
    partial,
  };
}
```

#### Reasoning

- `table_mode: 'accurate'` over `'fast'`: inspection reports carry
  moisture/electrical reading tables, and accuracy is the stated goal of
  this whole initiative; latency is absorbed by the async workflow.
- `abort_on_error: false` + surfacing `partial_success` as `partial: true`
  (instead of failing) preserves recall: a report where one page's OCR
  chokes should still yield the other pages' items. The consuming stage —
  not the transport — decides whether partial content is acceptable.
- `DoclingServeError.statusCode` mirrors the error shape
  `classify-error.ts` sniffs (`statusCode`), keeping the door open for
  shared classification later without importing it now (its "AI service"
  wording doesn't fit a parser).
- Keeping empty pages (not filtering them) preserves the positional
  `pageNo` mapping — filtering would silently shift page numbers on
  reports with blank/image-only pages.

---

### 3. `src/mastra/workflows/steps/parse-document.ts`

**Action:** Create
**Why:** Workflow-facing wrapper following the `extract-items.ts` resilient
pattern exactly: Zod in/out schemas, `retries`, non-throwing failure object,
pass-through of the chain fields (`estimateRequestId`, `fileUrl`, `zipCode`).
**Impact:** New exported step. **Not wired into `summarize-estimate.ts` by
this plan** — that single `.then(parseDocumentStep)` line belongs to
`FEATURE(extraction-recall-precision-split).md` (see Coordination contract).

#### Before

*(new file)*

#### After

```ts
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  parseDocumentFromUrl,
  DoclingServeError,
} from '@/mastra/services/docling/docling-client';
import { parsedDocumentSchema } from '@/mastra/services/docling/docling-client.schema';

/**
 * Stage 0 — Deterministic document parsing via hosted Docling Serve.
 *
 * Converts the uploaded inspection PDF (public blob URL) into page-split
 * markdown BEFORE any LLM sees it, so downstream extraction reasons over
 * clean text + intact tables instead of raw PDF bytes.
 *
 * Resilient-step pattern (same as extract-items.ts): failures come back as
 * `parseFailed: true` with a user-facing `errorMessage` instead of throwing,
 * so the workflow can `.branch()` on them. `retries: 2` covers transient
 * network/5xx throws inside Mastra's step retry budget.
 *
 * Input mirrors `mark-processing`'s output — the established chain contract
 * `{ estimateRequestId, fileUrl, zipCode }` — and passes all three through.
 * Wiring this step into `summarize-estimate.ts` is owned by
 * FEATURE(extraction-recall-precision-split).md, not this module.
 */
export const parseDocumentStep = createStep({
  id: 'parse-document',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
    parsedDocument: parsedDocumentSchema.nullable(),
    parseFailed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  retries: 2,
  execute: async ({ inputData, mastra }) => {
    const log = mastra.getLogger();
    try {
      const parsedDocument = await parseDocumentFromUrl(inputData.fileUrl);

      log.info('[parse-quality]', {
        estimateRequestId: inputData.estimateRequestId,
        pageCount: parsedDocument.pages.length,
        markdownChars: parsedDocument.markdown.length,
        partial: parsedDocument.partial,
      });

      // Inspection reports are never one page. A single-page result means
      // the deployed instance ignored md_page_break_placeholder — parsing
      // still succeeded, but page attribution (pageHint grounding) is
      // degraded. Warn loudly so it shows up in observability instead of
      // silently shipping wrong page numbers.
      if (parsedDocument.pages.length === 1) {
        log.warn('[parse-quality] single-page result — page-break placeholder likely not honored', {
          estimateRequestId: inputData.estimateRequestId,
        });
      }

      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        zipCode: inputData.zipCode,
        parsedDocument,
        parseFailed: false,
        errorMessage: null,
      };
    } catch (e) {
      log.error('[parse-document] failed', {
        estimateRequestId: inputData.estimateRequestId,
        error: e instanceof Error ? e.message : String(e),
      });
      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        zipCode: inputData.zipCode,
        parsedDocument: null,
        parseFailed: true,
        errorMessage: classifyParseError(e),
      };
    }
  },
});

/**
 * Parser-specific user-facing messages. classify-error.ts is deliberately
 * NOT reused: its strings all say "AI service …", which would mislabel a
 * document-parser outage in the UI.
 */
function classifyParseError(e: unknown): string {
  if (e instanceof DoclingServeError) {
    const status = e.statusCode;
    if (status === 401 || status === 403) {
      return 'Document parser authentication failed. Please retry.';
    }
    if (status === 429) {
      return 'Document parser is rate-limited. Please retry shortly.';
    }
    if (status && status >= 500) {
      return 'Document parser is temporarily unavailable. Please retry.';
    }
    return 'Document could not be parsed. Please retry.';
  }
  return 'Document parsing failed. Please retry.';
}
```

#### Reasoning

- Output deliberately includes the full pass-through triple so the
  architecture plan can insert this step without adapter glue, and
  `parseFailed` follows the `failed`/`auditFailed` boolean-flag naming
  already used for branching.
- What the consuming pipeline does on `parseFailed: true` (fall back to
  raw-PDF extraction vs. persist-failure) is a pipeline decision that
  belongs to the architecture whiteboard; this step only guarantees an
  honest, non-throwing signal.

---

### 4. `.env.example`

**Action:** Modify
**Why:** Document the two new vars where every other integration documents
its config.
**Impact:** Example file only; deployers add real values to `.env.local` /
hosting env.

#### Before

```bash
# AI Provider (Kilo Gateway)
KILO_API_KEY=your-kilo-api-key
```

#### After

```bash
# AI Provider (Kilo Gateway)
KILO_API_KEY=your-kilo-api-key

# Docling Serve (hosted document parser — IBM DCLS)
# Base URL INCLUDING the tenant path segment,
# e.g. https://api.aws-c1.dcls.saas.ibm.com/<tenant-id>
DOCLING_SERVE_URL=your-docling-serve-base-url-with-tenant-path
# X-Api-Key for the hosted instance (required by DCLS)
DOCLING_SERVE_API_KEY=your-docling-serve-api-key
```

#### Reasoning

- Two vars, mirroring how the instance itself is configured
  (`DOCLING_SERVE_API_KEY` is the server-side toggle's exact name, reused
  client-side for symmetry).

## Validation Plan

Per `AGENTS.md` (project `pnpm lint` is broken under Next 16 and is not the
gate):

1. `pnpm exec tsc --noEmit` — clean.
2. `pnpm exec eslint src/mastra/services/docling/docling-client.schema.ts src/mastra/services/docling/docling-client.ts src/mastra/workflows/steps/parse-document.ts` — clean.
3. **Pure-logic check (no live instance needed):** exercise
   `splitPagesFromMarkdown` with a placeholder-delimited fixture via
   `node_modules/.bin/tsx` — asserts 1-indexed page numbering, blank-page
   preservation, and placeholder removal from the joined markdown.
4. **Live smoke test (credentials already in `.env.local`; needs one real
   blob URL or local PDF):** a short `tsx` script in the session scratchpad
   that loads `DOCLING_SERVE_URL`/`DOCLING_SERVE_API_KEY` from `.env.local`,
   first asserts `GET /health` returns `{"status":"ok"}` (connectivity +
   auth), then calls `parseDocumentFromUrl(<real estimate blob URL>)`, and prints
   `pageCount`, `partial`, and the first 500 chars of page 1 — verifying
   auth on all three endpoints, the full submit → poll → result loop
   against the deployed Docling version, the placeholder option's
   behavior, and that inspection-report tables survive as markdown.
5. No dev-server QA yet: the step is unreachable from the UI until the
   architecture plan wires it in (by design — see Coordination contract).

## Risk Notes

- **Hosting is out of scope and already provisioned.** The instance is IBM
  DCLS (Docling SaaS); no containerization or deploy config is needed in
  this repo. Local credentials are in the gitignored `.env.local`; the same
  two vars must be added to the production hosting environment (e.g.
  Vercel project env) before this ships — that is the only remaining
  deployment task, and it is configuration, not code.
- **Secret hygiene.** `DOCLING_SERVE_API_KEY` lives only in `.env.local`
  (gitignored) and the hosting env — never in `.env.example`, never in any
  committed file.
- **Polling deadline vs. platform budget.** Each individual HTTP call is
  short (30s cap), but `parseDocumentFromUrl` as a whole awaits up to 330s
  across the poll loop. If the Mastra workflow executes inside a
  platform-limited serverless function whose budget is shorter than a
  worst-case conversion, the deadline constant must be tuned down (or the
  workflow moved to a longer-lived runtime) — the constants live at the top
  of `docling-client.ts` and nowhere else. A queued instance under load
  also spends part of the deadline in `pending` (`task_position` is
  available on the task envelope if queue-depth logging is ever wanted).
- **Result retention.** The result is fetched immediately after the task
  reports success; if a hosted instance evicts results aggressively, the
  single-flow shape here (submit → poll → fetch in one function call) is
  the safest possible consumer since no task_id is persisted or resumed
  across process boundaries.
- **`md_page_break_placeholder` is version-sensitive.** The option exists in
  current docling-serve docs, but the deployed DCLS version must support
  it — if it doesn't, every document comes back as one page (placeholder
  never inserted). Because a real inspection report is never one page,
  `pageCount === 1` is treated as a standing invariant violation: the
  `parse-document` step logs a loud warning on every such run (not just at
  smoke-test time), and the smoke test asserts `pageCount > 1` up front.
- **DCLS hard limits are not publicly documented.** The API shape is now
  verified two ways: the open-source docling-serve docs AND a live probe
  of the deployed instance (endpoint inventory, auth behavior, poll/result
  path style — see Verified Facts #3). What remains unpublished anywhere
  findable (docling.ai blog, IBM product/announcement pages, service-client
  examples) is a per-file MB cap, per-document page cap, task retention
  window, or rate limit — IBM documents only page-based Resource Unit
  pricing. Reports run 10+ MB; the 120s upload budget covers that with
  wide margin, and a server-side size rejection surfaces as a typed 4xx
  with a clean `parseFailed` result rather than a crash. The first smoke
  test with a real 10+ MB report is the definitive check.
- **Blob access.** The app fetches the PDF bytes itself and forwards them
  multipart, so the Docling host never contacts blob storage. If blobs ever
  move to signed/private access, only the client's own `fetch(fileUrl)`
  needs the signed URL — this client is the single place that change lands.
- **Multipart option encoding.** docling-serve's file endpoints take
  conversion options as form fields rather than a JSON `options` object.
  The deployed DCLS instance exposes **no** `/docs` or `/openapi.json`
  (verified by live probe), so the accepted field names cannot be
  introspected — the live smoke test is the only confirmation mechanism.
  If a field is rejected or ignored (most importantly
  `md_page_break_placeholder`), the smoke test's `pageCount > 1` assertion
  and the step's standing single-page warning catch it immediately. If the
  file endpoint turns out not to accept option form fields at all, the
  fallback is `POST /v1/convert/source/async` (verified present on this
  instance), which takes a JSON `options` object with the blob URL — a
  contained client-only change behind the same `parseDocumentFromUrl`
  signature.
- **Merge coordination.** This plan and
  `FEATURE(extraction-recall-precision-split).md` share zero files by
  construction; the only ordering requirement is that this plan's files
  exist before the architecture plan's wiring line is implemented.

## Approval

`Status: Awaiting explicit user approval. Do not implement yet.`
