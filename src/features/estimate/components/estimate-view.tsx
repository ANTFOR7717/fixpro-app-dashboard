"use client";

import { useRef, useState, type FormEvent } from "react";
import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { FileSearch, Loader2 as Spinner, Upload } from "lucide-react";

import { uploadEstimatePdfAction } from "../api/actions";
import { Card, CardContent } from "@/design-systems/shadcn/components/card";
import { Button } from "@/design-systems/shadcn/components/button";

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="h-12 w-full text-lg font-semibold"
    >
      {pending ? (
        <>
          <Spinner className="mr-2 h-5 w-5 animate-spin" />
          Processing...
        </>
      ) : (
        "Process Estimate"
      )}
    </Button>
  );
}

export function EstimateView() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("Uploading your PDF...");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;

    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    submittingRef.current = true;
    setSubmitting(true);
    setUploadStatus("Uploading your PDF...");
    let navigatingToEstimate = false;

    try {
      let blobUrl: string;
      try {
        const sanitized = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const result = await upload(`estimates/${Date.now()}-${sanitized}`, file, {
          access: "public",
          contentType: "application/pdf",
          handleUploadUrl: "/api/estimate/upload",
        });
        blobUrl = result.url;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed.");
        return;
      }

      setUploadStatus("Upload received. Starting analysis...");
      const formData = new FormData();
      formData.append("blobUrl", blobUrl);
      formData.append("fileName", file.name);
      formData.append("fileSize", String(file.size));

      const result = await uploadEstimatePdfAction(null, formData);
      if (!result.success) {
        toast.error(result.error ?? "Failed to upload file.");
        return;
      }

      if (!result.estimateRequestId) {
        toast.error("Upload completed without an estimate ID.");
        return;
      }

      navigatingToEstimate = true;
      router.replace(`/dashboard/estimate/${result.estimateRequestId}/intake`);
    } finally {
      submittingRef.current = false;
      if (!navigatingToEstimate) setSubmitting(false);
    }
  };

  if (submitting) {
    return <EstimateUploadLoading status={uploadStatus} />;
  }

  return (
    <div className="w-full space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight">
          Get Repair Estimate
        </h1>
        <p className="text-muted-foreground">
          Upload your inspection report and we&apos;ll extract the estimate details.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="text-lg font-bold">Inspection report</h2>
              <p className="text-sm text-muted-foreground">
                Upload a PDF. We&apos;ll ask you to confirm the extracted details next.
              </p>
            </div>
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/50 p-8 text-center">
              <Upload className="mb-2 h-10 w-10 text-muted-foreground" />
              <input
                type="file"
                name="file"
                ref={fileInputRef}
                accept="application/pdf,.pdf"
                className="w-full max-w-xs cursor-pointer file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
                required
              />
            </div>
          </CardContent>
        </Card>

        <SubmitButton pending={submitting} />
      </form>
    </div>
  );
}

function EstimateUploadLoading({ status }: { status: string }) {
  return (
    <div className="flex w-full max-w-3xl items-center justify-center py-10">
      <Card className="w-full max-w-2xl overflow-hidden">
        <CardContent className="flex flex-col items-center gap-6 px-6 py-16 text-center">
          <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl border border-primary/20 bg-primary/5">
            <FileSearch className="h-11 w-11 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Analyzing your PDF</h1>
            <p className="max-w-md text-sm text-muted-foreground">{status}</p>
          </div>
          <div className="flex w-full max-w-sm flex-col gap-2" aria-hidden="true">
            <div className="h-2 w-full animate-pulse rounded-full bg-primary/20" />
            <div className="h-2 w-4/5 animate-pulse rounded-full bg-primary/15" />
            <div className="h-2 w-3/5 animate-pulse rounded-full bg-primary/10" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
