import { z } from 'zod';

/**
 * One physical page of the source PDF, extracted as plain text. 1-indexed
 * to match pdf-parse's own page numbering.
 */
export const documentPageSchema = z.object({
  pageNumber: z.number().int().min(1),
  content: z.string(),
});

export const parsedDocumentSchema = z.object({
  pages: z.array(documentPageSchema),
});

export type DocumentPage = z.infer<typeof documentPageSchema>;
export type ParsedDocument = z.infer<typeof parsedDocumentSchema>;
