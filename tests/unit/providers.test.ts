import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import { toJsonSchema, toStrictJsonSchema } from "@/lib/ai/json-schema";
import { OpenAIProvider } from "@/lib/ai/openai";
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

describe("json schema conversion", () => {
  it("produces inline JSON schema without $refs", () => {
    expect(greetingJson.type).toBe("object");
    expect(JSON.stringify(greetingJson)).not.toContain("$ref");
  });

  it("strict variant closes every object and requires every key", () => {
    const nested = z.object({ a: z.string(), inner: z.object({ b: z.number().nullable() }) });
    const strict = toStrictJsonSchema(nested) as {
      additionalProperties?: boolean;
      required?: string[];
      properties?: { inner?: { additionalProperties?: boolean; required?: string[] } };
    };
    expect(strict.additionalProperties).toBe(false);
    expect(strict.required?.sort()).toEqual(["a", "inner"]);
    expect(strict.properties?.inner?.additionalProperties).toBe(false);
    expect(strict.properties?.inner?.required).toEqual(["b"]);
  });
});

describe("AnthropicProvider", () => {
  const request = {
    system: "sys",
    user: "usr",
    schemaName: "greeting_result",
    schema: greetingSchema,
    jsonSchema: greetingJson
  };

  it("forces tool use with the request schema and parses tool output", async () => {
    const { calls, fetchImpl } = capture({
      content: [
        { type: "tool_use", name: "greeting_result", input: { greeting: "hi", count: null } }
      ]
    });
    const provider = new AnthropicProvider("test-key", "test-model", fetchImpl);
    const result = await provider.generateStructured(request);

    expect(result).toEqual({ greeting: "hi", count: null });
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.url).toBe("https://api.anthropic.com/v1/messages");
    const headers = call?.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-key");
    expect(headers["anthropic-version"]).toBeTruthy();
    const body = JSON.parse(String(call?.init.body)) as {
      model: string;
      tool_choice: { type: string; name: string };
      tools: { name: string; input_schema: unknown }[];
    };
    expect(body.model).toBe("test-model");
    expect(body.tool_choice).toEqual({ type: "tool", name: "greeting_result" });
    expect(body.tools[0]?.input_schema).toEqual(greetingJson);
  });

  it("rejects schema-invalid tool output", async () => {
    const { fetchImpl } = capture({
      content: [{ type: "tool_use", name: "greeting_result", input: { greeting: 42, count: null } }]
    });
    const provider = new AnthropicProvider("k", "m", fetchImpl);
    await expect(provider.generateStructured(request)).rejects.toBeInstanceOf(AIProviderError);
  });

  it("surfaces HTTP failures with status", async () => {
    const { fetchImpl } = capture({ error: "overloaded" }, 529);
    const provider = new AnthropicProvider("k", "m", fetchImpl);
    await expect(provider.generateStructured(request)).rejects.toMatchObject({ status: 529 });
  });

  it("rejects responses with no tool output", async () => {
    const { fetchImpl } = capture({ content: [{ type: "text", text: "chatty answer" }] });
    const provider = new AnthropicProvider("k", "m", fetchImpl);
    await expect(provider.generateStructured(request)).rejects.toBeInstanceOf(AIProviderError);
  });
});

describe("OpenAIProvider", () => {
  const request = {
    system: "sys",
    user: "usr",
    schemaName: "greeting_result",
    schema: greetingSchema,
    jsonSchema: toStrictJsonSchema(greetingSchema)
  };

  it("uses strict json_schema response format and parses content", async () => {
    const { calls, fetchImpl } = capture({
      choices: [{ message: { content: JSON.stringify({ greeting: "hello", count: 2 }) } }]
    });
    const provider = new OpenAIProvider("oa-key", "oa-model", fetchImpl);
    const result = await provider.generateStructured(request);

    expect(result).toEqual({ greeting: "hello", count: 2 });
    const call = calls[0];
    expect(call?.url).toBe("https://api.openai.com/v1/chat/completions");
    const headers = call?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer oa-key");
    const body = JSON.parse(String(call?.init.body)) as {
      response_format: {
        type: string;
        json_schema: { name: string; strict: boolean; schema: { additionalProperties?: boolean } };
      };
    };
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
  });

  it("rejects non-JSON content", async () => {
    const { fetchImpl } = capture({ choices: [{ message: { content: "not json at all" } }] });
    const provider = new OpenAIProvider("k", "m", fetchImpl);
    await expect(provider.generateStructured(request)).rejects.toBeInstanceOf(AIProviderError);
  });

  it("surfaces refusals as provider errors", async () => {
    const { fetchImpl } = capture({ choices: [{ message: { content: null, refusal: "no" } }] });
    const provider = new OpenAIProvider("k", "m", fetchImpl);
    await expect(provider.generateStructured(request)).rejects.toThrow(/refusal/);
  });
});
