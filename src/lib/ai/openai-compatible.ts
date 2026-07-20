import { AIProviderError, type FetchLike, type StructuredRequest } from "./types";

const REQUEST_TIMEOUT_MS = 180_000;

/**
 * Shared core for OpenAI-compatible Chat Completions endpoints (OpenAI
 * itself, OpenRouter, and any future compatible gateway): strict
 * JSON-schema response format, then Zod re-validation — provider compliance
 * is never trusted. Error messages carry the provider label so failures
 * name their real origin.
 */
export async function chatCompletionsStructured<T>(options: {
  url: string;
  headers: Record<string, string>;
  model: string;
  label: string;
  fetchImpl: FetchLike;
  request: StructuredRequest<T>;
}): Promise<T> {
  const { url, headers, model, label, fetchImpl, request } = options;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        model,
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
      `${label} request failed: ${cause instanceof Error ? cause.message : "network error"}`
    );
  }

  if (!response.ok) {
    throw new AIProviderError(
      `${label} request failed with status ${response.status}.`,
      response.status
    );
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  };
  const message = payload.choices?.[0]?.message;
  if (!message || typeof message.content !== "string" || message.content.length === 0) {
    const refusal = message?.refusal ? ` (refusal: ${message.refusal})` : "";
    throw new AIProviderError(`${label} response contained no structured content${refusal}.`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(message.content);
  } catch {
    throw new AIProviderError(`${label} response was not valid JSON.`);
  }

  const parsed = request.schema.safeParse(raw);
  if (!parsed.success) {
    throw new AIProviderError(
      `${label} output failed schema validation: ${parsed.error.issues[0]?.message ?? "unknown issue"}`
    );
  }
  return parsed.data;
}
