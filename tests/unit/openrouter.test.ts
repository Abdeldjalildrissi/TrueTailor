import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toJsonSchema } from "@/lib/ai/json-schema";
import { DEFAULT_OPENROUTER_MODEL, OpenRouterProvider } from "@/lib/ai/openrouter";
import { AIProviderError, type FetchLike } from "@/lib/ai/types";

const greetingSchema = z.object({ greeting: z.string() });

const request = {
  system: "sys",
  user: "usr",
  schemaName: "greeting_result",
  schema: greetingSchema,
  jsonSchema: toJsonSchema(greetingSchema)
};

function capture(responseBody: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "content-type": "application/json" }
    });
  };
  return { calls, fetchImpl };
}

function completion(content: string) {
  return { choices: [{ message: { content } }] };
}

describe("OpenRouterProvider", () => {
  it("speaks the OpenAI dialect against the OpenRouter endpoint with strict schema", async () => {
    const { calls, fetchImpl } = capture(completion('{"greeting":"hi"}'));
    const provider = new OpenRouterProvider("or-key", undefined, fetchImpl);
    const result = await provider.generateStructured(request);

    expect(result).toEqual({ greeting: "hi" });
    expect(provider.name).toBe("openrouter");
    const call = calls[0];
    expect(call?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = call?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer or-key");
    expect(headers["x-title"]).toBe("TrueTailor");
    const body = JSON.parse(String(call?.init.body)) as {
      model: string;
      response_format: { type: string; json_schema: { strict: boolean; name: string } };
    };
    expect(body.model).toBe(DEFAULT_OPENROUTER_MODEL);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.name).toBe("greeting_result");
  });

  it("honors an AI_MODEL override (any OpenRouter slug)", async () => {
    const { calls, fetchImpl } = capture(completion('{"greeting":"hi"}'));
    const provider = new OpenRouterProvider("k", "anthropic/claude-sonnet-4", fetchImpl);
    await provider.generateStructured(request);
    const body = JSON.parse(String(calls[0]?.init.body)) as { model: string };
    expect(body.model).toBe("anthropic/claude-sonnet-4");
  });

  it("names OpenRouter in its errors and carries the HTTP status", async () => {
    const { fetchImpl } = capture({ error: { message: "no credit" } }, 402);
    const provider = new OpenRouterProvider("k", undefined, fetchImpl);
    await expect(provider.generateStructured(request)).rejects.toMatchObject({
      status: 402
    });
    await expect(provider.generateStructured(request)).rejects.toThrow(/OpenRouter/);
  });

  it("re-validates output with Zod regardless of provider compliance", async () => {
    const { fetchImpl } = capture(completion('{"greeting":42}'));
    const provider = new OpenRouterProvider("k", undefined, fetchImpl);
    await expect(provider.generateStructured(request)).rejects.toBeInstanceOf(AIProviderError);
  });
});
