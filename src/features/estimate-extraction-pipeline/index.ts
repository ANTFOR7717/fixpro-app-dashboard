import { Mastra } from '@mastra/core/mastra';
import { billableItemExtractorAgent } from './extraction';
import { itemPricerAgent } from './pricing';
import { summarizeEstimateWorkflow } from './pipeline';

/**
 * Registration only. This is the one file in the codebase allowed to
 * import an Agent instance from a module other than the module that owns
 * it — because registering with Studio is Mastra's own framework
 * boundary, not a peer-module dependency. Nothing here calls `.generate()`
 * on either agent; that only ever happens inside extraction/index.ts and
 * pricing/price-line.ts respectively.
 */
export const mastra = new Mastra({
  agents: {
    'billable-item-extractor': billableItemExtractorAgent,
    'item-pricer': itemPricerAgent,
  },
  workflows: { 'summarize-estimate': summarizeEstimateWorkflow },
});
