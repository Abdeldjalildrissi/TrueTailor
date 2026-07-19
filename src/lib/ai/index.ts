import { env } from "@/lib/env";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";
import { AIProviderError, type AIProvider } from "./types";

let override: AIProvider | null = null;

/** Test-only: inject a provider so the pipeline can be exercised without network. */
export function setProviderForTesting(provider: AIProvider | null): void {
  override = provider;
}

/** Resolves the configured runtime AI provider. Throws a clear error when unconfigured. */
export function getProvider(): AIProvider {
  if (override) {
    return override;
  }
  const config = env();
  if (config.AI_PROVIDER === "anthropic") {
    if (!config.ANTHROPIC_API_KEY) {
      throw new AIProviderError(
        "The runtime AI provider is not configured: set ANTHROPIC_API_KEY (or switch AI_PROVIDER)."
      );
    }
    return new AnthropicProvider(config.ANTHROPIC_API_KEY, config.AI_MODEL);
  }
  if (config.AI_PROVIDER === "google") {
    if (!config.GEMINI_API_KEY) {
      throw new AIProviderError(
        "The runtime AI provider is not configured: set GEMINI_API_KEY (or switch AI_PROVIDER)."
      );
    }
    return new GeminiProvider(config.GEMINI_API_KEY, config.AI_MODEL);
  }
  if (!config.OPENAI_API_KEY) {
    throw new AIProviderError(
      "The runtime AI provider is not configured: set OPENAI_API_KEY (or switch AI_PROVIDER)."
    );
  }
  return new OpenAIProvider(config.OPENAI_API_KEY, config.AI_MODEL);
}

export { AIProviderError } from "./types";
export type { AIProvider, StructuredRequest } from "./types";
