"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { uploadEstimatePdfAction } from "../api/actions";
import { ContactPicker } from "@/features/contacts/components/contact-picker";
import type { Contact } from "@/features/contacts/db/schema";
import { Upload, Loader2 as Spinner } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Input } from "@/design-systems/shadcn/components/input";
import { Label } from "@/design-systems/shadcn/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/design-systems/shadcn/components/select";
import { Card, CardContent } from "@/design-systems/shadcn/components/card";
import { Button } from "@/design-systems/shadcn/components/button";
import { Separator } from "@/design-systems/shadcn/components/separator";

const TIMEFRAME_OPTIONS = [
  "ASAP (24-48 hours)",
  "This Week (2-7 days)",
  "Next week (1-2 weeks)",
  "No rush (2-4 weeks)"
] as const;

const estimateSchema = z.object({
  submitterRole: z.enum(["agent", "homeowner"]),
  listingAgentName: z.string().min(1, "Listing agent name is required"),
  listingAgentPhone: z.string().min(1, "Listing agent cell number is required"),
  listingAgentEmail: z.string().email("Invalid listing agent email"),
  buyerAgentName: z.string().min(1, "Buyer agent name is required"),
  buyerAgentPhone: z.string().min(1, "Buyer agent cell number is required"),
  buyerAgentEmail: z.string().email("Invalid buyer agent email"),
  propertyAddress: z.string().min(1, "Property address is required"),
  zipCode: z.string().min(1, "Zip code is required"),
  timeframe: z.enum(TIMEFRAME_OPTIONS, { message: "Please select a timeframe" }),
});

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="h-10 w-full text-sm font-semibold"
    >
      {pending ? (
        <>
          <Spinner className="h-5 w-5 animate-spin mr-2" />
          Processing...
        </>
      ) : (
        "Process Estimate"
      )}
    </Button>
  );
}

interface EstimateViewProps {
  contacts: Contact[];
}

export function EstimateView({ contacts }: EstimateViewProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveListingAsContact, setSaveListingAsContact] = useState(false);
  const [saveBuyerAsContact, setSaveBuyerAsContact] = useState(false);
  const { register, setValue, handleSubmit, formState: { errors } } = useForm<z.infer<typeof estimateSchema>>({
    resolver: zodResolver(estimateSchema),
    defaultValues: {
      submitterRole: "agent",
      listingAgentName: "",
      listingAgentPhone: "",
      listingAgentEmail: "",
      buyerAgentName: "",
      buyerAgentPhone: "",
      buyerAgentEmail: "",
      propertyAddress: "",
      zipCode: "",
      timeframe: "ASAP (24-48 hours)",
    }
  });

  const onSubmit = async (data: z.infer<typeof estimateSchema>) => {
    // Synchronous re-entrancy guard. Even if React batching delays the
    // state update, the ref blocks the second click immediately.
    if (submittingRef.current) return;
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    submittingRef.current = true;
    setSubmitting(true);

    const toastId = toast.loading("Uploading estimate...");
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
        toast.error(error instanceof Error ? error.message : "Upload failed.", { id: toastId });
        return;
      }

      const formData = new FormData();
      formData.append("blobUrl", blobUrl);
      formData.append("fileName", file.name);
      formData.append("fileSize", String(file.size));
      for (const [key, value] of Object.entries(data)) {
        formData.append(key, value);
      }
      if (saveListingAsContact) formData.append("saveListingAsContact", "1");
      if (saveBuyerAsContact) formData.append("saveBuyerAsContact", "1");

      const result = await uploadEstimatePdfAction(null, formData);
      if (!result.success) {
        toast.error(result.error ?? "Failed to upload file.", { id: toastId });
        return;
      }

      toast.success(result.message ?? "Upload complete! Your estimate is processing.", { id: toastId });
      router.replace("/dashboard");
      router.refresh();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 p-0">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Get Repair Estimate</h1>
        <p className="text-muted-foreground">Provide information and upload your inspection report (PDF).</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card className="shadow-none">
          <CardContent className="space-y-8 pt-6">
            <div className="space-y-6">
              {/* Role Selection */}
              <div className="space-y-2">
                <Label>I am the: *</Label>
                <Select
                  onValueChange={(v) => setValue("submitterRole", v as "agent" | "homeowner")}
                  defaultValue="agent"
                >
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select your role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">Real Estate Agent</SelectItem>
                    <SelectItem value="homeowner">Homeowner</SelectItem>
                  </SelectContent>
                </Select>
                <input type="hidden" {...register("submitterRole")} />
              </div>

              <Separator />

              {/* Agents Grid */}
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Listing Agent Information</Label>
                  <ContactPicker
                    label="Use saved contact"
                    contacts={contacts}
                    onSelect={(c) => {
                      setValue("listingAgentName", c.fullName, { shouldValidate: true });
                      setValue("listingAgentPhone", c.phone, { shouldValidate: true });
                      setValue("listingAgentEmail", c.email, { shouldValidate: true });
                    }}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="listingAgentName">Full Name *</Label>
                    <Input id="listingAgentName" {...register("listingAgentName")} />
                    {errors.listingAgentName && <p className="text-xs text-destructive">{errors.listingAgentName.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="listingAgentPhone">Cell Number *</Label>
                    <Input id="listingAgentPhone" type="tel" {...register("listingAgentPhone")} />
                    {errors.listingAgentPhone && <p className="text-xs text-destructive">{errors.listingAgentPhone.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="listingAgentEmail">Email *</Label>
                    <Input id="listingAgentEmail" type="email" {...register("listingAgentEmail")} />
                    {errors.listingAgentEmail && <p className="text-xs text-destructive">{errors.listingAgentEmail.message}</p>}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={saveListingAsContact}
                      onChange={(e) => setSaveListingAsContact(e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    Save listing agent as a contact
                  </label>
                </div>

                <div className="space-y-4">
                  <Label className="text-base font-semibold">Buyer Agent Information</Label>
                  <ContactPicker
                    label="Use saved contact"
                    contacts={contacts}
                    onSelect={(c) => {
                      setValue("buyerAgentName", c.fullName, { shouldValidate: true });
                      setValue("buyerAgentPhone", c.phone, { shouldValidate: true });
                      setValue("buyerAgentEmail", c.email, { shouldValidate: true });
                    }}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="buyerAgentName">Full Name *</Label>
                    <Input id="buyerAgentName" {...register("buyerAgentName")} />
                    {errors.buyerAgentName && <p className="text-xs text-destructive">{errors.buyerAgentName.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="buyerAgentPhone">Cell Number *</Label>
                    <Input id="buyerAgentPhone" type="tel" {...register("buyerAgentPhone")} />
                    {errors.buyerAgentPhone && <p className="text-xs text-destructive">{errors.buyerAgentPhone.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="buyerAgentEmail">Email *</Label>
                    <Input id="buyerAgentEmail" type="email" {...register("buyerAgentEmail")} />
                    {errors.buyerAgentEmail && <p className="text-xs text-destructive">{errors.buyerAgentEmail.message}</p>}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={saveBuyerAsContact}
                      onChange={(e) => setSaveBuyerAsContact(e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    Save buyer agent as a contact
                  </label>
                </div>
              </div>

              <Separator />

              {/* Property Details */}
              <div className="space-y-4">
                <Label className="text-base font-semibold">Property Details</Label>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="propertyAddress">Property Address *</Label>
                    <Input id="propertyAddress" {...register("propertyAddress")} />
                    {errors.propertyAddress && <p className="text-xs text-destructive">{errors.propertyAddress.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zipCode">Zip code *</Label>
                    <Input id="zipCode" {...register("zipCode")} />
                    {errors.zipCode && <p className="text-xs text-destructive">{errors.zipCode.message}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>What is your time frame for COMPLETING these repairs? *</Label>
                  <Select
                    onValueChange={(v) => setValue("timeframe", v as (typeof TIMEFRAME_OPTIONS)[number])}
                    defaultValue="ASAP (24-48 hours)"
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select timeframe" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ASAP (24-48 hours)">ASAP (24-48 hours)</SelectItem>
                      <SelectItem value="This Week (2-7 days)">This Week (2-7 days)</SelectItem>
                      <SelectItem value="Next week (1-2 weeks)">Next week (1-2 weeks)</SelectItem>
                      <SelectItem value="No rush (2-4 weeks)">No rush (2-4 weeks)</SelectItem>
                    </SelectContent>
                  </Select>
                  <input type="hidden" {...register("timeframe")} />
                  {errors.timeframe && <p className="text-xs text-destructive">{errors.timeframe.message}</p>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col items-center justify-center rounded-lg border bg-card p-6 text-center">
          <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
          <input
            type="file"
            name="file"
            ref={fileInputRef}
            accept="application/pdf"
            className="w-full max-w-sm cursor-pointer text-sm text-muted-foreground file:mr-4 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
            required
          />
        </div>

        <SubmitButton pending={submitting} />
      </form>
    </div>
  );
}
