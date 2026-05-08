# FEATURE(complete-ai-summarization-pipeline)

## Objective
Complete the background AI summarization pipeline for home inspection PDFs using the Mastra framework. The pipeline must upload PDFs, process them asynchronously with AI summarization, persist results in the database, and handle errors gracefully while updating status appropriately.

## Phase 1: Fix Workflow Status Consistency
**Justification:** The current workflow sets status to 'processing' in the persist step and db-summary-updater tool, but the UI expects 'completed' on success. This inconsistency causes the widget to never show completed status, breaking the user experience.

**Target Blocks:**
- `src/mastra/workflows/summarize-estimate.ts` lines 47-57
- `src/mastra/tools/db-summary-updater.ts` lines 14-21

**Action & Code:**
```ts:src/mastra/workflows/summarize-estimate.ts
const persistStep = createStep({
  id: 'persist-result',
  inputSchema: z.object({ estimateRequestId: z.string(), summary: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ inputData }) => {
    await db.update(estimateRequestTable)
      .set({ summary: inputData.summary, status: 'completed' })
      .where(eq(estimateRequestTable.id, inputData.estimateRequestId));
    return { success: true };
  }
});
```

```ts:src/mastra/tools/db-summary-updater.ts
execute: async (inputData) => {
  await db.update(estimateRequestTable)
    .set({ 
      summary: inputData.summary, 
      status: 'completed' 
    })
    .where(eq(estimateRequestTable.id, inputData.estimateRequestId));
  return { success: true };
}
```

## Phase 2: Correct AI Model and Enhance Instructions
**Justification:** The original model 'openai/gpt-5.4-mini' is valid and current. Instructions need enhancement to include geographic location consideration and room/area references for more accurate estimates, aligning with the expert role.

**Target Blocks:**
- `src/mastra/agents/estimate-summarizer.ts` lines 12-26

**Action & Code:**
```ts:src/mastra/agents/estimate-summarizer.ts
export const estimateSummarizerAgent = new Agent({
  id: 'estimate-summarizer',
  name: 'Estimate Summarizer',
  instructions: `
    You are an expert home repair estimator for Fix Pro AI. 
    Your goal is to transform complex home inspection reports into actionable repair summaries.
    
    CRITICAL INSTRUCTIONS:
    1. Identify all safety, structural, or high-priority repair items immediately.
    2. Categorize items into: "Critical Safety/Structural", "Recommended Maintenance", and "Cosmetic/Optional".
    3. Provide estimated cost ranges for every major item based on current market rates (consider geographic location from property address).
    4. Include specific room/area references for each item.
    5. Prioritize items by urgency and cost.
    6. Maintain a professional, technical, yet accessible tone.
    7. Use clean, professional markdown with headers and bullet points.
    
    Output only the summary. Do not include introductory text or disclaimers.
  `,
  model: gateway('openai/gpt-5.4-mini'),
});
```

## Phase 3: Add Error Handling in Upload Action
**Justification:** The workflow execution is wrapped in a try-catch, but errors don't update the database status to 'failed', leaving uploads stuck in 'processing'. Robust error handling ensures the UI reflects failures accurately.

**Target Blocks:**
- `src/features/estimate/api/actions.ts` lines 74-87

**Action & Code:**
```ts:src/features/estimate/api/actions.ts
// Trigger AI pipeline (Next.js 16 after() pattern)
after(async () => {
  try {
    const workflow = mastra.getWorkflow('summarize-estimate');
    const run = await workflow.createRun();
    await run.start({
      inputData: {
        estimateRequestId: inserted.id,
        fileUrl: blob.url
      }
    });
  } catch (e) {
    console.error("AI Pipeline Error:", e);
    // Update status to failed on pipeline error
    await db.update(estimateRequestTable)
      .set({ status: 'failed' })
      .where(eq(estimateRequestTable.id, inserted.id));
  }
});
```

## Phase 4: Validation and Testing
**Justification:** Ensure the pipeline works end-to-end by running lint/build checks and manual testing of the upload flow.

**Target Blocks:** N/A (manual testing)

**Action & Code:** N/A (run commands and test manually)