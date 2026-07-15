/**
 * THE DOOR — classification's complete public contract. `pipeline.ts`
 * composes these steps directly; nothing in this module calls
 * `.generate()`/`.stream()` by hand anywhere.
 */
export { billableLineSchema, type BillableLine } from './schema';
export {
  buildClassificationPrompt,
  lineClassifierAgentStep,
  buildLinesStep,
} from './steps';
/** Re-exported for Mastra-instance registration ONLY — no module calls this directly. */
export { lineClassifierAgent } from './agent';
