"use client";

import { useActionState, startTransition, useRef } from "react";
import { uploadEstimatePdfAction } from "../api/actions";
import { Upload, Loader2 as Spinner } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Input } from "@/design-systems/shadcn/components/input";
import { Label } from "@/design-systems/shadcn/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/design-systems/shadcn/components/select";
import { Card, CardContent } from "@/design-systems/shadcn/components/card";
import { FormError, FormSuccess } from "@/design-systems/shadcn/components/form-messages";
import { Button } from "@/design-systems/shadcn/components/button";
import { Separator } from "@/design-systems/shadcn/components/separator";
import { useFormStatus } from "react-dom";

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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="w-full h-12 text-lg font-semibold"
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

export function EstimateView() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, action] = useActionState(uploadEstimatePdfAction, null);
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

  const onSubmit = (data: z.infer<typeof estimateSchema>) => {
    const formData = new FormData();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    formData.append("file", file);
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value);
    });

    startTransition(() => {
      action(formData);
    });
  };

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Get Repair Estimate</h1>
        <p className="text-muted-foreground">Provide information and upload your inspection report (PDF).</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <FormError message={state?.error || ""} />
        <FormSuccess message={state?.message || ""} />

        <Card>
          <CardContent className="pt-6 space-y-8">
            <div className="space-y-6">
              {/* Role Selection */}
              <div className="space-y-2">
                <Label>I am the: *</Label>
                <Select
                  onValueChange={(v) => setValue("submitterRole", v as "agent" | "homeowner")}
                  defaultValue="agent"
                >
                  <SelectTrigger><SelectValue placeholder="Select your role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">Real Estate Agent</SelectItem>
                    <SelectItem value="homeowner">Homeowner</SelectItem>
                  </SelectContent>
                </Select>
                <input type="hidden" {...register("submitterRole")} />
              </div>

              <Separator />

              {/* Agents Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <Label className="text-lg font-bold">Listing Agent Information</Label>
                  <div className="space-y-2">
                    <Label htmlFor="listingAgentName">Full Name *</Label>
                    <Input id="listingAgentName" {...register("listingAgentName")} />
                    {errors.listingAgentName && <p className="text-xs text-red-500">{errors.listingAgentName.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="listingAgentPhone">Cell Number *</Label>
                    <Input id="listingAgentPhone" type="tel" {...register("listingAgentPhone")} />
                    {errors.listingAgentPhone && <p className="text-xs text-red-500">{errors.listingAgentPhone.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="listingAgentEmail">Email *</Label>
                    <Input id="listingAgentEmail" type="email" {...register("listingAgentEmail")} />
                    {errors.listingAgentEmail && <p className="text-xs text-red-500">{errors.listingAgentEmail.message}</p>}
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="text-lg font-bold">Buyer Agent Information</Label>
                  <div className="space-y-2">
                    <Label htmlFor="buyerAgentName">Full Name *</Label>
                    <Input id="buyerAgentName" {...register("buyerAgentName")} />
                    {errors.buyerAgentName && <p className="text-xs text-red-500">{errors.buyerAgentName.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="buyerAgentPhone">Cell Number *</Label>
                    <Input id="buyerAgentPhone" type="tel" {...register("buyerAgentPhone")} />
                    {errors.buyerAgentPhone && <p className="text-xs text-red-500">{errors.buyerAgentPhone.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="buyerAgentEmail">Email *</Label>
                    <Input id="buyerAgentEmail" type="email" {...register("buyerAgentEmail")} />
                    {errors.buyerAgentEmail && <p className="text-xs text-red-500">{errors.buyerAgentEmail.message}</p>}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Property Details */}
              <div className="space-y-4">
                <Label className="text-lg font-bold">Property Details</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="propertyAddress">Property Address *</Label>
                    <Input id="propertyAddress" {...register("propertyAddress")} />
                    {errors.propertyAddress && <p className="text-xs text-red-500">{errors.propertyAddress.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zipCode">Zip code *</Label>
                    <Input id="zipCode" {...register("zipCode")} />
                    {errors.zipCode && <p className="text-xs text-red-500">{errors.zipCode.message}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>What is your time frame for COMPLETING these repairs? *</Label>
                  <Select
                    onValueChange={(v) => setValue("timeframe", v as (typeof TIMEFRAME_OPTIONS)[number])}
                    defaultValue="ASAP (24-48 hours)"
                  >
                    <SelectTrigger><SelectValue placeholder="Select timeframe" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ASAP (24-48 hours)">ASAP (24-48 hours)</SelectItem>
                      <SelectItem value="This Week (2-7 days)">This Week (2-7 days)</SelectItem>
                      <SelectItem value="Next week (1-2 weeks)">Next week (1-2 weeks)</SelectItem>
                      <SelectItem value="No rush (2-4 weeks)">No rush (2-4 weeks)</SelectItem>
                    </SelectContent>
                  </Select>
                  <input type="hidden" {...register("timeframe")} />
                  {errors.timeframe && <p className="text-xs text-red-500">{errors.timeframe.message}</p>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="p-8 border-2 border-dashed border-border rounded-xl bg-muted/50 flex flex-col items-center justify-center text-center">
          <Upload className="h-10 w-10 text-muted-foreground mb-2" />
          <input
            type="file"
            name="file"
            ref={fileInputRef}
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
