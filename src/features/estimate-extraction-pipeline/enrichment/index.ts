/**
 * THE DOOR — enrichment's complete public contract. `pipeline.ts`
 * composes `enrichmentFanoutWorkflow` directly as a step (same
 * "workflows as steps" pattern classification's own door uses), wrapped
 * by its own `RequestContext`-setting step so `documentLookupTool` can
 * reach `parsedDocument`.
 */
export { enrichedLineSchema, lineTotal, type EnrichedLine } from './schema';
export { enrichmentFanoutWorkflow } from './workflow';
/** Re-exported for Studio registration ONLY — no module calls these directly. */
export { enrichmentAgent } from './agent';
export { presentationAgent } from './presentation-agent';
