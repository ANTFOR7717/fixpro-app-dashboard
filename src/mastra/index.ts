import { Mastra } from '@mastra/core/mastra';
import { estimateSummarizerAgent } from './agents/estimate-summarizer';
import { pdfFetcherTool } from './tools/pdf-fetcher';
import { pdfTextExtractorTool } from './tools/pdf-text-extractor';
import { dbSummaryUpdaterTool } from './tools/db-summary-updater';
import { summarizeEstimateWorkflow } from './workflows/summarize-estimate';

// Load environment variables for the Mastra Studio/Playground
import 'dotenv/config';

export const mastra = new Mastra({
  agents: { 'estimate-summarizer': estimateSummarizerAgent },
  tools: {
    'pdf-fetcher': pdfFetcherTool,
    'pdf-text-extractor': pdfTextExtractorTool,
    'db-summary-updater': dbSummaryUpdaterTool
  },
  workflows: { 'summarize-estimate': summarizeEstimateWorkflow },
});