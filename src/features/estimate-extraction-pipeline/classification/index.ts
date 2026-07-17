/**
 * THE DOOR — classification's complete public contract. `pipeline.ts`
 * composes `classificationFanoutWorkflow` directly as a step (Mastra's
 * own documented "workflows as steps" pattern — `docs/workflows/overview`
 * — matching how `extraction/index.ts` already re-exports
 * `findingExtractorAgentStep` as a ready-composed primitive, not a
 * wrapping function). Nothing in this module calls `.generate()`/
 * `.stream()` by hand anywhere.
 */
export {
  TRADE,
  EXTENT_UNIT,
  billableLineSchema,
  materialLineSchema,
  laborLineSchema,
  webSearchFlagSchema,
  determinedOr,
  type BillableLine,
  type MaterialLine,
  type LaborLine,
  type Trade,
  type ExtentUnit,
  type WebSearchFlag,
} from './schema';
export { classificationFanoutWorkflow } from './workflow';
/** Re-exported for Studio registration ONLY — no module calls these directly. */
export { materialsAgent, laborAgent, tradeAgent } from './agents';
