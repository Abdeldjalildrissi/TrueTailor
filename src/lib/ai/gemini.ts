import { toGeminiSchema } from "./json-schema";
import { AIProviderError, type AIProvider, type FetchLike, type StructuredRequest } from "./types";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const REQUEST_TIMEOUT_MS = 180_000;

interface GeminiCandidate {
  content?: { parts?: { text?: string }[] };
  finishReason?: string;
}

/**
 * Google Gemini API with native JSON-schema constrained output
 * (responseMimeType: application/json + responseSchema). The JSON schema is
 * converted to Gemini's OpenAPI-style dialect; the parsed result is
 * re-validated with Zod like every other provider.
 */
export class GeminiProvider implements AIProvider {
  readonly name = "google" as const;

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_GEMINI_MODEL,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init)
  ) {}

  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${API_BASE}/${this.model}:generateContent`, {
        method: "POST",
        headers: {
          "x-goog-api-key": this.apiKey,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: "user", parts: [{ text: request.user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: toGeminiSchema(request.jsonSchema),
            maxOutputTokens: request.maxOutputTokens ?? 8192,
            temperature: 0.2
          }
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (cause) {
      throw new AIProviderError(
        `Gemini request failed: ${cause instanceof Error ? cause.message : "network error"}`
      );
    }

    if (!response.ok) {
      throw new AIProviderError(
        `Gemini request failed with status ${response.status}.`,
        response.status
      );
    }

    const payload = (await response.json()) as { candidates?: GeminiCandidate[] };
    const candidate = payload.candidates?.[0];
    const text = (candidate?.content?.parts ?? []).map((part) => part.text ?? "").join("");

    if (!text) {
      const reason = candidate?.finishReason ? ` (finish reason: ${candidate.finishReason})` : "";
      throw new AIProviderError(`Gemini response contained no structured content${reason}.`);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new AIProviderError("Gemini response was not valid JSON.");
    }

    const parsed = request.schema.safeParse(raw);
    if (!parsed.success) {
      throw new AIProviderError(
        `Gemini output failed schema validation: ${parsed.error.issues[0]?.message ?? "unknown issue"}`
      );
    }
    return parsed.data;
  }
}
