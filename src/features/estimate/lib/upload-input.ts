import { z } from "zod";

export const uploadInputSchema = z.object({
  blobUrl: z.string().url(),
  fileName: z.string().min(1).max(255),
  fileSize: z.string().regex(/^\d+$/, "fileSize must be a positive integer"),
  submitterRole: z.enum(["agent", "homeowner"]),
  listingAgentName: z.string().min(1),
  listingAgentPhone: z.string().min(1),
  listingAgentEmail: z.string().email(),
  buyerAgentName: z.string().min(1),
  buyerAgentPhone: z.string().min(1),
  buyerAgentEmail: z.string().email(),
  propertyAddress: z.string().min(1),
  zipCode: z.string().length(5),
  timeframe: z.string().min(1),
});

export type UploadInput = z.infer<typeof uploadInputSchema>;

export type ParseResult =
  | {
      ok: true;
      data: UploadInput;
      saveListingAsContact: boolean;
      saveBuyerAsContact: boolean;
    }
  | { ok: false; error: string };

export function parseUploadInput(formData: FormData): ParseResult {
  const parsed = uploadInputSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: `Validation Error - ${first.path.join(".")}: ${first.message}`,
    };
  }

  return {
    ok: true,
    data: parsed.data,
    saveListingAsContact: formData.get("saveListingAsContact") === "1",
    saveBuyerAsContact: formData.get("saveBuyerAsContact") === "1",
  };
}
