/**
 * Renders a completed `summarize-estimate` workflow run as a static HTML
 * file, using the same display-formatting logic (`format.ts`) the real
 * production report uses — without importing React, Next.js, or any of
 * their build tooling.
 *
 * This is a plain `tsx`-run script, not a Next.js route: it substitutes
 * data into `render-run.template.html` (hand-written HTML/CSS, no
 * Tailwind) via simple string replacement. The grouping-by-trade logic is
 * reimplemented here directly (it's ~10 lines, not worth pulling in
 * `ItemsSection` for), but the actual formatting rules that carry real,
 * evolving business logic — acronym title-casing, trade labels, currency
 * formatting — are imported from the real `format.ts` module so this view
 * can't silently drift from what production actually renders. `format.ts`
 * has exactly one import (`import type { Trade } from '.../classification'`)
 * and it is a type-only import, erased at compile time — verified directly
 * — so pulling in `format.ts` cannot chain into the pipeline bootstrap.
 *
 * Usage:
 *   pnpm exec tsx eval/render-run.ts              # renders the most
 *                                                  # recent successful
 *                                                  # "summarize-estimate"
 *                                                  # run found in storage
 *   pnpm exec tsx eval/render-run.ts <runId>       # renders one specific
 *                                                  # run by id
 *
 * This script never starts a new pipeline run, and it deliberately never
 * imports `estimate-extraction-pipeline/index.ts` or constructs a `Mastra`
 * app instance — that file registers every agent and workflow and (in its
 * current, uncommitted state) does `await new DuckDBStore()...` at module
 * top level, which fails to load under a plain `tsx`-run script (top-level
 * await has no valid CommonJS representation, and this project's root
 * `package.json` has no `"type": "module"` to make Node/tsx treat it as
 * ESM). None of that is needed here anyway — this script only reads
 * already-persisted rows out of `mastra.db`.
 *
 * It does that via `@mastra/libsql`'s own `LibSQLStore` (already a direct
 * dependency in this repo's package.json), constructed standalone —
 * exactly the pattern documented in that class's own JSDoc example
 * (`new LibSQLStore({ id, url }); const workflows = await
 * storage.getStore('workflows')`). This is the closest available thing to
 * "a raw SQLite/LibSQL client already installed": the actual SQL client,
 * `@libsql/client`, is only a *transitive* dependency of `@mastra/libsql`
 * — under this repo's pnpm layout it is not hoisted to the project root
 * (verified: `node -e "require.resolve('@libsql/client')"` from the repo
 * root fails with MODULE_NOT_FOUND), so importing it directly here would
 * require adding it as a new direct dependency, which is out of scope.
 * `LibSQLStore` avoids that: it's already resolvable, and its
 * `getStore('workflows')` domain object exposes `listWorkflowRuns()` /
 * `getWorkflowRunById()`, which run the exact same
 * `SELECT ... ORDER BY createdAt DESC` query against
 * `mastra_workflow_snapshot` that a hand-rolled raw query would (verified
 * by reading `node_modules/@mastra/libsql/dist/index.js`) — just through
 * the package's own typed, exported API instead of a hand-rolled SQL
 * string coupled to an internal table name. The persisted `snapshot`
 * column already deserializes to an object with top-level `status` and
 * `result` fields (`@mastra/core`'s `WorkflowRunState` type), so no
 * additional derivation is needed to reach `{ lines: EnrichedLine[] }`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LibSQLStore } from '@mastra/libsql';
import type { EnrichedLine } from '@/features/estimate-extraction-pipeline/enrichment';
import type { Trade } from '@/features/estimate-extraction-pipeline/classification';
import {
  formatCostType,
  formatCurrency,
  formatItemTitle,
  formatLocation,
  formatTradeLabel,
  formatUnit,
} from '@/features/estimate/lib/format';

const WORKFLOW_NAME = 'summarize-estimate';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
// `mastra dev --dir src/features/estimate-extraction-pipeline` resolves the
// storage config's relative `file:./mastra.db` from THAT directory, not the
// repo root — the actual live db lives in that dir's own `public/`
// subdirectory (same place `mastra.duckdb` lives). A `mastra.db` also exists
// at the repo root, but it's a stale, disconnected file nothing writes to.
const DB_URL = `file:${join(REPO_ROOT, 'src/features/estimate-extraction-pipeline/public/mastra.db')}`;
const TEMPLATE_PATH = join(__dirname, 'render-run.template.html');
const OUT_DIR = join(__dirname, 'out');

/** The subset of the persisted `snapshot` column (`@mastra/core`'s
 * `WorkflowRunState`) this script actually needs. Declared locally rather
 * than imported from `@mastra/core` to keep this script's only coupling
 * to the pipeline's own types down to the two small `import type`s below
 * (`EnrichedLine`, `Trade`) — both erased at compile time. */
interface PersistedWorkflowRunState {
  status: string;
  result?: Record<string, unknown>;
}

interface TradeGroup {
  trade: Trade;
  lines: EnrichedLine[];
  groupSubtotal: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Same grouping `ItemsSection` does, reimplemented directly — plain data
 * shaping, no reason to import a `'use client'` component for it. */
function groupByTrade(lines: EnrichedLine[]): TradeGroup[] {
  const byTrade = new Map<Trade, EnrichedLine[]>();
  for (const line of lines) {
    const existing = byTrade.get(line.trade);
    if (existing) existing.push(line);
    else byTrade.set(line.trade, [line]);
  }
  return Array.from(byTrade, ([trade, groupLines]) => ({
    trade,
    lines: groupLines,
    groupSubtotal: groupLines.reduce((sum, line) => sum + line.quantity * line.rate, 0),
  }));
}

/**
 * `formatTradeLabel`'s switch is exhaustive over the *current* `TRADE`
 * enum and has no `default` — for a value outside that set it returns
 * `undefined` at runtime despite its `string` return type. That's a real
 * case here, not a hypothetical: `classification/schema.ts`'s own doc
 * comment records that the current 12-value taxonomy replaced an older
 * 23-value one, and this repo's `mastra.db` still has runs persisted
 * under that older taxonomy (e.g. `trade: "siding"`, `"masonry"`,
 * `"carpentry"` — verified directly by querying a real persisted row).
 * A tool whose whole job is rendering arbitrary past runs should degrade
 * to the raw string for stale data instead of throwing.
 */
function safeTradeLabel(trade: Trade): string {
  return formatTradeLabel(trade) ?? trade;
}

/**
 * Same reasoning as `safeTradeLabel` — `mastra.db` has runs persisted
 * under an older schema that called this field `sourceQuote` (and had an
 * extra `action` field) before it was renamed to `descriptionQuote`
 * (verified directly by querying a real persisted row from 2026-07-21).
 * Falls back to the old field name so stale data still renders its real
 * content instead of going blank, and finally to an empty string rather
 * than crashing `escapeHtml()` on `undefined`.
 */
function safeDescriptionQuote(line: EnrichedLine): string {
  if (line.descriptionQuote) return line.descriptionQuote;
  const legacy = (line as unknown as { sourceQuote?: string }).sourceQuote;
  return legacy ?? '';
}

function renderRow(line: EnrichedLine): string {
  return `
      <div class="item-row">
        <div>
          <div class="item-title">${escapeHtml(formatItemTitle(line.scope))}</div>
          <div class="item-location">${escapeHtml(formatLocation(line.location))}</div>
          <div class="item-quote">"${escapeHtml(safeDescriptionQuote(line))}"</div>
          <div class="item-evidence">
            <span class="badge-outline">${escapeHtml(line.confidence)}</span>
            <span>source: ${escapeHtml(line.source)}</span>
          </div>
        </div>
        <div><span class="pill">${escapeHtml(formatCostType(line.costType))}</span></div>
        <div class="item-qty">
          <span class="qty-num">${line.quantity}</span>
          <span class="unit-chip">${escapeHtml(formatUnit(line.unit))}</span>
        </div>
        <div class="item-total">${escapeHtml(formatCurrency(line.quantity * line.rate))}</div>
      </div>`;
}

function renderGroup(group: TradeGroup): string {
  return `
    <section class="trade-group">
      <header class="trade-header">
        <div class="trade-header-left">
          <span>${escapeHtml(safeTradeLabel(group.trade))}</span>
          <span class="count-chip">${group.lines.length} Items</span>
        </div>
        <div>Group Subtotal: ${escapeHtml(formatCurrency(group.groupSubtotal))}</div>
      </header>
      <div class="col-headers">
        <div class="col-item">Item</div>
        <div class="col-type">Type</div>
        <div class="col-qty">Qty</div>
        <div class="col-total">Client Total</div>
      </div>
      <div>${group.lines.map(renderRow).join('')}
      </div>
    </section>`;
}

function substitute(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!(key in values)) throw new Error(`Missing template value for placeholder {{${key}}}`);
    return values[key];
  });
}

/** Narrow, structural runtime check — not a full zod re-validation. This
 * script only needs to know it received the shape `pipeline.ts`'s
 * `summarizeEstimateWorkflow` declares as its `outputSchema`
 * (`enrichmentStep.outputSchema`, i.e. `{ lines: EnrichedLine[] }`) before
 * indexing into it. */
function asEnrichedLines(result: Record<string, unknown> | undefined): EnrichedLine[] {
  if (!result || !Array.isArray(result.lines)) {
    throw new Error(
      'Run result did not have the expected shape "{ lines: EnrichedLine[] }". ' +
        'The workflow output schema may have changed since this script was written.',
    );
  }
  return result.lines as EnrichedLine[];
}

function parseSnapshot(snapshot: unknown): PersistedWorkflowRunState {
  const parsed = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
  if (!parsed || typeof parsed !== 'object' || typeof (parsed as { status?: unknown }).status !== 'string') {
    throw new Error('Persisted workflow snapshot did not have the expected shape (missing "status").');
  }
  return parsed as PersistedWorkflowRunState;
}

interface ResolvedRun {
  runId: string;
  createdAt: Date;
  state: PersistedWorkflowRunState;
}

/** Storage-only fetch: no `Mastra` app, no agents, no workflows registered
 * — a standalone `LibSQLStore` reading the same `mastra.db` file, exactly
 * per the class's own documented usage pattern. */
async function fetchRun(explicitRunId: string | undefined): Promise<ResolvedRun> {
  const storage = new LibSQLStore({ id: 'eval-render-run', url: DB_URL });
  try {
    const workflows = await storage.getStore('workflows');
    if (!workflows) {
      throw new Error('LibSQLStore did not provide a "workflows" domain store.');
    }

    if (explicitRunId) {
      const run = await workflows.getWorkflowRunById({ runId: explicitRunId, workflowName: WORKFLOW_NAME });
      if (!run) {
        throw new Error(`No run found for id "${explicitRunId}" on workflow "${WORKFLOW_NAME}".`);
      }
      return { runId: run.runId, createdAt: run.createdAt, state: parseSnapshot(run.snapshot) };
    }

    const { runs } = await workflows.listWorkflowRuns({ workflowName: WORKFLOW_NAME, status: 'success' });
    if (runs.length === 0) {
      throw new Error(
        `No successful "${WORKFLOW_NAME}" runs found in ${DB_URL}. Run the pipeline at least once ` +
          '(e.g. via "mastra dev" Studio) before rendering, or pass a runId explicitly: ' +
          'pnpm exec tsx eval/render-run.ts <runId>',
      );
    }
    // Defensive re-sort: the LibSQL adapter's own query is already
    // `ORDER BY createdAt DESC` (verified in `@mastra/libsql/dist/index.js`),
    // so this is a cheap double-check rather than something load-bearing.
    const sorted = [...runs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const latest = sorted[0]!;
    return { runId: latest.runId, createdAt: latest.createdAt, state: parseSnapshot(latest.snapshot) };
  } finally {
    await storage.close();
  }
}

async function main() {
  const explicitRunId = process.argv[2];
  const { runId, createdAt, state } = await fetchRun(explicitRunId);

  if (state.status !== 'success') {
    throw new Error(`Run "${runId}" is not a completed success (status: ${state.status}).`);
  }

  const lines = asEnrichedLines(state.result);
  const groups = groupByTrade(lines);
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.rate, 0);

  const template = readFileSync(TEMPLATE_PATH, 'utf-8');
  const html = substitute(template, {
    RUN_ID: escapeHtml(runId),
    WORKFLOW_NAME: escapeHtml(WORKFLOW_NAME),
    RUN_STATUS: escapeHtml(state.status),
    RUN_CREATED_AT: escapeHtml(createdAt.toISOString()),
    GENERATED_AT: escapeHtml(new Date().toISOString()),
    LINE_COUNT: String(lines.length),
    SUBTOTAL: escapeHtml(formatCurrency(subtotal)),
    // This script only reads workflow-run output (`mastra.db`), not the
    // `estimate_requests` DB row — it has no real filename/property/party
    // data to show. Per direction: use the run's own real id/date where
    // available (same derivation `estimate-report.tsx`'s `ReportHeader`
    // uses: `row.id.slice(0, 8)`, `toLocaleDateString('en-US', { year:
    // 'numeric', month: 'long', day: 'numeric' })`), and clearly-labeled
    // placeholder text elsewhere — this tool's job is validating layout
    // and real billable-item data, not fabricating fake property/party
    // records as if they were real.
    ESTIMATE_FILE_NAME: '(placeholder) inspection-report.pdf',
    ESTIMATE_SHORT_ID: escapeHtml(runId.slice(0, 8)),
    ESTIMATE_CREATED_DATE: escapeHtml(
      createdAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    ),
    PROPERTY_ADDRESS: '(placeholder) 123 Example Street',
    PROPERTY_ZIP: '00000',
    PROPERTY_TIMEFRAME: '(placeholder)',
    SUBMITTER_ROLE: '(placeholder)',
    LISTING_AGENT_NAME: '(placeholder)',
    LISTING_AGENT_PHONE: '(placeholder)',
    LISTING_AGENT_EMAIL: '(placeholder)',
    BUYER_AGENT_NAME: '(placeholder)',
    BUYER_AGENT_PHONE: '(placeholder)',
    BUYER_AGENT_EMAIL: '(placeholder)',
    // `EnrichedLine` requires `rate`/`quantity` as non-optional — a line
    // that failed price/amount determination is dropped entirely by
    // `enrichmentFanoutWorkflow`'s existing `.filter((line) => line !==
    // null)`, not represented as a priced-vs-unpriced line here. This is
    // always 0 today; wiring up a real "Price Unavailable" row requires
    // the pipeline itself to preserve failed lines instead of dropping
    // them, which is outside this render script's scope.
    UNPRICED_COUNT: '0',
    TRADE_GROUPS_HTML:
      lines.length === 0
        ? '<p class="empty-state">No billable items were extracted from this run.</p>'
        : groups.map(renderGroup).join(''),
  });

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `${runId}.html`);
  writeFileSync(outPath, html, 'utf-8');

  console.log(`Rendered run "${runId}" (${lines.length} line(s)) -> ${outPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
