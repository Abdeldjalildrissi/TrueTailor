import type { z } from "zod";

/**
 * The only interface through which the application reaches a model.
 * Structured generation is schema-enforced at the provider (tool schema /
 * JSON-schema mode) AND re-validated server-side with Zod — provider
 * compliance is never trusted.
 */
export interface StructuredRequest<T> {
  system: string;
  user: string;
  schemaName: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
}

export interface AIProvider {
  readonly name: "anthropic" | "openai" | "google" | "openrouter";
  generateStructured<T>(request: StructuredRequest<T>): Promise<T>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
