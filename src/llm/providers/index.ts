/**
 * LLM Provider exports
 */

export * from "./local-base.js";
export * from "./ollama-provider.js";
export * from "./llamacpp-provider.js";
export * from "./provider-health.js";

import { LlmConfig, LlmProvider, LlmProviderType } from "../types.js";
import { DeterministicProvider } from "./local-base.js";
import { OllamaProvider } from "./ollama-provider.js";
import { LlamacppProvider } from "./llamacpp-provider.js";

/**
 * Create a provider instance based on configuration
 */
export function createProvider(config: LlmConfig): LlmProvider {
  switch (config.provider) {
    case "ollama":
      return new OllamaProvider(config);
    case "llamacpp":
      return new LlamacppProvider(config);
    case "deterministic":
      return new DeterministicProvider(config);
    default:
      throw new Error(`Unknown provider type: ${config.provider}`);
  }
}

/**
 * Create a provider with fallback to deterministic
 */
export async function createProviderWithFallback(
  config: LlmConfig
): Promise<LlmProvider> {
  // If deterministic is explicitly requested, use it
  if (config.provider === "deterministic") {
    return new DeterministicProvider(config);
  }

  const provider = createProvider(config);

  // Check if provider is available
  const isAvailable = await provider.isAvailable();

  if (!isAvailable) {
    // Fall back to deterministic provider
    return new DeterministicProvider({
      ...config,
      provider: "deterministic",
    });
  }

  return provider;
}

/**
 * Create provider with automatic detection
 * Attempts to find an available local provider
 */
export async function createAutoProvider(): Promise<LlmProvider> {
  const providers: LlmProviderType[] = ["ollama", "llamacpp"];

  for (const providerType of providers) {
    try {
      const provider = createProvider({ provider: providerType });
      const isAvailable = await provider.isAvailable();

      if (isAvailable) {
        return provider;
      }
    } catch {
      // Continue to next provider
    }
  }

  // Fall back to deterministic
  return new DeterministicProvider({ provider: "deterministic" });
}

/**
 * Provider factory function map
 */
export const providerFactories: Record<LlmProviderType, (config: Partial<LlmConfig>) => LlmProvider> = {
  ollama: (config) => new OllamaProvider(config),
  llamacpp: (config) => new LlamacppProvider(config),
  deterministic: (config) => new DeterministicProvider(config),
};