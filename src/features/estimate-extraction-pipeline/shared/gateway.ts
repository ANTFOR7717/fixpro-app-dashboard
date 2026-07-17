import { createOpenAI } from '@ai-sdk/openai';

/**
 * The single Pioneer AI (Fastino Labs) gateway instance every agent and
 * scorer now routes through. Confirmed real via web search (an OpenAI-
 * compatible inference gateway) and live-verified this session.
 *
 * `.chat('claude-fable-5')`, NOT the bare call. Live-verified: the bare
 * call (`pioneerGateway('claude-fable-5')`) defaults to OpenAI's newer
 * Responses API (`/v1/responses`), and Pioneer's response there is
 * missing the `id` field that endpoint's strict schema requires (a
 * `ZodError` on every call). `.chat(...)` targets the older Chat
 * Completions API (`/v1/chat/completions`), which Pioneer's own docs
 * describe support for and which live-verified working end to end,
 * including tool calls + `structuredOutput.model` together.
 */
export const pioneerGateway = createOpenAI({
  apiKey: process.env.PIONEER_API_KEY!,
  baseURL: process.env.PIONEER_API_URL ?? 'https://api.pioneer.ai/v1',
});
