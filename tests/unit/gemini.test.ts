import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GeminiProvider } from "@/lib/ai/gemini";
import { toGeminiSchema, toJsonSchema } from "@/lib/ai/json-schema";
import { AIProviderError, type FetchLike } from "@/lib/ai/types";

const greetingSchema = z.object({ greeting: z.string(), count: z.number().nullable() });
const greetingJson = toJsonSchema(greetingSchema);

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

describe("toGeminiSchema", () => {
  it("converts to the OpenAPI-style dialect with uppercase types and nullable flags", () => {
    const schema = z.object({
      a: z.string().nullable(),
      b: z.object({ c: z.boolean() }).nullable(),
      d: z.array(z.string()),
      e: z.enum(["x", "y"]).nullable()
    });
    const gemini = toGeminiSchema(toJsonSchema(schema)) as {
      type: string;
      required: string[];
      properties: Record<
        string,
        {
          type?: string;
          nullable?: boolean;
          enum?: string[];
          items?: { type?: string };
          properties?: Record<string, { type?: string }>;
        }
      >;
    };

    expect(gemini.type).toBe("OBJECT");
    expect(gemini.required.sort()).toEqual(["a", "b", "d", "e"]);
    expect(gemini.properties.a).toMatchObject({ type: "STRING", nullable: true });
    expect(gemini.properties.b?.nullable).toBe(true);
    expect(gemini.properties.b?.type).toBe("OBJECT");
    expect(gemini.properties.b?.properties?.c?.type).toBe("BOOLEAN");
    expect(gemini.properties.d?.type).toBe("ARRAY");
    expect(gemini.properties.d?.items?.type).toBe("STRING");
    expect(gemini.properties.e?.enum).toEqual(["x", "y"]);
    expect(gemini.properties.e?.nullable).toBe(true);
    expect(JSON.stringify(gemini)).not.toContain("additionalProperties");
    expect(JSON.stringify(gemini)).not.toContain("anyOf");
  });
});

describe("GeminiProvider", () => {
  const request = {
    system: "sys",
    user: "usr",
    schemaName: "greeting_result",
    schema: greetingSchema,
    jsonSchema: greetingJson
  };

  function geminiResponse(payload: unknown) {
    return {
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }]
    };
  }

  it("requests constrained JSON output and parses the candidate text", async () => {
    const { calls, fetchImpl } = capture(geminiResponse({ greeting: "hi", count: 3 }));
    const provider = new GeminiProvider("g-key", "gemini-test-model", fetchImpl);
    const result = await provider.generateStructured(request);

    expect(result).toEqual({ greeting: "hi", count: 3 });
    const call = calls[0];
    expect(call?.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent"
    );
    const headers = call?.init.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("g-key");
    const body = JSON.parse(String(call?.init.body)) as {
      systemInstruction: { parts: { text: string }[] };
      generationConfig: {
        responseMimeType: string;
        responseSchema: { type: string; properties: Record<string, { nullable?: boolean }> };
      };
    };
    expect(body.systemInstruction.parts[0]?.text).toBe("sys");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema.type).toBe("OBJECT");
    expect(body.generationConfig.responseSchema.properties.count?.nullable).toBe(true);
  });

  it("rejects schema-invalid output", async () => {
    const { fetchImpl } = capture(geminiResponse({ greeting: 12, count: null }));
    const provider = new GeminiProvider("k", "m", fetchImpl);
    await expect(provider.generateStructured(request)).rejects.toBeInstanceOf(AIProviderError);
  });

  it("rejects non-JSON candidate text", async () => {
    const { fetchImpl } = capture({
      candidates: [{ content: { parts: [{ text: "plain prose, not json" }] } }]
    });
    const provider = new GeminiProvider("k", "m", fetchImpl);
    await expect(provider.generateStructured(request)).rejects.toThrow(/not valid JSON/);
  });

  it("surfaces empty candidates with the finish reason", async () => {
    const { fetchImpl } = capture({ candidates: [{ finishReason: "MAX_TOKENS" }] });
    const provider = new GeminiProvider("k", "m", fetchImpl);
    await expect(provider.generateStructured(request)).rejects.toThrow(/MAX_TOKENS/);
  });

  it("surfaces HTTP failures with status", async () => {
    const { fetchImpl } = capture({ error: { message: "bad key" } }, 400);
    const provider = new GeminiProvider("k", "m", fetchImpl);
    await expect(provider.generateStructured(request)).rejects.toMatchObject({ status: 400 });
  });
});
