"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

import {
  confirmEstimateIdentityAction,
  selectEstimateTimeframeAction,
} from "../api/actions";
import type { IntakeIdentity } from "@/features/estimate-extraction-pipeline/intake";
import { Button } from "@/design-systems/shadcn/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/design-systems/shadcn/components/card";
import { Input } from "@/design-systems/shadcn/components/input";
import { Label } from "@/design-systems/shadcn/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/design-systems/shadcn/components/select";

const IDENTITY_FIELDS: Array<{ key: keyof IntakeIdentity; label: string }> = [
  { key: "propertyAddress", label: "Property address" },
  { key: "zipCode", label: "ZIP code" },
  { key: "agentName", label: "Agent" },
  { key: "homeownerName", label: "Homeowner" },
  { key: "inspectorName", label: "Inspector" },
];

const TIMEFRAME_OPTIONS = [
  "ASAP (24-48 hours)",
  "This Week (2-7 days)",
  "Next week (1-2 weeks)",
  "No rush (2-4 weeks)",
] as const;

interface EstimateConfirmationViewProps {
  estimateRequestId: string;
  identity: IntakeIdentity;
  phase: "identity" | "timeframe";
}

export function EstimateConfirmationView({
  estimateRequestId,
  identity,
  phase,
}: EstimateConfirmationViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<IntakeIdentity>(identity);
  const [timeframe, setTimeframe] = useState("");

  const submitIdentity = () => {
    const formData = new FormData();
    formData.set("estimateRequestId", estimateRequestId);
    for (const [key, value] of Object.entries(values)) {
      formData.set(key, value);
    }

    startTransition(async () => {
      const result = await confirmEstimateIdentityAction(formData);
      if (!result.success) {
        toast.error(result.error ?? "Unable to confirm identity.");
        return;
      }

      toast.success(result.message ?? "Identity confirmed.");
      router.refresh();
    });
  };

  const submitTimeframe = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData();
    formData.set("estimateRequestId", estimateRequestId);
    formData.set("timeframe", timeframe);

    startTransition(async () => {
      const result = await selectEstimateTimeframeAction(formData);
      if (!result.success) {
        toast.error(result.error ?? "Unable to save timeframe.");
        return;
      }

      toast.success(result.message ?? "Estimate processing has resumed.");
      router.refresh();
    });
  };

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader className="space-y-5">
        <IntakeProgress activeStep={phase === "identity" ? 1 : 2} />
        <div className="space-y-2">
          <CardTitle>
            {phase === "identity" ? "Review inspection details" : "Choose your repair timeframe"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {phase === "identity"
              ? "Confirm the details extracted from your inspection report before we continue."
              : "Tell us when you expect to complete the repairs so we can finish your estimate."}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {phase === "identity" ? (
          editing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitIdentity();
              }}
              className="space-y-5"
            >
              {IDENTITY_FIELDS.map(({ key, label }) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{label}</Label>
                  <Input
                    id={key}
                    value={values[key]}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [key]: event.target.value }))
                    }
                    required
                  />
                </div>
              ))}
              <div className="flex flex-wrap gap-3 pt-2">
                <Button type="submit" disabled={pending}>
                  {pending ? "Continuing..." : "Continue"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditing(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-5">
              <dl className="divide-y rounded-lg border">
                {IDENTITY_FIELDS.map(({ key, label }) => (
                  <div key={key} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
                    <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
                    <dd className="text-sm text-foreground">{values[key]}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button type="button" onClick={submitIdentity} disabled={pending}>
                  {pending ? "Continuing..." : "Continue"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(true)}
                  disabled={pending}
                >
                  Edit
                </Button>
              </div>
            </div>
          )
        ) : (
          <form onSubmit={submitTimeframe} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="timeframe">Repair timeframe</Label>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger id="timeframe">
                  <SelectValue placeholder="Select timeframe" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEFRAME_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={pending || !timeframe}>
              {pending ? "Continuing..." : "Continue"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function IntakeProgress({ activeStep }: { activeStep: 1 | 2 }) {
  return (
    <ol className="grid grid-cols-2 gap-3" aria-label="Estimate intake progress">
      {["Review details", "Repair timeframe"].map((label, index) => {
        const step = (index + 1) as 1 | 2;
        const active = step === activeStep;
        const complete = step < activeStep;

        return (
          <li key={label} className="flex items-center gap-2 text-sm">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                active || complete
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              {step}
            </span>
            <span className={active ? "font-medium text-foreground" : "text-muted-foreground"}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
