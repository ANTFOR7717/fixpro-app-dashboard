/**
 * THE DOOR — extraction's complete public contract. `pipeline.ts`
 * composes these steps directly; nothing in this module calls
 * `.generate()`/`.stream()` by hand anywhere.
 */
export {
  extractedFindingSchema,
  type ExtractedFinding,
} from './schema';
export { extractionFanoutWorkflow } from './steps';
/** Re-exported for Mastra-instance registration ONLY — no module calls these directly. */
export { findingExtractorAgent } from './agent';
