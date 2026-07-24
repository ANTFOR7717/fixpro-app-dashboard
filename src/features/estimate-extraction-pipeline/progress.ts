import { mastra } from './index';

/**
 * Read-only progress signal, decoupled from the app's DB: nothing here
 * writes anything, anywhere. It reads Mastra's own workflow-run storage
 * and derives which of the four non-suspending pipeline stages is
 * furthest along. `triggerSummarizeEstimate()`/`resumeSummarizeEstimate()`
 * are untouched; this is purely an additional read path a caller can
 * consult, and any failure here (storage unreachable, run not found,
 * unexpected shape) resolves to `null` rather than throwing, so a fault
 * here can't break whatever is rendering the estimate's status.
 *
 * Each of the four stages is composed in `pipeline.ts` as a
 * workflow-as-step (`.then(extractionFanoutWorkflow)` etc.), and Mastra
 * persists a nested workflow-as-step's run as its OWN storage row —
 * same `runId` as the parent `Generate Estimate` run, but keyed under
 * its own `workflow_name` (its own `id`, e.g. `'Extraction'`) — rather
 * than folding it into the parent run's own `steps` record. Confirmed
 * directly against `mastra_workflow_snapshot`: a mid-flight run had
 * `Extraction`/`Classify Findings` at `workflow_name='Extraction'` /
 * `'Classify Findings'` with `status: 'success'`, `enrichment-fanout` at
 * `'running'`, and no row yet for `'Presentation'`, while the PARENT
 * run's own snapshot never gained entries for any of the four. So this
 * reads each stage's snapshot directly via `workflowName`, not through
 * `workflow.getWorkflowRunById()`'s parent-run `steps` record.
 */

export type PipelineSubStageId = 'extraction' | 'classification' | 'enrichment' | 'presentation';

export type PipelineSubStage = {
  stageId: PipelineSubStageId;
  status: 'running' | 'success';
};

/**
 * Workflow ids as declared by each stage's own `createWorkflow({ id: ... })`
 * in `pipeline.ts`'s composition root (extraction/steps.ts,
 * classification/workflow.ts, enrichment/workflow.ts,
 * presentation/workflow.ts).
 */
const SUB_STAGE_WORKFLOW_NAMES: { stageId: PipelineSubStageId; workflowName: string }[] = [
  { stageId: 'extraction', workflowName: 'Extraction' },
  { stageId: 'classification', workflowName: 'Classify Findings' },
  { stageId: 'enrichment', workflowName: 'enrichment-fanout' },
  { stageId: 'presentation', workflowName: 'Presentation' },
];

export async function getEstimatePipelineSubStage(
  workflowRunId: string | null | undefined,
): Promise<PipelineSubStage | null> {
  if (!workflowRunId) return null;

  try {
    const storage = mastra.getStorage();
    const workflowStore = await storage?.getStore('workflows');
    if (!workflowStore) return null;

    let current: PipelineSubStage | null = null;
    for (const { stageId, workflowName } of SUB_STAGE_WORKFLOW_NAMES) {
      const snapshot = await workflowStore.loadWorkflowSnapshot({ runId: workflowRunId, workflowName });
      if (!snapshot) continue;
      current = { stageId, status: snapshot.status === 'success' ? 'success' : 'running' };
    }
    return current;
  } catch {
    return null;
  }
}
