import { Mastra } from '@mastra/core/mastra';
import { billableItemExtractorAgent } from './agents/billable-item-extractor';
import { itemPricerAgent } from './agents/item-pricer';
import { summarizeEstimateWorkflow } from './workflows/summarize-estimate';

export const mastra = new Mastra({
  agents: {
    'billable-item-extractor': billableItemExtractorAgent,
    'item-pricer': itemPricerAgent,
  },
  workflows: { 'summarize-estimate': summarizeEstimateWorkflow },
});
