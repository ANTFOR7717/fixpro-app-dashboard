/**
 * THE DOOR — enrichment's complete public contract. `pipeline.ts`
 * composes `enrichmentFanoutWorkflow` directly as a step (same
 * "workflows as steps" pattern classification's own door uses), wrapped
 * by its own `RequestContext`-setting step so `documentLookupTool` can
 * reach `parsedDocument`.
 */
export {
  enrichedLineSchema,
  type EnrichedLine,
  enrichedMaterialLineSchema,
  enrichedLaborLineSchema,
} from './schema';
export { enrichmentFanoutWorkflow } from './workflow';
/** Re-exported for Studio registration ONLY — no module calls this directly. */
export { enrichmentAgent } from './agent';
