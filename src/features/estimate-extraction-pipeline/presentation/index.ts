/**
 * THE DOOR — presentation's complete public contract. `pipeline.ts`
 * composes `presentationWorkflow` directly as a step (same "workflows
 * as steps" pattern every other stage's door uses). Nothing in this
 * module calls `.generate()`/`.stream()` by hand anywhere.
 */
export { pricedLineSchema, type PricedLine, MARKUP_PERCENT } from './schema';
export { presentationWorkflow } from './workflow';
/** Re-exported for Studio registration ONLY — no module calls this directly. */
export { presentationAgent } from './agent';
