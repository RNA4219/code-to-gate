/**
 * Health check utilities for LLM providers
 */

import { HealthCheckResult, LlmProviderType, DEFAULT_CONFIGS } from "../types.js";

export interface HealthCheckOptions {
  /** Custom timeout in milliseconds */
  timeout?: number;
  /** Number of retries */
  retries?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
}

/**
 * Check health of Ollama server
 */
export async function checkOllamaHealth(
  baseUrl: string = DEFAULT_CONFIGS.ollama.baseUrl!,
  options: HealthCheckOptions = {}
): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const timeout = options.timeout ?? 5000;
  const retries = options.retries ?? 1;
  const retryDelay = options.retryDelay ?? 1000;

  let lastError: string | undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // Check if server is running
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as { models?: Array<{ name: string }> };
      const models = data.models?.map((m) => m.name) ?? [];

      return {
        healthy: true,
        provider: "ollama",
        baseUrl,
        responseTimeMs: Date.now() - startTime,
        models,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);

      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  return {
    healthy: false,
    provider: "ollama",
    baseUrl,
    error: lastError ?? "Unknown error",
    responseTimeMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check health of llama.cpp server
 */
export async function checkLlamacppHealth(
  baseUrl: string = DEFAULT_CONFIGS.llamacpp.baseUrl!,
  options: HealthCheckOptions = {}
): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const timeout = options.timeout ?? 5000;
  const retries = options.retries ?? 1;
  const retryDelay = options.retryDelay ?? 1000;

  let lastError: string | undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // Check if server is running via /health endpoint
      const response = await fetch(`${baseUrl}/health`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Try to get model info from /props endpoint
      let models: string[] = [];
      try {
        const propsResponse = await fetch(`${baseUrl}/props`, {
          method: "GET",
          signal: AbortSignal.timeout(timeout),
        });

        if (propsResponse.ok) {
          const props = await propsResponse.json() as { model_path?: string };
          if (props.model_path) {
            models = [props.model_path.split("/").pop() ?? "local-model"];
          }
        }
      } catch {
        // Props endpoint not available, use default
        models = ["local-model"];
      }

      return {
        healthy: true,
        provider: "llamacpp",
        baseUrl,
        responseTimeMs: Date.now() - startTime,
        models,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);

      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  return {
    healthy: false,
    provider: "llamacpp",
    baseUrl,
    error: lastError ?? "Unknown error",
    responseTimeMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check health of a provider by type
 */
export async function checkProviderHealth(
  provider: LlmProviderType,
  baseUrl?: string,
  options: HealthCheckOptions = {}
): Promise<HealthCheckResult> {
  switch (provider) {
    case "ollama":
      return checkOllamaHealth(baseUrl, options);
    case "llamacpp":
      return checkLlamacppHealth(baseUrl, options);
    case "deterministic":
      return {
        healthy: true,
        provider: "deterministic",
        baseUrl: "local",
        timestamp: new Date().toISOString(),
      };
    default:
      throw new Error(`Unknown provider type: ${provider}`);
  }
}

/**
 * Check all local providers and return the first healthy one
 */
export async function findAvailableProvider(
  providers: LlmProviderType[] = ["ollama", "llamacpp"],
  options: HealthCheckOptions = {}
): Promise<{ provider: LlmProviderType; result: HealthCheckResult } | null> {
  for (const provider of providers) {
    const result = await checkProviderHealth(provider, undefined, options);
    if (result.healthy) {
      return { provider, result };
    }
  }
  return null;
}

/**
 * Validate that a URL is localhost-only
 */
export function validateLocalhostUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    const allowedHosts = [
      "127.0.0.1",
      "localhost",
      "::1",
      "0.0.0.0",
    ];

    return allowedHosts.includes(hostname);
  } catch {
    return false;
  }
}

/**
 * Get the default base URL for a provider
 */
export function getDefaultBaseUrl(provider: LlmProviderType): string {
  return DEFAULT_CONFIGS[provider]?.baseUrl ?? "local";
}

/**
 * Wait for a provider to become available
 */
export async function waitForProvider(
  provider: LlmProviderType,
  baseUrl?: string,
  options: HealthCheckOptions & { maxWaitMs?: number } = {}
): Promise<HealthCheckResult> {
  const maxWaitMs = options.maxWaitMs ?? 30000;
  const checkInterval = 1000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await checkProviderHealth(provider, baseUrl, {
      timeout: options.timeout,
      retries: 1,
    });

    if (result.healthy) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  return {
    healthy: false,
    provider,
    baseUrl: baseUrl ?? getDefaultBaseUrl(provider),
    error: `Provider did not become available within ${maxWaitMs}ms`,
    responseTimeMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}