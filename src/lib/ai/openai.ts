import { chatCompletionsStructured } from "./openai-compatible";
import { type AIProvider, type FetchLike, type StructuredRequest } from "./types";

const API_URL = "https://api.openai.com/v1/chat/completions";
export const DEFAULT_OPENAI_MODEL = "gpt-4o-2024-08-06";

/**
 * OpenAI Chat Completions with strict JSON-schema response format.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_OPENAI_MODEL,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init)
  ) {}

  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    return chatCompletionsStructured({
      url: API_URL,
      headers: { authorization: `Bearer ${this.apiKey}` },
      model: this.model,
      label: "OpenAI",
      fetchImpl: this.fetchImpl,
      request
    });
  }
}
