import { Mastra } from '@mastra/core/mastra';
import { estimateSummarizerAgent } from './agents/estimate-summarizer';
import { summarizeEstimateWorkflow } from './workflows/summarize-estimate';

export const mastra = new Mastra({
  agents: { 'estimate-summarizer': estimateSummarizerAgent },
  workflows: { 'summarize-estimate': summarizeEstimateWorkflow },
});