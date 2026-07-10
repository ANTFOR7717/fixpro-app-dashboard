import { createLogger } from '@mastra/core/logger';

/**
 * SDK-native logger for code that does NOT run inside a registered
 * workflow step — namely pricing's internal, deliberately-unregistered
 * fan-out (see pricing/workflow.ts). A registered step gets a working
 * `mastra` execute-context for free; this covers the one place in the
 * pipeline that doesn't have one, without registering that internal
 * workflow just to get a logger (see the plan's Pattern Audit for why
 * that trade is worse).
 *
 * A factory, not a shared singleton, so each caller gets its own named
 * logger component instead of every unrelated caller sharing one label.
 */
export function createModuleLogger(name: string) {
  return createLogger({ name });
}
