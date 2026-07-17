"use client";

import type { EstimateStatus } from '@/features/estimate/db/schema';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/design-systems/shadcn/components/tooltip';
import { cn } from '@/lib/utils';

/**
 * Visual definition of the estimate processing pipeline, in order.
 *
 * The DB column `status` is one of: uploaded, processing, failed, completed.
 * Those are mapped onto the visual stages below. "delivered" is the terminal
 * "completed + delivered to the user" state we visualize as the final lit
 * segment; today the DB does not have a separate status for it, so it
 * coincides with `completed` until we add delivery tracking.
 *
 * The list of visual stages is:
 *   1. uploaded  — file received, queued
 *   2. processing — AI pipeline running
 *   3. analyzed  — extraction complete
 *   4. priced    — pricer ran (future state; same as analyzed until shipped)
 *   5. delivered — final report available to the user
 *
 * Status mapping:
 *   uploaded    -> stage 0 lit
 *   processing  -> stages 0..1 lit, with stage 1 in the "active" pulsing state
 *   completed   -> all five stages lit
 *   failed      -> only stage 0 lit; segment 1 is red and labeled with the error
 */

export type StageId = 'uploaded' | 'processing' | 'analyzed' | 'priced' | 'delivered';

const STAGES: { id: StageId; label: string; description: string }[] = [
  { id: 'uploaded',  label: 'Uploaded',  description: 'Report received and queued.' },
  { id: 'processing',label: 'Processing',description: 'AI is reading the inspection report and extracting billable items.' },
  { id: 'analyzed',  label: 'Analyzed',  description: 'Billable items extracted from the report.' },
  { id: 'priced',    label: 'Priced',    description: 'Local market pricing has been applied to each item.' },
  { id: 'delivered', label: 'Delivered', description: 'Final estimate is ready to view and send.' },
];

/**
 * Map a DB status onto the index of the highest "lit" stage.
 * - uploaded    -> 0
 * - processing  -> 1 (active, not yet complete)
 * - completed   -> STAGES.length - 1 (all five)
 * - failed      -> 0 (only uploaded lit; segment 1 is rendered red)
 */
function litUpTo(status: EstimateStatus): number {
  if (status === 'uploaded') return 0;
  if (status === 'processing') return 1; // 1 is the "in progress" stage
  if (status === 'completed') return STAGES.length - 1;
  // failed
  return 0;
}

interface EstimateStatusBarProps {
  status: EstimateStatus;
  /** Optional error message, surfaced in the tooltip on the failed segment. */
  errorMessage?: string | null;
  className?: string;
}

export function EstimateStatusBar({ status, errorMessage, className }: EstimateStatusBarProps) {
  const litIndex = litUpTo(status);
  const isFailed = status === 'failed';
  const isActive = status === 'processing';

  return (
    <div
      className={cn('flex w-full max-w-[180px] shrink-0 items-center gap-1.5', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={STAGES.length}
      aria-valuenow={isFailed ? 0 : Math.max(litIndex, 1)}
      aria-label={`Estimate status: ${status}`}
    >
      {STAGES.map((stage, i) => {
        // Lit = all stages up to and including litIndex.
        const lit = !isFailed && i <= litIndex;
        // Active = currently in progress (segment is animating).
        const active = isActive && i === litIndex;
        // Failed segment = the second segment (index 1) shown red.
        const failed = isFailed && i === 1;

        const tooltipText = failed
          ? errorMessage ?? 'Processing failed.'
          : stage.description;

        return (
          <Tooltip key={stage.id}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'h-2 flex-1 min-w-0 rounded-full transition-colors cursor-default',
                  // Lit
                  lit && !failed && 'bg-primary',
                  // Active (pulsing)
                  active && 'bg-primary animate-pulse',
                  // Failed
                  failed && 'bg-destructive',
                  // Not yet reached — visible neutral track
                  !lit && !failed && !active && 'bg-muted-foreground/25',
                )}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <div className="font-medium">
                {stage.label}
                {active && ' \u00b7 in progress'}
                {failed && ' \u00b7 failed'}
                {lit && !active && !failed && ' \u2713'}
              </div>
              <div className="text-muted-foreground max-w-[220px]">
                {tooltipText}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * Re-export the visual stage list so other components (e.g. detail page) can
 * use the same labels without re-defining them.
 */
export const ESTIMATE_STAGES = STAGES;
