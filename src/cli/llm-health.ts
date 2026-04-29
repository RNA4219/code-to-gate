/**
 * LLM Health command - check health of local LLM providers
 */

import { EXIT, getOption, VERSION } from "./exit-codes.js";
import {
  checkProviderHealth,
  findAvailableProvider,
  validateLocalhostUrl,
  getDefaultBaseUrl,
} from "../llm/providers/provider-health.js";
import { LlmProviderType } from "../llm/types.js";

interface LlmHealthOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

const VALID_PROVIDERS: LlmProviderType[] = ["ollama", "llamacpp", "deterministic"];

function isValidProvider(value: string): value is LlmProviderType {
  return VALID_PROVIDERS.includes(value as LlmProviderType);
}

export async function llmHealthCommand(
  args: string[],
  options: LlmHealthOptions
): Promise<number> {
  const providerArg = options.getOption(args, "--provider");
  const checkAll = args.includes("--all");
  const baseUrl = options.getOption(args, "--llm-base-url");
  const jsonOutput = args.includes("--json");
  const verbose = args.includes("--verbose") || args.includes("-v");

  // Validate base URL if provided
  if (baseUrl && !validateLocalhostUrl(baseUrl)) {
    console.error(
      `Error: Non-localhost URL not allowed for security: ${baseUrl}`
    );
    console.error("Allowed hosts: 127.0.0.1, localhost, ::1, 0.0.0.0");
    return options.EXIT.USAGE_ERROR;
  }

  // Check all providers
  if (checkAll) {
    const results: Record<string, unknown> = {};

    for (const provider of VALID_PROVIDERS) {
      const url = baseUrl ?? getDefaultBaseUrl(provider);
      const result = await checkProviderHealth(provider, url);
      results[provider] = result;

      if (!jsonOutput) {
        const statusIcon = result.healthy ? "[OK]" : "[FAIL]";
        console.log(`${statusIcon} ${provider}: ${url}`);
        if (verbose && result.models) {
          console.log(`  Models: ${result.models.join(", ")}`);
        }
        if (verbose && result.responseTimeMs) {
          console.log(`  Response time: ${result.responseTimeMs}ms`);
        }
        if (!result.healthy && result.error) {
          console.log(`  Error: ${result.error}`);
        }
      }
    }

    if (jsonOutput) {
      console.log(JSON.stringify(results, null, 2));
    }

    // Return error if any provider failed (except deterministic which always succeeds)
    const failedProviders = VALID_PROVIDERS.filter(
      (p) => p !== "deterministic" && results[p] && !(results[p] as { healthy: boolean }).healthy
    );

    return failedProviders.length > 0 ? options.EXIT.LLM_FAILED : options.EXIT.OK;
  }

  // Check specific provider
  if (providerArg) {
    if (!isValidProvider(providerArg)) {
      console.error(`Error: Invalid provider: ${providerArg}`);
      console.error(`Valid providers: ${VALID_PROVIDERS.join(", ")}`);
      return options.EXIT.USAGE_ERROR;
    }

    const url = baseUrl ?? getDefaultBaseUrl(providerArg);
    const result = await checkProviderHealth(providerArg, url);

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const statusIcon = result.healthy ? "[OK]" : "[FAIL]";
      console.log(`${statusIcon} ${providerArg}`);
      console.log(`  URL: ${result.baseUrl}`);
      if (result.responseTimeMs) {
        console.log(`  Response time: ${result.responseTimeMs}ms`);
      }
      if (result.models && result.models.length > 0) {
        console.log(`  Models: ${result.models.join(", ")}`);
      }
      if (!result.healthy && result.error) {
        console.log(`  Error: ${result.error}`);
        console.log("");
        console.log("Troubleshooting:");
        if (providerArg === "ollama") {
          console.log("  1. Ensure Ollama is running: ollama serve");
          console.log("  2. Check if port 11434 is accessible");
          console.log("  3. Pull required model: ollama pull llama3.2");
        } else if (providerArg === "llamacpp") {
          console.log("  1. Ensure llama.cpp server is running");
          console.log("  2. Check if port 8080 is accessible");
          console.log("  3. Verify model file is loaded");
        }
      }
    }

    return result.healthy ? options.EXIT.OK : options.EXIT.LLM_FAILED;
  }

  // No provider specified - find available provider
  const available = await findAvailableProvider(["ollama", "llamacpp"]);

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        available
          ? {
              available: true,
              providerType: available.provider,
              healthy: available.result.healthy,
              baseUrl: available.result.baseUrl,
              responseTimeMs: available.result.responseTimeMs,
              models: available.result.models,
              timestamp: available.result.timestamp,
            }
          : { available: false, fallback: "deterministic" },
        null,
        2
      )
    );
  } else {
    if (available) {
      console.log(`Available provider: ${available.provider}`);
      console.log(`  URL: ${available.result.baseUrl}`);
      console.log(`  Response time: ${available.result.responseTimeMs}ms`);
      if (available.result.models && available.result.models.length > 0) {
        console.log(`  Models: ${available.result.models.join(", ")}`);
      }
    } else {
      console.log("No local LLM provider available");
      console.log("Fallback: deterministic (always available)");
      console.log("");
      console.log("To use a local LLM:");
      console.log("  1. Install Ollama: https://ollama.com");
      console.log("  2. Pull a model: ollama pull llama3.2");
      console.log("  3. Start server: ollama serve");
    }
  }

  return available ? options.EXIT.OK : options.EXIT.OK; // Deterministic fallback is OK
}