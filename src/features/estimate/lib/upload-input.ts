import { z } from "zod";

export const uploadInputSchema = z.object({
  blobUrl: z.string().url(),
  fileName: z.string().min(1).max(255),
  fileSize: z.string().regex(/^\d+$/, "fileSize must be a positive integer"),
});

export type UploadInput = z.infer<typeof uploadInputSchema>;

export type ParseResult =
  | {
      ok: true;
      data: UploadInput;
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

  return { ok: true, data: parsed.data };
}
