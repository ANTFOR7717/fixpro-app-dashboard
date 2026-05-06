# FEATURE(estimate-summarization)

## Request

Implement an automated repair estimate summarization feature using the Mastra AI framework. When a user uploads an inspection report (PDF), a Mastra workflow should be triggered to extract the text, summarize the key repair items, estimated costs, and priorities, and persist this summary back to the database.

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
      pdf-extractor.ts                (new)
    workflows/
      summarize-estimate.ts           (new)
    index.ts                          (modify)
package.json                          (modify)
```

## Modification Table

| File | Action | Why |
|---|---|---|
| `src/features/estimate/db/schema.ts` | Modify | Add `summary` column to `estimate_requests` table to store the AI-generated report summary |
| `src/mastra/tools/pdf-extractor.ts` | Create | Define a Mastra tool that fetches a PDF from a URL and extracts its text content using `pdf-parse` |
| `src/mastra/agents/estimate-summarizer.ts` | Create | Define a specialized AI agent with a system prompt optimized for parsing home inspection reports into structured summaries |
| `src/mastra/workflows/summarize-estimate.ts` | Create | Define a Mastra workflow that orchestrates the PDF extraction and summarization steps, updating the database upon completion |
| `src/mastra/index.ts` | Modify | Register the new agent and workflow in the main Mastra instance |
| `src/features/estimate/api/actions.ts` | Modify | Trigger the `summarizeEstimateWorkflow` immediately after a successful PDF upload |
| `package.json` | Modify | Add `pdf-parse` dependency for PDF text extraction |

## Existing Pattern Audit

### Mastra Componentization
The project follows a standard Mastra structure under `src/mastra/`, with dedicated folders for `agents`, `tools`, and `workflows`. New AI logic must be encapsulated in these directories following the established `index.ts` registration pattern.

### Database Operations
The project uses Drizzle ORM. Database updates (like persisting the summary) should use the existing `db` instance from `@/db`.

### Server Actions
Form submissions and file uploads are handled via Next.js Server Actions in `src/features/estimate/api/actions.ts`. The AI pipeline should be triggered asynchronously or within these actions to maintain a seamless user experience.

## Execution Plan

### Step 1 — Database and Dependencies
Install `pdf-parse` and add the `summary` column to the `estimate_requests` table. Run `npx drizzle-kit push` to update the schema.

### Step 2 — PDF Extraction Tool
Create a `pdfExtractorTool` in `src/mastra/tools/pdf-extractor.ts`. This tool will take a `fileUrl` as input, fetch the blob, and use `pdf-parse` to return the raw text content.

### Step 3 — Summarization Agent
Define the `estimateSummarizerAgent` in `src/mastra/agents/estimate-summarizer.ts`. This agent will use the `openai` provider and a specific system prompt to extract repair items, their estimated costs (if mentioned), and a priority level (High/Medium/Low).

### Step 4 — Orchestration Workflow
Create the `summarizeEstimateWorkflow` in `src/mastra/workflows/summarize-estimate.ts`. 
1. **Input**: `estimateRequestId`
2. **Step 1**: Fetch `fileUrl` from DB.
3. **Step 2**: Run `pdfExtractorTool`.
4. **Step 3**: Run `estimateSummarizerAgent`.
5. **Step 4**: Update DB record with `summary` and set `status` to `completed`.

### Step 5 — Integration
Update `uploadEstimatePdfAction` in `src/features/estimate/api/actions.ts` to execute the workflow after the initial DB record is created.

## File-by-File Changes

### `package.json`

**Action:** Modify  
**Why:** Add `pdf-parse` for PDF text extraction and `@types/pdf-parse` for TypeScript support.  
**Impact:** Adds new dependencies required for the tool.

#### Before
```json
  "dependencies": {
    "@better-auth/infra": "0.1.13",
    ...
    "swr": "^2.3.3",
    "tailwind-merge": "^3.3.0",
    "tailwindcss": "^4.1.7",
    "zod": "^4.2.1"
  },
```

#### After
```json
  "dependencies": {
    "@better-auth/infra": "0.1.13",
    ...
    "pdf-parse": "^1.1.1",
    ...
    "swr": "^2.3.3",
    "tailwind-merge": "^3.3.0",
    "tailwindcss": "^4.1.7",
    "zod": "^4.2.1"
  },
```

#### Reasoning
- `pdf-parse` is a lightweight, widely-used library for server-side PDF text extraction in Node.js.

---

### `src/features/estimate/db/schema.ts`

**Action:** Modify  
**Why:** Store the generated summary in the database.  
**Impact:** Extends the `estimate_requests` table schema.

#### Before
```typescript
  zipCode: varchar("zip_code", { length: 20 }).notNull(),
  timeframe: text("timeframe").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

#### After
```typescript
  zipCode: varchar("zip_code", { length: 20 }).notNull(),
  timeframe: text("timeframe").notNull(),
  summary: text("summary"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

#### Reasoning
- A simple `text` column is sufficient for the AI-generated summary.

---

### `src/mastra/tools/pdf-extractor.ts`

**Action:** Create  
**Why:** Mastra agents/workflows need a tool to read the PDF content stored in Vercel Blob.  
**Impact:** Provides a reusable text extraction capability.

#### Before
File does not exist yet.

#### After
```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import pdf from 'pdf-parse';

export const pdfExtractorTool = createTool({
  id: 'pdf-extractor',
  description: 'Extracts text from a PDF file given its URL.',
  inputSchema: z.object({
    url: z.string().url(),
  }),
  execute: async ({ input }) => {
    const response = await fetch(input.url);
    const buffer = Buffer.from(await response.arrayBuffer());
    const data = await pdf(buffer);
    return { text: data.text };
  },
});
```

#### Reasoning
- Fetches the file into a buffer and uses `pdf-parse` to extract text. This runs on the server.

---

### `src/mastra/agents/estimate-summarizer.ts`

**Action:** Create  
**Why:** Encapsulate the AI's "personality" and knowledge about inspection reports.  
**Impact:** Defines the AI logic for summarization.

#### Before
File does not exist yet.

#### After
```typescript
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';

export const estimateSummarizerAgent = new Agent({
  name: 'Estimate Summarizer',
  instructions: `
    You are an expert home inspection analyst. 
    Your task is to take raw text from a home inspection report and produce a professional, concise summary.
    
    Structure your response with:
    1. A brief overview of the property condition.
    2. A list of "Critical Repairs" (safety issues, structural damage, major leaks).
    3. A list of "Recommended Maintenance" (wear and tear, minor improvements).
    4. An estimated total cost range for the critical repairs if possible.
    
    Be objective and use professional terminology.
  `,
  model: openai('gpt-4o'),
});
```

#### Reasoning
- Uses GPT-4o for high-quality parsing of potentially messy PDF text.
- Standard Mastra `Agent` definition.

---

### `src/mastra/workflows/summarize-estimate.ts`

**Action:** Create  
**Why:** Orchestrate the multi-step process of extraction, summarization, and persistence.  
**Impact:** Defines the core automated process.

#### Before
File does not exist yet.

#### After
```typescript
import { Workflow, Step } from '@mastra/core/workflow';
import { z } from 'zod';
import { db } from '@/db';
import { estimateRequestTable } from '@/features/estimate/db/schema';
import { eq } from 'drizzle-orm';
import { pdfExtractorTool } from '../tools/pdf-extractor';
import { estimateSummarizerAgent } from '../agents/estimate-summarizer';

export const summarizeEstimateWorkflow = new Workflow({
  name: 'summarize-estimate',
  inputSchema: z.object({
    estimateRequestId: z.string().uuid(),
  }),
})
  .step(
    new Step({
      id: 'fetch-and-extract',
      execute: async ({ context }) => {
        const [request] = await db
          .select()
          .from(estimateRequestTable)
          .where(eq(estimateRequestTable.id, context.estimateRequestId));

        if (!request) throw new Error('Estimate request not found');

        const { text } = await pdfExtractorTool.execute({ 
          input: { url: request.fileUrl } 
        });
        
        return { text };
      },
    })
  )
  .step(
    new Step({
      id: 'summarize',
      execute: async ({ context }) => {
        const text = context.steps['fetch-and-extract'].text;
        const result = await estimateSummarizerAgent.generate(text);
        return { summary: result.text };
      },
    })
  )
  .step(
    new Step({
      id: 'persist-summary',
      execute: async ({ context }) => {
        const summary = context.steps['summarize'].summary;
        await db
          .update(estimateRequestTable)
          .set({ 
            summary,
            status: 'completed'
          })
          .where(eq(estimateRequestTable.id, context.estimateRequestId));
          
        return { success: true };
      },
    })
  );
```

#### Reasoning
- Decouples extraction from summarization for better error handling and observability.
- Updates the status to 'completed' so the UI can reflect the finished state.

---

### `src/mastra/index.ts`

**Action:** Modify  
**Why:** Register the new components so they are available to the application.  
**Impact:** Exposes the agent and workflow.

#### Before
```typescript
import { Mastra } from '@mastra/core/mastra';

export const mastra = new Mastra()
```

#### After
```typescript
import { Mastra } from '@mastra/core/mastra';
import { estimateSummarizerAgent } from './agents/estimate-summarizer';
import { summarizeEstimateWorkflow } from './workflows/summarize-estimate';

export const mastra = new Mastra({
  agents: { estimateSummarizerAgent },
  workflows: { summarizeEstimateWorkflow },
});
```

#### Reasoning
- Standard Mastra registration pattern.

---

### `src/features/estimate/api/actions.ts`

**Action:** Modify  
**Why:** Trigger the AI pipeline immediately after upload.  
**Impact:** Connects the frontend upload flow to the AI backend.

#### Before
```typescript
    const [inserted] = await db.insert(estimateRequestTable).values({
      userId: session.user.id,
      fileUrl: blob.url,
      fileName: file.name,
      fileSize: file.size.toString(),
      status: "processing",
      ...metadata
    }).returning({ id: estimateRequestTable.id });

    revalidatePath("/dashboard/estimate");
    return { success: true, message: "Upload complete! Your estimate is processing." };
```

#### After
```typescript
    const [inserted] = await db.insert(estimateRequestTable).values({
      userId: session.user.id,
      fileUrl: blob.url,
      fileName: file.name,
      fileSize: file.size.toString(),
      status: "processing",
      ...metadata
    }).returning({ id: estimateRequestTable.id });

    // Trigger Mastra workflow in the background
    const { mastra } = await import("@/mastra");
    const workflow = mastra.getWorkflow('summarizeEstimateWorkflow');
    workflow.execute({ estimateRequestId: inserted.id }).catch(console.error);

    revalidatePath("/dashboard/estimate");
    return { success: true, message: "Upload complete! Your estimate is processing." };
```

#### Reasoning
- Uses `.returning()` to get the new record ID.
- Imports `mastra` dynamically to avoid bundling it into every server action if not needed (standard optimization).
- Fires the workflow execution and doesn't `await` it, so the user gets an immediate "Success" message while the AI works in the background.

## Validation Plan

### Automated Tests
- Trigger the workflow manually with a mock ID:
  ```bash
  npx tsx -e 'import { mastra } from "./src/mastra"; mastra.getWorkflow("summarizeEstimateWorkflow").execute({ estimateRequestId: "..." })'
  ```

### Manual Verification
1. Upload a valid PDF inspection report.
2. Verify the record appears in the database with `status: 'processing'`.
3. Wait a few seconds and verify the status changes to `'completed'` and the `summary` column is populated.
4. Check server logs for any Mastra execution errors.

## Risk Notes
- **PDF Extraction Limits**: `pdf-parse` may fail on scans or password-protected files. *Mitigation*: The workflow will log errors and the record will stay in 'processing' or we could add an 'error' status.
- **Cost Range Accuracy**: AI can hallucinate costs. *Mitigation*: The system prompt explicitly says "estimated" and "if possible".

## Approval

`Status: Awaiting explicit user approval. Do not implement yet.`
