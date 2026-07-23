import { Mastra } from '@mastra/core/mastra';
import { MastraCompositeStore } from '@mastra/core/storage';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from '@mastra/duckdb';
import { Observability, MastraStorageExporter } from '@mastra/observability';
import { findingExtractorAgent } from './extraction';
import { classifyFindingsBatchAgent } from './classification';
import { enrichmentAgent, presentationAgent } from './enrichment';
import { identityAgent } from './intake';
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
    'classification-batch': classifyFindingsBatchAgent,
    'enrichment': enrichmentAgent,
    'presentation': presentationAgent,
    'estimate-identity-extractor': identityAgent,
  },
  workflows: {
    'summarize-estimate': summarizeEstimateWorkflow,
  },
  logger: new PinoLogger({ name: 'estimate-extraction-pipeline' }),
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({ id: 'mastra-storage', url: 'file:./mastra.db' }),
    domains: { observability: await new DuckDBStore().getStore('observability') },
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'estimate-extraction-pipeline',
        exporters: [new MastraStorageExporter()],
      },
    },
  }),
});
