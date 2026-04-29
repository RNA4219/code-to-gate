/**
 * Ollama LLM Provider
 * Integration with Ollama local LLM server (localhost:11434)
 */

import {
  LlmConfig,
  LlmResponse,
  LlmAnalysisRequest,
  HealthCheckResult,
  DEFAULT_CONFIGS,
  DEFAULT_MODELS,
} from "../types.js";
import { LocalBaseProvider } from "./local-base.js";
import { checkOllamaHealth } from "./provider-health.js";

/**
 * Ollama API response types
 */
interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaModelInfo {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

/**
 * Ollama provider implementation
 */
export class OllamaProvider extends LocalBaseProvider {
  readonly type = "ollama" as const;

  constructor(config: Partial<LlmConfig> = {}) {
    super({
      ...config,
      provider: "ollama",
      baseUrl: config.baseUrl ?? DEFAULT_CONFIGS.ollama.baseUrl,
      model: config.model ?? DEFAULT_MODELS.ollama,
    });
  }

  /**
   * Check Ollama server health
   */
  async healthCheck(): Promise<HealthCheckResult> {
    return checkOllamaHealth(this.config.baseUrl, { timeout: 5000 });
  }

  /**
   * List available models
   */
  async listModels(): Promise<OllamaModelInfo[]> {
    const response = await this.makeRequest(
      `${this.config.baseUrl}/api/tags`,
      { method: "GET" },
      this.config.timeout ?? 5000
    );

    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.statusText}`);
    }

    const data = await response.json() as { models: OllamaModelInfo[] };
    return data.models ?? [];
  }

  /**
   * Check if a specific model is available
   */
  async hasModel(modelName: string): Promise<boolean> {
    const models = await this.listModels();
    return models.some(
      (m) => m.name === modelName || m.name.startsWith(`${modelName}:`)
    );
  }

  /**
   * Pull a model if not available
   */
  async pullModel(modelName: string): Promise<void> {
    const response = await this.makeRequest(
      `${this.config.baseUrl}/api/pull`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName, stream: false }),
      },
      300000 // 5 minutes for model pull
    );

    if (!response.ok) {
      throw new Error(`Failed to pull model ${modelName}: ${response.statusText}`);
    }
  }

  /**
   * Perform analysis using Ollama
   */
  async analyze(request: LlmAnalysisRequest): Promise<LlmResponse> {
    const startTime = Date.now();
    const model = this.config.model ?? DEFAULT_MODELS.ollama;

    // Verify model is available
    const hasModel = await this.hasModel(model);
    if (!hasModel) {
      throw new Error(
        `Model '${model}' is not available in Ollama. ` +
          `Run 'ollama pull ${model}' to download it.`
      );
    }

    // Use chat API for better context handling
    const response = await this.makeRequest(
      `${this.config.baseUrl}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: request.userPrompt },
          ],
          stream: false,
          options: {
            temperature: request.temperature ?? this.config.temperature ?? 0.1,
            num_predict: request.maxTokens ?? this.config.maxTokens ?? 4096,
          },
        }),
      },
      this.config.timeout ?? 30000
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as OllamaChatResponse;

    return {
      content: data.message.content,
      model: data.model,
      durationMs: Date.now() - startTime,
      promptTokens: data.prompt_eval_count,
      completionTokens: data.eval_count,
    };
  }

  /**
   * Generate completion using Ollama generate API (simpler interface)
   */
  async generate(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<LlmResponse> {
    const startTime = Date.now();
    const model = this.config.model ?? DEFAULT_MODELS.ollama;

    const response = await this.makeRequest(
      `${this.config.baseUrl}/api/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            temperature: options?.temperature ?? this.config.temperature ?? 0.1,
            num_predict: options?.maxTokens ?? this.config.maxTokens ?? 4096,
          },
        }),
      },
      this.config.timeout ?? 30000
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as OllamaGenerateResponse;

    return {
      content: data.response,
      model: data.model,
      durationMs: Date.now() - startTime,
      promptTokens: data.prompt_eval_count,
      completionTokens: data.eval_count,
    };
  }

  /**
   * Get model information
   */
  async getModelInfo(modelName?: string): Promise<OllamaModelInfo | null> {
    const name = modelName ?? this.config.model ?? DEFAULT_MODELS.ollama;
    const response = await this.makeRequest(
      `${this.config.baseUrl}/api/show`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      },
      this.config.timeout ?? 5000
    );

    if (!response.ok) {
      return null;
    }

    return response.json() as Promise<OllamaModelInfo>;
  }
}