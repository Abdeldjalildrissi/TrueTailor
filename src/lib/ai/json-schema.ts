import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/** Converts a Zod schema into inline JSON Schema for provider tool/schema modes. */
export function toJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const json = zodToJsonSchema(schema, { $refStrategy: "none" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/**
 * OpenAI's strict structured-output mode requires every object to declare
 * additionalProperties: false and list all properties as required. Our Zod
 * schemas already make every key required (nullable rather than optional);
 * this walker enforces the additionalProperties contract recursively.
 */
export function toStrictJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const json = toJsonSchema(schema);
  enforceStrictObjects(json);
  return json;
}

function enforceStrictObjects(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      enforceStrictObjects(item);
    }
    return;
  }
  if (node === null || typeof node !== "object") {
    return;
  }
  const record = node as Record<string, unknown>;
  if (record.type === "object" && typeof record.properties === "object" && record.properties) {
    record.additionalProperties = false;
    record.required = Object.keys(record.properties as Record<string, unknown>);
  }
  for (const value of Object.values(record)) {
    enforceStrictObjects(value);
  }
}

/**
 * Gemini's responseSchema dialect is an OpenAPI-style subset: single
 * uppercase types with a `nullable` flag instead of type unions, and a
 * limited keyword set. This walker converts standard JSON Schema into that
 * dialect via a strict whitelist — anything Gemini might reject is dropped
 * (Zod re-validates the full contract server-side regardless).
 */
export function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return transformGeminiNode(schema);
}

function transformGeminiNode(node: unknown): Record<string, unknown> {
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    return {};
  }
  const record = node as Record<string, unknown>;

  // Collapse `anyOf: [X, {type: "null"}]` (nullable objects/arrays) into X + nullable.
  if (Array.isArray(record.anyOf)) {
    const variants = record.anyOf as Record<string, unknown>[];
    const nonNull = variants.filter((v) => v?.type !== "null");
    const hadNull = nonNull.length !== variants.length;
    const first = nonNull[0];
    if (first) {
      const out = transformGeminiNode(first);
      if (hadNull) {
        out.nullable = true;
      }
      return out;
    }
  }

  const out: Record<string, unknown> = {};

  // Collapse `type: ["string", "null"]` into type + nullable.
  let type = record.type;
  if (Array.isArray(type)) {
    const nonNull = type.filter((t) => t !== "null");
    if (nonNull.length !== type.length) {
      out.nullable = true;
    }
    type = nonNull[0];
  }
  if (typeof type === "string") {
    out.type = type.toUpperCase();
  }

  if (typeof record.description === "string") {
    out.description = record.description;
  }
  if (Array.isArray(record.enum)) {
    out.enum = record.enum;
  }
  if (record.items && typeof record.items === "object") {
    out.items = transformGeminiNode(record.items);
  }
  if (record.properties && typeof record.properties === "object") {
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record.properties as Record<string, unknown>)) {
      properties[key] = transformGeminiNode(value);
    }
    out.properties = properties;
    out.required = Object.keys(properties);
  }

  return out;
}
