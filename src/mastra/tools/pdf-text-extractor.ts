import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import pdfParse from 'pdf-parse';

export const pdfTextExtractorTool = createTool({
  id: 'pdf-text-extractor',
  description: 'Extracts text content from a PDF buffer.',
  inputSchema: z.object({ buffer: z.instanceof(Buffer) }),
  execute: async (inputData) => {
    const data = await pdfParse(inputData.buffer);
    return { text: data.text };
  },
});
