"use client";

import type { EstimateStatus } from "@/features/estimate/db/schema";
import type { PipelineSubStage, PipelineSubStageId } from "@/features/estimate-extraction-pipeline/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/design-systems/shadcn/components/tooltip";
import { cn } from "@/lib/utils";

export type StageId = "uploaded" | "extraction" | "classification" | "enrichment" | "delivered";

const STAGES: { id: StageId; label: string; description: string }[] = [
  { id: "uploaded", label: "Uploaded", description: "Report received and queued." },
  { id: "extraction", label: "Extracted", description: "Reading every page of the report for billable items." },
  { id: "classification", label: "Analyzing", description: "Sorting extracted findings into trades and cost types." },
  { id: "enrichment", label: "Pricing", description: "Applying local market pricing to each line item." },
  { id: "delivered", label: "Delivered", description: "Final estimate is ready to view and send." },
];

/** Maps each real pipeline sub-stage directly onto its bar slot. */
const SUB_STAGE_INDEX: Record<PipelineSubStageId, number> = {
  extraction: 1,
  classification: 2,
  enrichment: 3,
  presentation: 4,
};

interface Progress {
  /** Last fully-completed index, -1 if none. */
  litUpTo: number;
  /** Currently in-progress index, -1 if none. */
  activeIndex: number;
  /** -1 if not failed. */
  failedIndex: number;
}

function computeProgress({
  status,
  pipelineSubStage,
}: {
  status: EstimateStatus;
  pipelineSubStage: PipelineSubStage | null;
}): Progress {
  if (status === "completed") {
    return { litUpTo: STAGES.length - 1, activeIndex: -1, failedIndex: -1 };
  }

  if (status === "failed") {
    const knownIndex = pipelineSubStage ? SUB_STAGE_INDEX[pipelineSubStage.stageId] : 0;
    const failedIndex =
      pipelineSubStage?.status === "success" ? Math.min(knownIndex + 1, STAGES.length - 1) : knownIndex;
    return { litUpTo: failedIndex - 1, activeIndex: -1, failedIndex };
  }

  if (pipelineSubStage) {
    const index = SUB_STAGE_INDEX[pipelineSubStage.stageId];
    if (pipelineSubStage.status === "success") {
      return { litUpTo: index, activeIndex: -1, failedIndex: -1 };
    }
    return { litUpTo: index - 1, activeIndex: index, failedIndex: -1 };
  }

  // No sub-stage data yet: still uploaded, awaiting HITL confirmation, or
  // in the initial parse/identity-extraction stretch before extraction
  // starts. Nothing beyond "uploaded" is knowable yet.
  return { litUpTo: 0, activeIndex: status === "processing" ? 0 : -1, failedIndex: -1 };
}

function captionLabel({
  status,
  identityConfirmed,
  timeframeSelected,
  pipelineSubStage,
}: {
  status: EstimateStatus;
  identityConfirmed: boolean;
  timeframeSelected: boolean;
  pipelineSubStage: PipelineSubStage | null;
}): string {
  if (status === "failed") return "Failed";
  if (status === "completed") return "Delivered";
  if (status === "awaiting_confirmation") {
    if (!identityConfirmed) return "Confirm identity";
    if (!timeframeSelected) return "Select timeframe";
  }
  if (pipelineSubStage) return STAGES[SUB_STAGE_INDEX[pipelineSubStage.stageId]].label;
  if (status === "processing") return "Processing";
  return "Uploaded";
}

interface EstimateStatusBarProps {
  status: EstimateStatus;
  identityConfirmed?: boolean;
  timeframeSelected?: boolean;
  errorMessage?: string | null;
  /**
   * Optional, best-effort sub-stage read from the pipeline's own run
   * state (see `estimate-extraction-pipeline/progress.ts`). Absent or
   * `null` (feature unavailable, read failed, or run hasn't reached a
   * sub-stage yet) just leaves the bar at "Uploaded" until it resolves
   * — never a required prop for correct rendering.
   */
  pipelineSubStage?: PipelineSubStage | null;
  className?: string;
}

export function EstimateStatusBar({
  status,
  identityConfirmed = false,
  timeframeSelected = false,
  errorMessage,
  pipelineSubStage = null,
  className,
}: EstimateStatusBarProps) {
  const { litUpTo, activeIndex, failedIndex } = computeProgress({ status, pipelineSubStage });
  const isFailed = failedIndex !== -1;
  const label = captionLabel({ status, identityConfirmed, timeframeSelected, pipelineSubStage });

  return (
    <div
      className={cn("flex w-[190px] shrink-0 flex-col gap-1.5", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={STAGES.length}
      aria-valuenow={isFailed ? 0 : Math.max(litUpTo, 0) + 1}
      aria-label={`Estimate status: ${label}`}
    >
      <div className="flex items-center gap-1.5">
        {STAGES.map((stage, i) => {
          const lit = !isFailed && i <= litUpTo;
          const active = !isFailed && i === activeIndex;
          const failed = isFailed && i === failedIndex;

          return (
            <Tooltip key={stage.id}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "h-2 min-w-0 flex-1 cursor-default rounded-full transition-colors",
                    lit && !failed && "bg-primary",
                    active && "animate-pulse bg-primary",
                    failed && "bg-destructive",
                    !lit && !failed && !active && "bg-muted-foreground/25",
                  )}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <div className="font-medium">
                  {stage.label}
                  {active && " · in progress"}
                  {failed && " · failed"}
                  {lit && !active && !failed && " ✓"}
                </div>
                <div className="max-w-[220px] text-muted-foreground">
                  {failed ? errorMessage ?? "Processing failed." : stage.description}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export const ESTIMATE_STAGES = STAGES;
