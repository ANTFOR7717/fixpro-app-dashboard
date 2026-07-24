import { mastra } from './index';

/**
 * Read-only progress signal, decoupled from the app's DB: nothing here
 * writes anything, anywhere. It reads Mastra's own workflow-run storage
 * (the same snapshot data `restart()`/`getWorkflowRunById()` already rely
 * on — persisted per step transition, not only at suspend) and derives
 * which of the four non-suspending pipeline stages is furthest along.
 * `triggerSummarizeEstimate()`/`resumeSummarizeEstimate()` are untouched;
 * this is purely an additional read path a caller can consult, and any
 * failure here (storage unreachable, run not found, unexpected shape)
 * resolves to `null` rather than throwing, so a fault here can't break
 * whatever is rendering the estimate's status.
 */

export type PipelineSubStageId = 'extraction' | 'classification' | 'enrichment' | 'presentation';

export type PipelineSubStage = {
  stageId: PipelineSubStageId;
  status: 'running' | 'success';
};

/**
 * Step ids as declared in `pipeline.ts`'s composition root. Each of these
 * four stages is composed as a workflow-as-step, so it appears as one
 * atomic entry in the parent run's `steps` record — not a flood of every
 * leaf agent call inside it.
 */
const SUB_STAGE_STEP_IDS: { stageId: PipelineSubStageId; stepId: string }[] = [
  { stageId: 'extraction', stepId: 'Extraction' },
  { stageId: 'classification', stepId: 'Classify Findings' },
  { stageId: 'enrichment', stepId: 'enrichment-fanout' },
  { stageId: 'presentation', stepId: 'Presentation' },
];

export async function getEstimatePipelineSubStage(
  workflowRunId: string | null | undefined,
): Promise<PipelineSubStage | null> {
  if (!workflowRunId) return null;

  try {
    const workflow = mastra.getWorkflow('summarize-estimate');
    const state = await workflow.getWorkflowRunById(workflowRunId);
    if (!state?.steps) return null;

    let current: PipelineSubStage | null = null;
    for (const { stageId, stepId } of SUB_STAGE_STEP_IDS) {
      const entry = state.steps[stepId];
      const result = Array.isArray(entry) ? entry[entry.length - 1] : entry;
      if (!result) continue;
      current = { stageId, status: result.status === 'success' ? 'success' : 'running' };
    }
    return current;
  } catch {
    return null;
  }
}
