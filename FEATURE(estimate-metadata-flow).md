# FEATURE(estimate-metadata-flow)

## Request
Implement a metadata-first submission flow for the Repair Estimate feature. Users must provide property, contact, and timeline information before uploading their inspection report PDF. This must strictly follow the existing `shadcn/ui` patterns and project styling, with zero custom design flourishes.

## Directory Map
```text
src/
  features/
    estimate/
      api/
        actions.ts                  (modify)
      components/
        estimate-view.tsx           (modify)
      db/
        schema.ts                   (modify)
```

## Modification Table
| File | Action | Why |
|---|---|---|
| `src/features/estimate/db/schema.ts` | modify | Add metadata columns (role, agents, address, zip, timeframe) to `estimate_requests`. |
| `src/features/estimate/api/actions.ts` | modify | Update `uploadEstimatePdfAction` to store new metadata fields. |
| `src/features/estimate/components/estimate-view.tsx` | modify | Implement the metadata-first form using existing project patterns (shadcn/ui, react-hook-form). |

## Existing Pattern Audit
- **Forms**: The project uses `react-hook-form` with `zod` and `shadcn/ui` components (`src/features/auth/components/login-form.tsx`).
- **UI Components**: Standard `shadcn/ui` components located in `src/design-systems/shadcn/components`.
- **Icons**: `lucide-react` is used sparingly.
- **Styling**: Standard Tailwind utilities with project-defined `bg-card`, `rounded-xl`, and `shadow-sm`.
- **Database**: Drizzle ORM for schema and queries.

## Execution Plan

### Step 1 — Database Schema Update
Add the required metadata columns to the `estimate_requests` table.
- **Files**: `src/features/estimate/db/schema.ts`

### Step 2 — Server Action Update
Extend the server action to handle the additional form data.
- **Files**: `src/features/estimate/api/actions.ts`

### Step 3 — Form Implementation
Refactor `EstimateView` to include the mandatory fields. Use the standard `shadcn/ui` form pattern found in the `auth` feature.
- **Files**: `src/features/estimate/components/estimate-view.tsx`

## File-by-File Changes

### `src/features/estimate/db/schema.ts`
**Action:** Modify  
**Why:** Store mandatory metadata for estimate requests.  
**Impact:** Extends the schema with 10 new columns.

#### Before
```ts
export const estimateRequestTable = pgTable("estimate_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  fileUrl: text("file_url").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: text("file_size").notNull(),
  status: varchar("status", { length: 50 }).default("processing").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

#### After
```ts
export const estimateRequestTable = pgTable("estimate_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  fileUrl: text("file_url").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: text("file_size").notNull(),
  status: varchar("status", { length: 50 }).default("processing").notNull(),
  
  // Metadata
  submitterRole: varchar("submitter_role", { length: 50 }).notNull(), // 'agent' | 'homeowner'
  listingAgentName: varchar("listing_agent_name", { length: 255 }).notNull(),
  listingAgentPhone: varchar("listing_agent_phone", { length: 50 }).notNull(),
  listingAgentEmail: varchar("listing_agent_email", { length: 255 }).notNull(),
  buyerAgentName: varchar("buyer_agent_name", { length: 255 }).notNull(),
  buyerAgentPhone: varchar("buyer_agent_phone", { length: 50 }).notNull(),
  buyerAgentEmail: varchar("buyer_agent_email", { length: 255 }).notNull(),
  propertyAddress: text("property_address").notNull(),
  zipCode: varchar("zip_code", { length: 20 }).notNull(),
  timeframe: text("timeframe").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

#### Reasoning
- Direct alignment with requested data points.
- Uses standard Drizzle types consistent with the existing table.

---

### `src/features/estimate/api/actions.ts`
**Action:** Modify  
**Why:** Persist the new metadata fields.  
**Impact:** Updates the DB insertion logic.

#### Before
```ts
    await db.insert(estimateRequestTable).values({
      userId: session.user.id,
      fileUrl: blob.url,
      fileName: file.name,
      fileSize: file.size.toString(),
      status: "processing",
    });
```

#### After
```ts
    await db.insert(estimateRequestTable).values({
      userId: session.user.id,
      fileUrl: blob.url,
      fileName: file.name,
      fileSize: file.size.toString(),
      status: "processing",
      submitterRole: formData.get("submitterRole") as string,
      listingAgentName: formData.get("listingAgentName") as string,
      listingAgentPhone: formData.get("listingAgentPhone") as string,
      listingAgentEmail: formData.get("listingAgentEmail") as string,
      buyerAgentName: formData.get("buyerAgentName") as string,
      buyerAgentPhone: formData.get("buyerAgentPhone") as string,
      buyerAgentEmail: formData.get("buyerAgentEmail") as string,
      propertyAddress: formData.get("propertyAddress") as string,
      zipCode: formData.get("zipCode") as string,
      timeframe: formData.get("timeframe") as string,
    });
```

#### Reasoning
- Extracts values from `FormData` alongside the file.

---

### `src/features/estimate/components/estimate-view.tsx`
**Action:** Modify  
**Why:** Implement the mandatory metadata form using standard project patterns.  
**Impact:** Replaces the simple upload with a structured, validated form.

#### Before
```tsx
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
        {/* ... error/success messages ... */}
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
```

#### After
```tsx
"use client";

import { useActionState } from "react";
import { uploadEstimatePdfAction } from "../api/actions";
import { Upload, Loader2 as Spinner, CheckCircle } from "lucide-react";
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
  timeframe: z.enum([
    "ASAP (24-48 hours)",
    "This Week (2-7 days)",
    "Next week (1-2 weeks)",
    "No rush (2-4 weeks)"
  ], { required_error: "Please select a timeframe" }),
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
  const [state, action] = useActionState(uploadEstimatePdfAction, null);
  const { register, setValue, formState: { errors } } = useForm<z.infer<typeof estimateSchema>>({
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
      timeframe: "ASAP (24-48 hours)" as any,
    }
  });

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Get Repair Estimate</h1>
        <p className="text-muted-foreground">Provide information and upload your inspection report (PDF).</p>
      </div>

      <form action={action} className="space-y-6">
        <FormError message={state?.error || ""} />
        <FormSuccess message={state?.message || ""} />

        <Card>
          <CardContent className="pt-6 space-y-8">
            <div className="space-y-6">
              {/* Role Selection */}
              <div className="space-y-2">
                <Label>I am the: *</Label>
                <Select 
                  onValueChange={(v) => setValue("submitterRole", v)} 
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
                    {errors.listingAgentName && <p className="text-xs text-red-500">{errors.listingAgentName.message as string}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="listingAgentPhone">Cell Number *</Label>
                    <Input id="listingAgentPhone" type="tel" {...register("listingAgentPhone")} />
                    {errors.listingAgentPhone && <p className="text-xs text-red-500">{errors.listingAgentPhone.message as string}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="listingAgentEmail">Email *</Label>
                    <Input id="listingAgentEmail" type="email" {...register("listingAgentEmail")} />
                    {errors.listingAgentEmail && <p className="text-xs text-red-500">{errors.listingAgentEmail.message as string}</p>}
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="text-lg font-bold">Buyer Agent Information</Label>
                  <div className="space-y-2">
                    <Label htmlFor="buyerAgentName">Full Name *</Label>
                    <Input id="buyerAgentName" {...register("buyerAgentName")} />
                    {errors.buyerAgentName && <p className="text-xs text-red-500">{errors.buyerAgentName.message as string}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="buyerAgentPhone">Cell Number *</Label>
                    <Input id="buyerAgentPhone" type="tel" {...register("buyerAgentPhone")} />
                    {errors.buyerAgentPhone && <p className="text-xs text-red-500">{errors.buyerAgentPhone.message as string}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="buyerAgentEmail">Email *</Label>
                    <Input id="buyerAgentEmail" type="email" {...register("buyerAgentEmail")} />
                    {errors.buyerAgentEmail && <p className="text-xs text-red-500">{errors.buyerAgentEmail.message as string}</p>}
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
                    {errors.propertyAddress && <p className="text-xs text-red-500">{errors.propertyAddress.message as string}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zipCode">Zip code *</Label>
                    <Input id="zipCode" {...register("zipCode")} />
                    {errors.zipCode && <p className="text-xs text-red-500">{errors.zipCode.message as string}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>What is your time frame for COMPLETING these repairs? *</Label>
                  <Select 
                    onValueChange={(v) => setValue("timeframe", v)}
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
                  {errors.timeframe && <p className="text-xs text-red-500">{errors.timeframe.message as string}</p>}
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
```

#### Reasoning
- Strictly follows the `Card`, `Label`, `Input` pattern seen in the `auth` feature.
- Removes all custom animations, gradients, and non-standard spacing.
- Uses standard `shadcn/ui` components for consistency.

## Validation Plan
- **DB Check**: Verify new columns in `estimate_requests`.
- **Form Submission**: Test submitting with and without required fields.
- **Data Integrity**: Verify that both the PDF and all metadata are stored correctly in the database.

## Risk Notes
- None. This is a standard extension of the existing feature.

## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
