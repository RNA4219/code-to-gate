/**
 * Base class for local LLM providers
 * Provides common functionality for localhost-only communication
 */

import {
  LlmProvider,
  LlmConfig,
  LlmResponse,
  LlmAnalysisRequest,
  HealthCheckResult,
  LlmProviderType,
  DEFAULT_CONFIGS,
} from "../types.js";

/**
 * Abstract base class for local LLM providers
 * Enforces localhost-only communication and provides common utilities
 */
export abstract class LocalBaseProvider implements LlmProvider {
  abstract readonly type: LlmProviderType;
  readonly config: LlmConfig;

  protected constructor(config: LlmConfig) {
    // Validate and enforce localhost-only URLs
    this.config = this.validateConfig(config);
  }

  /**
   * Validate configuration to ensure localhost-only communication
   */
  private validateConfig(config: LlmConfig): LlmConfig {
    const defaults = DEFAULT_CONFIGS[config.provider];
    const baseUrl = config.baseUrl ?? defaults.baseUrl;

    // Enforce localhost-only communication
    if (baseUrl) {
      const parsedUrl = new URL(baseUrl);
      let hostname = parsedUrl.hostname.toLowerCase();

      // Strip IPv6 brackets if present
      if (hostname.startsWith("[") && hostname.endsWith("]")) {
        hostname = hostname.slice(1, -1);
      }

      const allowedHosts = [
        "127.0.0.1",
        "localhost",
        "::1",
        "0.0.0.0", // Common for local servers
      ];

      if (!allowedHosts.includes(hostname)) {
        throw new Error(
          `Local LLM providers only allow localhost communication. ` +
            `Got: ${hostname}. Allowed: ${allowedHosts.join(", ")}`
        );
      }
    }

    return {
      ...defaults,
      ...config,
      baseUrl,
    };
  }

  /**
   * Make an HTTP request with timeout
   */
  protected async makeRequest(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if the provider is available (quick check)
   */
  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.healthCheck();
      return result.healthy;
    } catch {
      return false;
    }
  }

  /**
   * Build analysis prompt for the provider
   */
  protected buildPrompt(request: LlmAnalysisRequest): string {
    return `${request.systemPrompt}\n\n${request.userPrompt}`;
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  abstract healthCheck(): Promise<HealthCheckResult>;
  abstract analyze(request: LlmAnalysisRequest): Promise<LlmResponse>;
}

/**
 * Deterministic fallback provider
 * Returns predictable responses when LLM is unavailable
 */
export class DeterministicProvider implements LlmProvider {
  readonly type: LlmProviderType = "deterministic";
  readonly config: LlmConfig;

  constructor(config?: Partial<LlmConfig>) {
    this.config = {
      provider: "deterministic",
      ...DEFAULT_CONFIGS.deterministic,
      ...config,
    };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      healthy: true,
      provider: "deterministic",
      baseUrl: "local",
      timestamp: new Date().toISOString(),
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async analyze(request: LlmAnalysisRequest): Promise<LlmResponse> {
    const startTime = Date.now();

    // Return a deterministic analysis based on keywords
    const prompt = request.userPrompt.toLowerCase();
    const content = this.generateDeterministicResponse(prompt);

    return {
      content,
      model: "deterministic-fallback",
      durationMs: Date.now() - startTime,
      fromFallback: true,
    };
  }

  private generateDeterministicResponse(prompt: string): string {
    // Generate deterministic response based on prompt analysis
    const findings: string[] = [];

    // Check for common security patterns
    if (prompt.includes("password") || prompt.includes("secret")) {
      findings.push(
        "Potential sensitive data exposure detected. Review password/secret handling."
      );
    }

    if (prompt.includes("sql") || prompt.includes("query")) {
      findings.push(
        "SQL-related code detected. Ensure parameterized queries are used."
      );
    }

    if (prompt.includes("auth") || prompt.includes("login")) {
      findings.push(
        "Authentication-related code detected. Verify security best practices."
      );
    }

    if (prompt.includes("api") && prompt.includes("key")) {
      findings.push(
        "API key usage detected. Ensure keys are not hardcoded."
      );
    }

    if (prompt.includes("eval(") || prompt.includes("function(")) {
      findings.push(
        "Dynamic code execution detected. Review for injection vulnerabilities."
      );
    }

    // Default response when no patterns matched
    if (findings.length === 0) {
      findings.push(
        "Deterministic analysis completed. No high-confidence patterns detected."
      );
      findings.push(
        "Recommend enabling LLM provider for enhanced analysis."
      );
    }

    return findings.join("\n");
  }
}