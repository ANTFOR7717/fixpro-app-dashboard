import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { findingExtractorAgent } from './extraction';
import { materialsAgent, laborAgent, tradeAgent } from './classification';
import { enrichmentAgent } from './enrichment';
import { summarizeEstimateWorkflow } from './pipeline';

/**
 * Registration only. This is the one file in the codebase allowed to
 * import an Agent instance from a module other than the module that owns
 * it — because registering with Studio is Mastra's own framework
 * boundary, not a peer-module dependency. Nothing anywhere in the
 * pipeline hand-rolls `.generate()`/`.stream()` on any agent — every
 * agent call in extraction, classification, and enrichment is a bare
 * `createStep(agent, { structuredOutput })` composition.
 *
 * `logger` is explicit rather than left to Mastra's bare unnamed default:
 * without it, every internally-emitted log line (agent runs, scorer runs,
 * framework warnings like "Storage not found, skipping score validation
 * and saving") prints with no name/component context at all. `PinoLogger`
 * is the logger Mastra's own docs recommend for this — structured,
 * leveled, pretty-printed — not a hand-rolled formatter.
 */
export const mastra = new Mastra({
  agents: {
    'finding-extractor': findingExtractorAgent,
    'classification-materials': materialsAgent,
    'classification-labor': laborAgent,
    'classification-trade': tradeAgent,
    'enrichment': enrichmentAgent,
  },
  workflows: { 'summarize-estimate': summarizeEstimateWorkflow },
  logger: new PinoLogger({ name: 'estimate-extraction-pipeline' }),
});
