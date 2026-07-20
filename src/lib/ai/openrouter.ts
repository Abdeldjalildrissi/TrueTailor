import { chatCompletionsStructured } from "./openai-compatible";
import { type AIProvider, type FetchLike, type StructuredRequest } from "./types";

const API_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Default model behind OpenRouter: inexpensive, reliable strict-JSON-schema
 * support. Any OpenRouter model slug can be substituted via AI_MODEL
 * (e.g. "anthropic/claude-sonnet-4", "google/gemini-2.5-flash", or a
 * ":free" variant — structured-output support varies by model).
 */
export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";

/**
 * OpenRouter — one API key in front of many model providers, speaking the
 * OpenAI Chat Completions dialect. Shares the strict JSON-schema core with
 * the OpenAI provider; Zod re-validation applies as everywhere else.
 */
export class OpenRouterProvider implements AIProvider {
  readonly name = "openrouter" as const;

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_OPENROUTER_MODEL,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init)
  ) {}

  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    return chatCompletionsStructured({
      url: API_URL,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        // App attribution per OpenRouter's conventions.
        "x-title": "TrueTailor"
      },
      model: this.model,
      label: "OpenRouter",
      fetchImpl: this.fetchImpl,
      request
    });
  }
}
