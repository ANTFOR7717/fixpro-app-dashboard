import { createOpenAI } from '@ai-sdk/openai';

/**
 * The single Kilo AI-gateway instance every agent and scorer routes
 * through. This is infrastructure (a transport client), not a pipeline
 * responsibility — it carries no business logic and holds no state a
 * module's output depends on. Model selection stays at each call site
 * (e.g. `kiloGateway('openai/gpt-5.4-mini')`); only transport config
 * (URL, auth) lives here.
 */
export const kiloGateway = createOpenAI({
  apiKey: process.env.KILO_API_KEY!,
  baseURL: 'https://api.kilo.ai/api/gateway',
});
