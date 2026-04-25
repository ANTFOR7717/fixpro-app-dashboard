"use client";

import { uploadEstimatePdfAction } from "../api/actions";
import { Upload } from "lucide-react";

export function EstimateView() {
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

      <form action={uploadEstimatePdfAction} className="grid gap-6 p-1 bg-card rounded-2xl shadow-sm border">
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
        <button 
          type="submit"
          className="bg-primary text-primary-foreground h-12 rounded-xl font-semibold hover:opacity-90 transition-opacity"
        >
          Process Estimate
        </button>
      </form>
    </div>
  );
}
