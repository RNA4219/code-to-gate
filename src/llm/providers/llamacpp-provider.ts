/**
 * llama.cpp LLM Provider
 * Integration with llama.cpp HTTP server (localhost:8080)
 */

import {
  LlmConfig,
  LlmResponse,
  LlmAnalysisRequest,
  HealthCheckResult,
  DEFAULT_CONFIGS,
} from "../types.js";
import { LocalBaseProvider } from "./local-base.js";
import { checkLlamacppHealth } from "./provider-health.js";

/**
 * llama.cpp API response types
 */
interface LlamacppCompletionResponse {
  content: string;
  tokens_evaluated?: number;
  tokens_predicted?: number;
  truncated?: boolean;
  stopped_eos?: boolean;
  stopped_word?: boolean;
  stopped_limit?: boolean;
  stopping_word?: string;
  tokens_cached?: number;
  timings?: {
    prompt_n: number;
    prompt_ms: number;
    prompt_per_token_ms: number;
    prompt_per_second: number;
    predicted_n: number;
    predicted_ms: number;
    predicted_per_token_ms: number;
    predicted_per_second: number;
  };
}

interface LlamacppChatResponse {
  content: string;
  tokens_evaluated?: number;
  tokens_predicted?: number;
}

interface LlamacppProps {
  default_generation_settings: {
    n_ctx: number;
    n_predict: number;
    mirostat: number;
    mirostat_tau: number;
    mirostat_eta: number;
    temp: number;
    top_p: number;
    top_k: number;
  };
  model_path?: string;
}

interface LlamacppTokenizeResponse {
  tokens: number[];
}

/**
 * llama.cpp provider implementation
 */
export class LlamacppProvider extends LocalBaseProvider {
  readonly type = "llamacpp" as const;

  constructor(config: Partial<LlmConfig> = {}) {
    super({
      ...config,
      provider: "llamacpp",
      baseUrl: config.baseUrl ?? DEFAULT_CONFIGS.llamacpp.baseUrl,
      model: config.model ?? "local-model",
    });
  }

  /**
   * Check llama.cpp server health
   */
  async healthCheck(): Promise<HealthCheckResult> {
    return checkLlamacppHealth(this.config.baseUrl, { timeout: 5000 });
  }

  /**
   * Get server properties
   */
  async getProps(): Promise<LlamacppProps | null> {
    try {
      const response = await this.makeRequest(
        `${this.config.baseUrl}/props`,
        { method: "GET" },
        this.config.timeout ?? 5000
      );

      if (!response.ok) {
        return null;
      }

      return response.json() as Promise<LlamacppProps>;
    } catch {
      return null;
    }
  }

  /**
   * Tokenize text
   */
  async tokenize(text: string): Promise<number[]> {
    const response = await this.makeRequest(
      `${this.config.baseUrl}/tokenize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      },
      this.config.timeout ?? 5000
    );

    if (!response.ok) {
      throw new Error(`Tokenization failed: ${response.statusText}`);
    }

    const data = await response.json() as LlamacppTokenizeResponse;
    return data.tokens;
  }

  /**
   * Perform analysis using llama.cpp
   */
  async analyze(request: LlmAnalysisRequest): Promise<LlmResponse> {
    const startTime = Date.now();

    // Build the prompt with system and user content
    const fullPrompt = this.buildPrompt(request);

    // Use completion endpoint
    const response = await this.makeRequest(
      `${this.config.baseUrl}/completion`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: fullPrompt,
          n_predict: request.maxTokens ?? this.config.maxTokens ?? 4096,
          temperature: request.temperature ?? this.config.temperature ?? 0.1,
          stop: ["\n\n\n", "### Instruction:", "### User:"], // Common stop sequences
          stream: false,
        }),
      },
      this.config.timeout ?? 30000
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`llama.cpp API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as LlamacppCompletionResponse;

    return {
      content: data.content.trim(),
      model: this.config.model ?? "local-model",
      durationMs: Date.now() - startTime,
      promptTokens: data.tokens_evaluated,
      completionTokens: data.tokens_predicted,
    };
  }

  /**
   * Generate completion using simpler interface
   */
  async generate(
    prompt: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
      stop?: string[];
    }
  ): Promise<LlmResponse> {
    const startTime = Date.now();

    const response = await this.makeRequest(
      `${this.config.baseUrl}/completion`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          n_predict: options?.maxTokens ?? this.config.maxTokens ?? 4096,
          temperature: options?.temperature ?? this.config.temperature ?? 0.1,
          stop: options?.stop ?? [],
          stream: false,
        }),
      },
      this.config.timeout ?? 30000
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`llama.cpp API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as LlamacppCompletionResponse;

    return {
      content: data.content.trim(),
      model: this.config.model ?? "local-model",
      durationMs: Date.now() - startTime,
      promptTokens: data.tokens_evaluated,
      completionTokens: data.tokens_predicted,
    };
  }

  /**
   * Chat completion with message history
   * Note: llama.cpp server may not support chat endpoint in all versions
   */
  async chat(
    messages: Array<{ role: string; content: string }>,
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<LlmResponse> {
    const startTime = Date.now();

    // Format messages for llama.cpp
    // Build a prompt that represents the conversation
    const prompt = messages
      .map((m) => {
        if (m.role === "system") {
          return `### System:\n${m.content}`;
        } else if (m.role === "user") {
          return `### User:\n${m.content}`;
        } else {
          return `### Assistant:\n${m.content}`;
        }
      })
      .join("\n\n") + "\n\n### Assistant:\n";

    const response = await this.makeRequest(
      `${this.config.baseUrl}/completion`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          n_predict: options?.maxTokens ?? this.config.maxTokens ?? 4096,
          temperature: options?.temperature ?? this.config.temperature ?? 0.1,
          stop: ["### User:", "### System:", "### Instruction:"],
          stream: false,
        }),
      },
      this.config.timeout ?? 30000
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`llama.cpp API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as LlamacppCompletionResponse;

    return {
      content: data.content.trim(),
      model: this.config.model ?? "local-model",
      durationMs: Date.now() - startTime,
      promptTokens: data.tokens_evaluated,
      completionTokens: data.tokens_predicted,
    };
  }

  /**
   * Embed text using llama.cpp embedding endpoint
   */
  async embed(text: string): Promise<number[]> {
    const response = await this.makeRequest(
      `${this.config.baseUrl}/embedding`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      },
      this.config.timeout ?? 10000
    );

    if (!response.ok) {
      throw new Error(`Embedding failed: ${response.statusText}`);
    }

    const data = await response.json() as { embedding: number[] };
    return data.embedding;
  }
}