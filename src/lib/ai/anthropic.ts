import { AIProviderError, type AIProvider, type FetchLike, type StructuredRequest } from "./types";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const REQUEST_TIMEOUT_MS = 180_000;

interface AnthropicContentBlock {
  type: string;
  name?: string;
  input?: unknown;
}

/**
 * Anthropic Messages API with forced tool use: the tool's input schema IS the
 * output schema, so the model can only answer in the requested structure.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_ANTHROPIC_MODEL,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init)
  ) {}

  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(API_URL, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": API_VERSION,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxOutputTokens ?? 8192,
          system: request.system,
          messages: [{ role: "user", content: request.user }],
          tools: [
            {
              name: request.schemaName,
              description: "Return the structured result in exactly this schema.",
              input_schema: request.jsonSchema
            }
          ],
          tool_choice: { type: "tool", name: request.schemaName }
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (cause) {
      throw new AIProviderError(
        `Anthropic request failed: ${cause instanceof Error ? cause.message : "network error"}`
      );
    }

    if (!response.ok) {
      throw new AIProviderError(
        `Anthropic request failed with status ${response.status}.`,
        response.status
      );
    }

    const payload = (await response.json()) as { content?: AnthropicContentBlock[] };
    const block = (payload.content ?? []).find(
      (b) => b.type === "tool_use" && b.name === request.schemaName
    );
    if (!block) {
      throw new AIProviderError("Anthropic response contained no structured tool output.");
    }

    const parsed = request.schema.safeParse(block.input);
    if (!parsed.success) {
      throw new AIProviderError(
        `Anthropic output failed schema validation: ${parsed.error.issues[0]?.message ?? "unknown issue"}`
      );
    }
    return parsed.data;
  }
}
