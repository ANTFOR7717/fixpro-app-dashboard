/**
 * THE DOOR — extraction's complete public contract. `pipeline.ts`
 * composes these steps directly; nothing in this module calls
 * `.generate()`/`.stream()` by hand anywhere.
 */
export {
  ACTION,
  extractedFindingSchema,
  meaningfulSentenceSchema,
  resolvedExtractionSchema,
  type Action,
  type ExtractedFinding,
  type MeaningfulSentence,
  type ResolvedExtraction,
} from './schema';
export {
  buildExtractionPrompt,
  findingExtractorAgentStep,
  resolveFindingsStep,
} from './steps';
/** Re-exported for Mastra-instance registration ONLY — no module calls these directly. */
export { findingExtractorAgent } from './agent';
export { extractionConsistencyScorer } from './scorer';
