"use client";

import { useTransition } from "react";
import toast from "react-hot-toast";
import { RefreshCw } from "lucide-react";
import { Button } from "@/design-systems/shadcn/components/button";
import { retryEstimateAction } from "../api/actions";

interface EstimateRetryButtonProps {
  id: string;
}

export function EstimateRetryButton({ id }: EstimateRetryButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleRetry = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("id", id);
      const result = await retryEstimateAction(null, formData);
      if (result.success) toast.success(result.message ?? "Retry started.");
      else toast.error(result.error ?? "Failed to retry.");
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRetry}
      disabled={isPending}
      className="gap-1.5"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
      {isPending ? "Retrying..." : "Retry"}
    </Button>
  );
}
