import { Mastra } from '@mastra/core/mastra';
import { billableItemExtractorAgent } from './agents/billable-item-extractor';
import { summarizeEstimateWorkflow } from './workflows/summarize-estimate';

export const mastra = new Mastra({
  agents: { 'billable-item-extractor': billableItemExtractorAgent },
  workflows: { 'summarize-estimate': summarizeEstimateWorkflow },
});
