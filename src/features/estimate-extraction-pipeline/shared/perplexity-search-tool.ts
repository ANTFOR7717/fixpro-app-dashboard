import { createPerplexitySearchTool } from '@mastra/perplexity';

/**
 * Constructs the Mastra-native Perplexity Search tool
 * (`@mastra/perplexity`). Wired into `enrichmentAgent`'s `tools`
 * (`enrichment/agent.ts`), alongside `documentLookupTool` and
 * `tavilySearch`.
 *
 * Reads `PERPLEXITY_API_KEY` (falls back to `PPLX_API_KEY`) from the
 * environment — see `.env.example`. That key is not currently set in
 * this project's `.env`, so calls through this tool will fail until it
 * is.
 */
export const perplexitySearchTool = createPerplexitySearchTool();
