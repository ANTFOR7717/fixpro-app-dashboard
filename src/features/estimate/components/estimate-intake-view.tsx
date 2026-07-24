"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileSearch } from "lucide-react";

import type { IntakeIdentity } from "@/features/estimate-extraction-pipeline/intake";
import type { EstimateStatus } from "../db/schema";
import { EstimateConfirmationView } from "./estimate-confirmation-view";
import { EstimateRetryButton } from "./estimate-retry-button";
import { EstimateStatusBar } from "./estimate-status-bar";
import { Button } from "@/design-systems/shadcn/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-systems/shadcn/components/card";
import Link from "next/link";

interface EstimateIntakeViewProps {
  estimateRequestId: string;
  status: EstimateStatus;
  identity: IntakeIdentity | null;
  phase: "identity" | "timeframe";
  errorMessage: string | null;
}

export function EstimateIntakeView({
  estimateRequestId,
  status,
  identity,
  phase,
  errorMessage,
}: EstimateIntakeViewProps) {
  const router = useRouter();
  const isProcessing = status === "uploaded" || status === "processing";

  useEffect(() => {
    if (!isProcessing) return;

    const interval = window.setInterval(() => router.refresh(), 2000);
    return () => window.clearInterval(interval);
  }, [isProcessing, router]);

  const statusUpdates = (
    <div className="flex justify-center" aria-live="polite">
      <EstimateStatusBar
        status={status}
        identityConfirmed={Boolean(identity && phase === "timeframe")}
        timeframeSelected={Boolean(identity && phase === "timeframe" && status === "processing")}
        errorMessage={errorMessage}
      />
    </div>
  );

  if (status === "awaiting_confirmation" && identity) {
    return (
      <div className="space-y-6">
        {statusUpdates}
        <EstimateConfirmationView
          estimateRequestId={estimateRequestId}
          identity={identity}
          phase={phase}
        />
      </div>
    );
  }

  if (status === "awaiting_confirmation") {
    return (
      <div className="space-y-6">
        {statusUpdates}
        <Card>
          <CardHeader>
            <CardTitle>We could not prepare the intake details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {errorMessage ?? "The extracted identity details are unavailable. Please retry this estimate."}
            </p>
            <EstimateRetryButton id={estimateRequestId} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="space-y-6">
        {statusUpdates}
        <Card>
          <CardHeader>
            <CardTitle>Estimate processing failed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {errorMessage ?? "Please retry this estimate."}
            </p>
            <EstimateRetryButton id={estimateRequestId} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "completed") {
    return (
      <div className="space-y-6">
        {statusUpdates}
        <Card>
          <CardHeader>
            <CardTitle>Estimate ready</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/dashboard/estimate/${estimateRequestId}`}>View estimate</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {statusUpdates}
      <EstimateIntakeLoading status={status} />
    </div>
  );
}

function EstimateIntakeLoading({ status }: { status: "uploaded" | "processing" }) {
  const isQueued = status === "uploaded";

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col items-center gap-6 px-6 py-14 text-center">
        <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl border border-primary/20 bg-primary/5">
          <FileSearch className="h-11 w-11 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isQueued ? "Upload received" : "Analyzing your PDF"}
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {isQueued
              ? "Your estimate is queued and will begin analysis shortly."
              : "We are reading the inspection report and preparing the details for your review."}
          </p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-2" aria-hidden="true">
          <div className="h-2 w-full animate-pulse rounded-full bg-primary/20" />
          <div className="h-2 w-4/5 animate-pulse rounded-full bg-primary/15" />
          <div className="h-2 w-3/5 animate-pulse rounded-full bg-primary/10" />
        </div>
        <Button asChild variant="ghost">
          <Link href="/dashboard">Return to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
