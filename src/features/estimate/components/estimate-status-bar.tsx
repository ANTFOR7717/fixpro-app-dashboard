"use client";

import type { EstimateStatus } from "@/features/estimate/db/schema";
import type { PipelineSubStage } from "@/features/estimate-extraction-pipeline/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/design-systems/shadcn/components/tooltip";
import { cn } from "@/lib/utils";

export type StageId = "uploaded" | "processing" | "analyzed" | "priced" | "delivered";

const PIPELINE_SUBSTAGE_TEXT: Record<PipelineSubStage["stageId"], { label: string; description: string }> = {
  extraction: {
    label: "Extracting findings",
    description: "Reading every page of the report for billable items.",
  },
  classification: {
    label: "Classifying items",
    description: "Sorting extracted findings into trades and cost types.",
  },
  enrichment: {
    label: "Pricing materials & labor",
    description: "Applying local market pricing to each line item.",
  },
  presentation: {
    label: "Finalizing estimate",
    description: "Assembling the final estimate for review.",
  },
};

const STAGES: { id: StageId; label: string; description: string }[] = [
  { id: "uploaded", label: "Uploaded", description: "Report received and queued." },
  {
    id: "processing",
    label: "Processing",
    description: "AI is reading the inspection report and extracting billable items.",
  },
  { id: "analyzed", label: "Analyzed", description: "Billable items extracted from the report." },
  { id: "priced", label: "Priced", description: "Local market pricing has been applied to each item." },
  { id: "delivered", label: "Delivered", description: "Final estimate is ready to view and send." },
];

type EstimatePhase =
  | "uploaded"
  | "processing"
  | "identity"
  | "timeframe"
  | "completed"
  | "failed";

function getPhase({
  status,
  identityConfirmed,
  timeframeSelected,
}: {
  status: EstimateStatus;
  identityConfirmed: boolean;
  timeframeSelected: boolean;
}): EstimatePhase {
  if (status === "failed") return "failed";
  if (status === "completed") return "completed";
  if (status === "awaiting_confirmation") {
    if (!identityConfirmed) return "identity";
    if (!timeframeSelected) return "timeframe";
  }
  if (status === "processing" || timeframeSelected) return "processing";
  return "uploaded";
}

function phaseLabel(phase: EstimatePhase): string {
  if (phase === "identity") return "Confirm identity";
  if (phase === "timeframe") return "Select timeframe";
  if (phase === "completed") return "Completed";
  if (phase === "failed") return "Failed";
  if (phase === "processing") return "Processing";
  return "Uploaded";
}

function litUpTo(phase: EstimatePhase): number {
  if (phase === "processing") return 1;
  if (phase === "identity") return 2;
  if (phase === "timeframe") return 3;
  if (phase === "completed") return STAGES.length - 1;
  return 0;
}

interface EstimateStatusBarProps {
  status: EstimateStatus;
  identityConfirmed?: boolean;
  timeframeSelected?: boolean;
  errorMessage?: string | null;
  /**
   * Optional, best-effort sub-stage read from the pipeline's own run
   * state (see `estimate-extraction-pipeline/progress.ts`). Only ever
   * consulted while `phase === "processing"`; absent or `null` (feature
   * unavailable, read failed, or run hasn't reached a sub-stage yet)
   * falls straight back to the generic "Processing" label — never a
   * required prop for correct rendering.
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
  const phase = getPhase({ status, identityConfirmed, timeframeSelected });
  const litIndex = litUpTo(phase);
  const isFailed = phase === "failed";
  const isActive = phase === "processing" || phase === "identity" || phase === "timeframe";
  const subStageText =
    phase === "processing" && pipelineSubStage ? PIPELINE_SUBSTAGE_TEXT[pipelineSubStage.stageId] : null;
  const displayLabel = subStageText?.label ?? phaseLabel(phase);

  return (
    <div
      className={cn("flex w-[190px] shrink-0 flex-col gap-1.5", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={STAGES.length}
      aria-valuenow={isFailed ? 0 : Math.max(litIndex, 1)}
      aria-label={`Estimate status: ${displayLabel}`}
    >
      <div className="flex items-center gap-1.5">
        {STAGES.map((stage, i) => {
          const lit = !isFailed && i <= litIndex;
          const active = isActive && i === litIndex;
          const failed = isFailed && i === 1;
          const isProcessingStage = stage.id === "processing";
          const tooltipText = failed
            ? errorMessage ?? "Processing failed."
            : isProcessingStage && subStageText
              ? subStageText.description
              : stage.description;

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
                  {isProcessingStage && subStageText ? subStageText.label : stage.label}
                  {active && " · in progress"}
                  {failed && " · failed"}
                  {lit && !active && !failed && " ✓"}
                </div>
                <div className="max-w-[220px] text-muted-foreground">
                  {tooltipText}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <span className="text-xs font-medium text-muted-foreground">
        {displayLabel}
      </span>
    </div>
  );
}

export const ESTIMATE_STAGES = STAGES;
