/**
 * Resolves the `tracingOptions` to forward into a manual `createRun()`/
 * `.start()` or `agent.stream()` call, from the current step's own span
 * — this is what lets a nested run/agent call attach to the parent
 * trace instead of starting a disconnected one. `currentSpan` can be a
 * `NoOpSpan` (sampled-out or tracing disabled) with truthy-but-garbage
 * `id`/`traceId` values (`'no-op'`/`'no-op-trace'`) — `isValid` is the
 * correct guard, not a plain truthiness check.
 */
export function resolveTracingOptions(
  tracingContext: { currentSpan?: { isValid: boolean; traceId: string; id: string } } | undefined,
): { traceId: string; parentSpanId: string } | undefined {
  const currentSpan = tracingContext?.currentSpan;
  return currentSpan?.isValid ? { traceId: currentSpan.traceId, parentSpanId: currentSpan.id } : undefined;
}
