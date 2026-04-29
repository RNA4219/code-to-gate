/**
 * Local LLM Provider types and interfaces
 */

export type LlmProviderType = "ollama" | "llamacpp" | "deterministic";

export interface LlmConfig {
  /** Provider type */
  provider: LlmProviderType;
  /** Model name (e.g., "llama3.2", "codellama") */
  model?: string;
  /** Base URL for the API (defaults to localhost) */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for generation (0-1) */
  temperature?: number;
  /** Enable verbose logging */
  verbose?: boolean;
}

export interface LlmResponse {
  /** Generated text content */
  content: string;
  /** Model used for generation */
  model: string;
  /** Time taken in milliseconds */
  durationMs: number;
  /** Number of tokens in prompt */
  promptTokens?: number;
  /** Number of tokens in completion */
  completionTokens?: number;
  /** Whether response came from fallback */
  fromFallback?: boolean;
}

export interface HealthCheckResult {
  /** Whether the provider is healthy */
  healthy: boolean;
  /** Provider type */
  provider: LlmProviderType;
  /** Base URL checked */
  baseUrl: string;
  /** Error message if unhealthy */
  error?: string;
  /** Response time in milliseconds */
  responseTimeMs?: number;
  /** Available models (if applicable) */
  models?: string[];
  /** Timestamp of check */
  timestamp: string;
}

export interface LlmAnalysisRequest {
  /** System prompt for the analysis */
  systemPrompt: string;
  /** User prompt containing code/context */
  userPrompt: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for generation */
  temperature?: number;
}

export interface LlmProvider {
  /** Provider type identifier */
  readonly type: LlmProviderType;

  /** Provider configuration */
  readonly config: LlmConfig;

  /**
   * Check if the provider is healthy and accessible
   */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * Perform analysis using the LLM
   */
  analyze(request: LlmAnalysisRequest): Promise<LlmResponse>;

  /**
   * Check if provider is available (quick check without full health check)
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Default configurations for each provider type
 */
export const DEFAULT_CONFIGS: Record<LlmProviderType, Omit<LlmConfig, "provider">> = {
  ollama: {
    baseUrl: "http://127.0.0.1:11434",
    timeout: 30000,
    maxTokens: 4096,
    temperature: 0.1,
  },
  llamacpp: {
    baseUrl: "http://127.0.0.1:8080",
    timeout: 30000,
    maxTokens: 4096,
    temperature: 0.1,
  },
  deterministic: {
    timeout: 1000,
    maxTokens: 0,
    temperature: 0,
  },
};

/**
 * Default model for each provider type
 */
export const DEFAULT_MODELS: Record<Exclude<LlmProviderType, "deterministic">, string> = {
  ollama: "llama3.2",
  llamacpp: "local-model",
};