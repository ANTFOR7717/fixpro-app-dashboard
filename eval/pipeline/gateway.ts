import { createOpenAI } from '@ai-sdk/openai';

/**
 * The eval harness's own Pioneer AI gateway instance, mirroring
 * `src/features/estimate-extraction-pipeline/shared/gateway.ts`'s
 * `pioneerGateway` exactly (same env vars, same default base URL) — not
 * imported from there, since `eval/` lives outside the pipeline package
 * and importing a non-door path would violate its one-door boundary.
 */
export const evalJudgeGateway = createOpenAI({
  apiKey: process.env.PIONEER_API_KEY!,
  baseURL: process.env.PIONEER_API_URL ?? 'https://api.pioneer.ai/v1',
});
