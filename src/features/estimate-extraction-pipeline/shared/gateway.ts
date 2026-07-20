import { createOpenAI } from '@ai-sdk/openai';

/**
 * The single Pioneer AI (Fastino Labs) gateway every agent and scorer
 * routes through. Confirmed real via web search (an OpenAI-compatible
 * inference gateway) and live-verified this session.
 *
 * `.chat('claude-fable-5')`, NOT the bare call. Live-verified: the bare
 * call (`pioneerGateway().('claude-fable-5')`) defaults to OpenAI's newer
 * Responses API (`/v1/responses`), and Pioneer's response there is
 * missing the `id` field that endpoint's strict schema requires (a
 * `ZodError` on every call). `.chat(...)` targets the older Chat
 * Completions API (`/v1/chat/completions`), which Pioneer's own docs
 * describe support for and which live-verified working end to end,
 * including tool calls + `structuredOutput.model` together.
 *
 * A FUNCTION, called lazily — NOT `export const pioneerGateway =
 * createOpenAI(...)` evaluated at module top level, and every caller MUST
 * invoke it lazily too (`model: () => pioneerGateway().chat(...)`, never
 * `model: pioneerGateway().chat(...)` evaluated once at an agent's own
 * top-level construction). `createOpenAI({ apiKey })`'s `getHeaders()`
 * closure captures `options.apiKey` once, at construction time (confirmed
 * by reading the installed `@ai-sdk/openai` source) — so constructing it
 * before `PIONEER_API_KEY` is actually available permanently bakes in
 * `undefined`, and `@ai-sdk/provider-utils`'s `loadApiKey()` (also read
 * directly) then falls back not to `PIONEER_API_KEY` again but to the
 * generic `OPENAI_API_KEY` env var name hardcoded inside `createOpenAI()`
 * itself — producing a misleading "OpenAI API key is missing" error with
 * no OpenAI involved anywhere. Deferring construction (and every caller's
 * own `.chat()` call, via `model: () => ...` — `reference/agents/agent.md`
 * documents `model` as accepting `MastraLanguageModel |
 * ({ requestContext }) => MastraLanguageModel | Promise<MastraLanguageModel>`,
 * resolved at call time) removes that whole class of risk regardless of
 * env-loading order.
 */
let instance: ReturnType<typeof createOpenAI> | undefined;

export function pioneerGateway(): ReturnType<typeof createOpenAI> {
  if (!instance) {
    instance = createOpenAI({
      apiKey: process.env.PIONEER_API_KEY!,
      baseURL: process.env.PIONEER_API_URL ?? 'https://api.pioneer.ai/v1',
    });
  }
  return instance;
}
