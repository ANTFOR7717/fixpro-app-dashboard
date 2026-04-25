"use client";

import { useActionState } from "react";
import { uploadEstimatePdfAction } from "../api/actions";
import { Upload, Loader2, CheckCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button 
      type="submit"
      disabled={pending}
      className="bg-primary text-primary-foreground h-12 rounded-xl font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-70"
    >
      {pending ? (
        <>
          <Loader2 className="h-5 w-5 animate-spin" />
          Uploading...
        </>
      ) : (
        "Process Estimate"
      )}
    </button>
  );
}

export function EstimateView() {
  const [state, action] = useActionState(uploadEstimatePdfAction, null);

  return (
    <div className="max-w-3xl space-y-8 animate-in fade-in duration-500 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Get Repair Estimate
        </h1>
        <p className="text-muted-foreground">
          Upload your inspection report (PDF) and our automated system will process a repair estimate.
        </p>
      </div>

      <form action={action} className="grid gap-6 p-1 bg-card rounded-2xl shadow-sm border">
        {state?.success && (
          <div className="bg-green-500/10 text-green-600 border border-green-500/20 p-4 rounded-xl flex items-center gap-3 font-medium m-1 mb-0">
            <CheckCircle className="h-5 w-5" />
            {state.message}
          </div>
        )}
        
        {state?.error && (
          <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-xl font-medium m-1 mb-0">
            {state.error}
          </div>
        )}

        <div className="space-y-4 p-8 border-2 border-dashed border-border rounded-xl bg-muted/50 flex flex-col items-center justify-center text-center">
          <Upload className="h-10 w-10 text-muted-foreground mb-2" />
          <input 
            type="file" 
            name="file" 
            accept="application/pdf"
            className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 w-full max-w-xs cursor-pointer"
            required
          />
        </div>
        <SubmitButton />
      </form>
    </div>
  );
}
