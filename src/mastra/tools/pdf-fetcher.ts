import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const pdfFetcherTool = createTool({
  id: 'pdf-fetcher',
  description: 'Fetches a PDF and returns a base64 data URL.',
  inputSchema: z.object({ url: z.string().url() }),
  execute: async (inputData) => {
    const res = await fetch(inputData.url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    return { base64: buffer.toString('base64') };
  },
});
