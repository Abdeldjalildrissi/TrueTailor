import { toGeminiSchema } from "./json-schema";
import { AIProviderError, type AIProvider, type FetchLike, type StructuredRequest } from "./types";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const REQUEST_TIMEOUT_MS = 180_000;

/** Hard ceiling of the Gemini 2.5 output window. */
const MAX_OUTPUT_CEILING = 65_536;

interface GeminiCandidate {
  content?: { parts?: { text?: string }[] };
  finishReason?: string;
}

/**
 * Google Gemini API with native JSON-schema constrained output
 * (responseMimeType: application/json + responseSchema). The JSON schema is
 * converted to Gemini's OpenAPI-style dialect; the parsed result is
 * re-validated with Zod like every other provider.
 *
 * Truncation robustness (D-0027): Gemini 2.5 models are thinking models
 * whose internal reasoning tokens draw from the SAME maxOutputTokens budget
 * as the answer. A budget that comfortably fits the JSON can therefore be
 * eaten by thinking, truncating the answer mid-document — which surfaces as
 * "response was not valid JSON" and gets worse as outputs grow (e.g. cover
 * letters). Three layers fix this:
 *   1. Thinking is disabled (thinkingBudget: 0) on 2.5 Flash models — these
 *      are schema-constrained structured transformations, not open-ended
 *      reasoning, so the whole budget goes to the answer. (2.5 Pro cannot
 *      disable thinking, so the flag is model-gated.)
 *   2. Truncation is detected explicitly via finishReason MAX_TOKENS.
 *   3. One bounded retry re-issues the request with a 4× budget (ceiling
 *      65,536) whenever the first response is truncated or unparseable.
 */
export class GeminiProvider implements AIProvider {
  readonly name = "google" as const;

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_GEMINI_MODEL,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init)
  ) {}

  /** Thinking can only be turned off where the API supports it. */
  private supportsThinkingOff(): boolean {
    return this.model.includes("2.5-flash");
  }

  private async attempt(
    request: StructuredRequest<unknown>,
    maxOutputTokens: number
  ): Promise<{ text: string; finishReason: string | null }> {
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
            maxOutputTokens,
            temperature: 0.2,
            ...(this.supportsThinkingOff() ? { thinkingConfig: { thinkingBudget: 0 } } : {})
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
    return { text, finishReason: candidate?.finishReason ?? null };
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    const firstBudget = Math.min(request.maxOutputTokens ?? 8192, MAX_OUTPUT_CEILING);
    const retryBudget = Math.min(firstBudget * 4, MAX_OUTPUT_CEILING);

    let raw: unknown;
    let lastReason: string | null = null;

    for (const [index, budget] of [firstBudget, retryBudget].entries()) {
      const { text, finishReason } = await this.attempt(request, budget);
      lastReason = finishReason;
      const truncated = finishReason === "MAX_TOKENS";

      if (text && !truncated) {
        try {
          raw = JSON.parse(text);
          break;
        } catch {
          // Unparseable despite a clean finish — fall through to the retry.
        }
      }

      if (index === 1) {
        const reason = lastReason ? ` (finish reason: ${lastReason})` : "";
        if (!text) {
          throw new AIProviderError(`Gemini response contained no structured content${reason}.`);
        }
        throw new AIProviderError(
          truncated
            ? `Gemini response was truncated at ${budget} output tokens${reason}. Try a shorter job posting or profile.`
            : `Gemini response was not valid JSON${reason}.`
        );
      }
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
