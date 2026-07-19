import { AIProviderError, type AIProvider, type FetchLike, type StructuredRequest } from "./types";

const API_URL = "https://api.openai.com/v1/chat/completions";
export const DEFAULT_OPENAI_MODEL = "gpt-4o-2024-08-06";
const REQUEST_TIMEOUT_MS = 180_000;

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
    let response: Response;
    try {
      response = await this.fetchImpl(API_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          max_completion_tokens: request.maxOutputTokens ?? 8192,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: request.schemaName,
              strict: true,
              schema: request.jsonSchema
            }
          }
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (cause) {
      throw new AIProviderError(
        `OpenAI request failed: ${cause instanceof Error ? cause.message : "network error"}`
      );
    }

    if (!response.ok) {
      throw new AIProviderError(
        `OpenAI request failed with status ${response.status}.`,
        response.status
      );
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string | null; refusal?: string | null } }[];
    };
    const message = payload.choices?.[0]?.message;
    if (!message || typeof message.content !== "string" || message.content.length === 0) {
      const refusal = message?.refusal ? ` (refusal: ${message.refusal})` : "";
      throw new AIProviderError(`OpenAI response contained no structured content${refusal}.`);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(message.content);
    } catch {
      throw new AIProviderError("OpenAI response was not valid JSON.");
    }

    const parsed = request.schema.safeParse(raw);
    if (!parsed.success) {
      throw new AIProviderError(
        `OpenAI output failed schema validation: ${parsed.error.issues[0]?.message ?? "unknown issue"}`
      );
    }
    return parsed.data;
  }
}
