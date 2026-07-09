/**
 * Map an unknown error from an AI gateway call to a user-facing message.
 * Used by triggerSummarizeEstimate to persist a human-readable failure.
 */
export function classifyError(e: unknown): string {
  const err = e as { statusCode?: number; code?: string; message?: string } | undefined;
  const status = err?.statusCode;
  if (status === 401 || status === 403) return 'AI service authentication failed. Please retry.';
  if (status === 429) return 'AI service rate-limited. Please retry shortly.';
  if (status && status >= 500) return 'AI service is temporarily unavailable. Please retry.';
  return 'AI processing failed. Please retry.';
}
