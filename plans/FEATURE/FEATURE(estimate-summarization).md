# FEATURE(estimate-summarization)

## Request

Implement a background AI pipeline using Mastra AI v1.8.1 and Next.js 16 to automatically summarize repair estimates (PDFs).

## Directory Map

```text
src/
  features/
    estimate/
      api/
        actions.ts                    (modify)
      db/
        schema.ts                     (modify)
  mastra/
    agents/
      estimate-summarizer.ts          (new)
    tools/
      pdf-fetcher.ts                  (new)
      db-summary-updater.ts           (new)
    workflows/
      summarize-estimate.ts           (new)
    index.ts                          (modify)
```

## Modification Table

| File | Action | Why |
|---|---|---|
| `src/features/estimate/db/schema.ts` | Modify | Add `summary` column and set default status to `uploaded` |
| `src/mastra/tools/pdf-fetcher.ts` | Create | Tool for fetching and base64-encoding PDFs |
| `src/mastra/tools/db-summary-updater.ts` | Create | Tool for persisting AI output and status transitions |
| `src/mastra/agents/estimate-summarizer.ts` | Create | Professional GPT-5.5 Instant technical agent |
| `src/mastra/workflows/summarize-estimate.ts` | Create | Peak-integrity v1.8.1 declarative workflow using Tool Composition |
| `src/mastra/index.ts` | Modify | Central component registration |
| `src/features/estimate/api/actions.ts` | Modify | Next.js 16 `after()` trigger |

## Existing Pattern Audit

- **Next.js 16 after() API**: Standard-compliant non-blocking work.
- **Mastra v1.8.1 Tool Composition**: Uses `createStep(tool)` for direct, zero-boilerplate tool-to-step conversion.
- **Mastra v1.8.1 Standard Execution**: Uses the `createRun().start()` pattern.
- **Kebab-case Standards**: All IDs follow the 2026 registry standard.

## Execution Plan

### Step 1 — Schema Update
Add `summary` column to `estimate_requests`. Change `status` default to `uploaded`.

### Step 2 — Component Tools
Implement `pdf-fetcher` and `db-summary-updater`. 

### Step 3 — Multimodal Agent
Define `estimate-summarizer` using `openai('gpt-5.5-instant')`.

### Step 4 — Declarative Workflow
Implement `summarize-estimate` workflow using v1.8.1 tool composition and input mapping:
1. `fetch-file`: Composed directly from `pdf-fetcher`.
2. `summarize-file`: Manual step to construct multimodal agent input.
3. `persist-result`: Composed directly from `db-summary-updater`.

### Step 5 — Next.js 16 Integration
Update `uploadEstimatePdfAction` to trigger the workflow via `after()`.

## File-by-File Changes

### `src/mastra/workflows/summarize-estimate.ts`
**Action:** Create  
**Why:** Peak v1.8.1 declarative architecture with Tool Composition.  
**Impact:** Main pipeline logic.

#### After
```typescript
import { Workflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { pdfFetcherTool } from '../tools/pdf-fetcher';
import { dbSummaryUpdaterTool } from '../tools/db-summary-updater';

// v1.8.1 Shorthand: Compose tools directly into steps
const fetchStep = createStep(pdfFetcherTool);
const persistStep = createStep(dbSummaryUpdaterTool);

const summarizeStep = createStep({
  id: 'summarize-file',
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgentById('estimate-summarizer');
    
    // Construct multimodal input for GPT-5.5 series
    const result = await agent.generate({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Provide a technical summary of repairs and costs from this inspection report.' },
            { type: 'file', data: inputData.dataUrl, mediaType: 'application/pdf' },
          ],
        },
      ],
    });
    return { summary: result.text };
  }
});

export const summarizeEstimateWorkflow = new Workflow({
  name: 'summarize-estimate',
  triggerSchema: z.object({
    estimateRequestId: z.string().uuid(),
    fileUrl: z.string().url(),
  }),
})
  .addStep(fetchStep, {
    variables: { url: { stepId: 'trigger', path: 'fileUrl' } }
  })
  .addStep(summarizeStep, {
    variables: { dataUrl: { stepId: 'fetch-file', path: 'dataUrl' } }
  })
  .addStep(persistStep, {
    variables: { 
      estimateRequestId: { stepId: 'trigger', path: 'estimateRequestId' },
      summary: { stepId: 'summarize-file', path: 'summary' }
    }
  });
```

---

### `src/features/estimate/api/actions.ts`
**Action:** Modify  
#### After
```typescript
    const [inserted] = await db.insert(estimateRequestTable).values({
      userId: session.user.id,
      fileUrl: blob.url,
      fileName: file.name,
      fileSize: file.size.toString(),
      status: "uploaded",
      ...metadata
    }).returning({ id: estimateRequestTable.id });

    // Trigger AI pipeline (v1.8.1 pattern)
    const { after } = await import("next/server");
    after(async () => {
      const { mastra } = await import("@/mastra");
      const workflow = mastra.getWorkflow('summarize-estimate');
      const run = await workflow.createRun();
      await run.start({ 
        inputData: {
          estimateRequestId: inserted.id,
          fileUrl: blob.url
        }
      });
    });
```

---

### `src/mastra/tools/pdf-fetcher.ts`
**Action:** Create  
#### After
```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const pdfFetcherTool = createTool({
  id: 'pdf-fetcher',
  description: 'Fetches a PDF and returns a base64 data URL.',
  inputSchema: z.object({ url: z.string().url() }),
  execute: async ({ input }) => {
    const res = await fetch(input.url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    return { dataUrl: `data:application/pdf;base64,${buffer.toString('base64')}` };
  },
});
```

---

### `src/mastra/tools/db-summary-updater.ts`
**Action:** Create  
#### After
```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { db } from '@/db';
import { estimateRequestTable } from '@/features/estimate/db/schema';
import { eq } from 'drizzle-orm';

export const dbSummaryUpdaterTool = createTool({
  id: 'db-summary-updater',
  description: 'Persists AI summary and updates status.',
  inputSchema: z.object({
    estimateRequestId: z.string().uuid(),
    summary: z.string(),
  }),
  execute: async ({ input }) => {
    await db.update(estimateRequestTable)
      .set({ summary: input.summary, status: 'processing' })
      .where(eq(estimateRequestTable.id, input.estimateRequestId));
    return { success: true };
  },
});
```

---

### `src/mastra/agents/estimate-summarizer.ts`
**Action:** Create  
#### After
```typescript
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';

export const estimateSummarizerAgent = new Agent({
  name: 'Estimate Summarizer',
  instructions: 'Expert technical home repair estimator. Technical markdown summary.',
  model: openai('gpt-5.5-instant'),
});
```

---

### `src/mastra/index.ts`
**Action:** Modify  
#### After
```typescript
import { Mastra } from '@mastra/core/mastra';
import { estimateSummarizerAgent } from './agents/estimate-summarizer';
import { pdfFetcherTool } from './tools/pdf-fetcher';
import { dbSummaryUpdaterTool } from './tools/db-summary-updater';
import { summarizeEstimateWorkflow } from './workflows/summarize-estimate';

export const mastra = new Mastra({
  agents: { 'estimate-summarizer': estimateSummarizerAgent },
  tools: { 'pdf-fetcher': pdfFetcherTool, 'db-summary-updater': dbSummaryUpdaterTool },
  workflows: { 'summarize-estimate': summarizeEstimateWorkflow },
});
```

---

### `src/features/estimate/db/schema.ts`
**Action:** Modify  
#### After
```typescript
  status: varchar("status", { length: 50 }).default("uploaded").notNull(),
  summary: text("summary"),
```

## Validation Plan
1. Upload PDF.
2. Confirm initial status `uploaded`.
3. Check Mastra Studio for trace.
4. Verify summary presence and final status `processing` in DB.

## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
