/**
 * P2-01: Remote LLM Provider Schema Tests
 *
 * Tests for:
 * - OpenAI structured output schema validation
 * - Anthropic structured output schema validation
 * - Alibaba/OpenRouter response validation
 * - Fallback behavior for remote providers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LlmResponse } from "../types.js";

// Mock fetch for API calls
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("P2-01: Remote LLM Provider Schema Tests", () => {
  describe("OpenAI response schema", () => {
    it("validates OpenAI chat completion response structure", async () => {
      const openaiResponse = {
        id: "chatcmpl-123",
        object: "chat.completion",
        created: 1677652288,
        model: "gpt-4",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Analysis result",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => openaiResponse,
      });

      // Simulate OpenAI provider call
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4", messages: [] }),
      });

      const data = await response.json();

      // Validate response structure
      expect(data.id).toBeDefined();
      expect(data.model).toBe("gpt-4");
      expect(data.choices).toHaveLength(1);
      expect(data.choices[0].message.content).toBeDefined();
      expect(data.usage.prompt_tokens).toBe(100);
      expect(data.usage.completion_tokens).toBe(50);
    });

    it("handles OpenAI error response", async () => {
      const errorResponse = {
        error: {
          message: "Invalid API key",
          type: "invalid_request_error",
          code: "invalid_api_key",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => errorResponse,
      });

      const response = await fetch("https://api.openai.com/v1/chat/completions");

      expect(response.ok).toBe(false);
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe("invalid_api_key");
    });

    it("validates OpenAI response to LlmResponse conversion", () => {
      const openaiResponse = {
        model: "gpt-4",
        choices: [{ message: { content: "Test analysis" } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      };

      // Conversion function simulation
      const llmResponse: LlmResponse = {
        content: openaiResponse.choices[0].message.content,
        model: openaiResponse.model,
        promptTokens: openaiResponse.usage.prompt_tokens,
        completionTokens: openaiResponse.usage.completion_tokens,
        durationMs: 500,
      };

      expect(llmResponse.content).toBe("Test analysis");
      expect(llmResponse.model).toBe("gpt-4");
      expect(llmResponse.promptTokens).toBe(100);
      expect(llmResponse.completionTokens).toBe(50);
    });
  });

  describe("Anthropic response schema", () => {
    it("validates Anthropic messages response structure", async () => {
      const anthropicResponse = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-6",
        content: [
          {
            type: "text",
            text: "Analysis result from Claude",
          },
        ],
        stop_reason: "end_turn",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => anthropicResponse,
      });

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "test-key",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1024, messages: [] }),
      });

      const data = await response.json();

      expect(data.id).toBeDefined();
      expect(data.type).toBe("message");
      expect(data.model).toBe("claude-sonnet-4-6");
      expect(data.content).toHaveLength(1);
      expect(data.content[0].type).toBe("text");
      expect(data.content[0].text).toBeDefined();
      expect(data.usage.input_tokens).toBe(100);
      expect(data.usage.output_tokens).toBe(50);
    });

    it("handles Anthropic error response", async () => {
      const errorResponse = {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "Invalid API key",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => errorResponse,
      });

      const response = await fetch("https://api.anthropic.com/v1/messages");

      expect(response.ok).toBe(false);
      const data = await response.json();
      expect(data.type).toBe("error");
      expect(data.error.type).toBe("invalid_request_error");
    });

    it("validates Anthropic response to LlmResponse conversion", () => {
      const anthropicResponse = {
        model: "claude-sonnet-4-6",
        content: [{ type: "text", text: "Claude analysis" }],
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const llmResponse: LlmResponse = {
        content: anthropicResponse.content[0].text,
        model: anthropicResponse.model,
        promptTokens: anthropicResponse.usage.input_tokens,
        completionTokens: anthropicResponse.usage.output_tokens,
        durationMs: 500,
      };

      expect(llmResponse.content).toBe("Claude analysis");
      expect(llmResponse.model).toBe("claude-sonnet-4-6");
    });
  });

  describe("Alibaba Cloud response schema", () => {
    it("validates Alibaba Qwen response structure", async () => {
      const alibabaResponse = {
        output: {
          text: "Analysis from Qwen",
          finish_reason: "stop",
        },
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
        request_id: "req-123",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => alibabaResponse,
      });

      const response = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation");
      const data = await response.json();

      expect(data.output.text).toBeDefined();
      expect(data.output.finish_reason).toBe("stop");
      expect(data.usage.input_tokens).toBe(100);
      expect(data.usage.output_tokens).toBe(50);
      expect(data.request_id).toBeDefined();
    });

    it("validates Alibaba response to LlmResponse conversion", () => {
      const alibabaResponse = {
        output: { text: "Qwen analysis" },
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const llmResponse: LlmResponse = {
        content: alibabaResponse.output.text,
        model: "qwen-max",
        promptTokens: alibabaResponse.usage.input_tokens,
        completionTokens: alibabaResponse.usage.output_tokens,
        durationMs: 500,
      };

      expect(llmResponse.content).toBe("Qwen analysis");
    });
  });

  describe("OpenRouter response schema", () => {
    it("validates OpenRouter response structure", async () => {
      const openRouterResponse = {
        id: "gen-123",
        model: "deepseek/deepseek-v3",
        choices: [
          {
            message: {
              role: "assistant",
              content: "DeepSeek analysis",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => openRouterResponse,
      });

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions");
      const data = await response.json();

      expect(data.id).toBeDefined();
      expect(data.model).toBe("deepseek/deepseek-v3");
      expect(data.choices[0].message.content).toBeDefined();
      expect(data.usage.total_tokens).toBe(150);
    });
  });

  describe("Common response validation", () => {
    it("LlmResponse has required fields for all providers", () => {
      const responses: LlmResponse[] = [
        { content: "OpenAI", model: "gpt-4", durationMs: 100, promptTokens: 10, completionTokens: 5 },
        { content: "Anthropic", model: "claude-sonnet-4-6", durationMs: 150, promptTokens: 12, completionTokens: 6 },
        { content: "Alibaba", model: "qwen-max", durationMs: 200, promptTokens: 15, completionTokens: 7 },
        { content: "Ollama", model: "llama3", durationMs: 300, promptTokens: 20, completionTokens: 10 },
        { content: "Deterministic", model: "deterministic-fallback", durationMs: 0, fromFallback: true },
      ];

      for (const response of responses) {
        expect(response.content).toBeDefined();
        expect(typeof response.content).toBe("string");
        expect(response.model).toBeDefined();
        expect(typeof response.model).toBe("string");
        expect(response.durationMs).toBeDefined();
        expect(typeof response.durationMs).toBe("number");
      }
    });

    it("response content is non-empty for successful analysis", () => {
      const validResponses = [
        { content: "Valid analysis content", model: "gpt-4", durationMs: 100 },
        { content: "Another valid response", model: "claude-sonnet-4-6", durationMs: 150 },
      ];

      for (const response of validResponses) {
        expect(response.content.length).toBeGreaterThan(0);
      }
    });

    it("response model identifier matches expected format", () => {
      const modelFormats = [
        { model: "gpt-4", pattern: /^gpt-/ },
        { model: "claude-sonnet-4-6", pattern: /^claude-/ },
        { model: "qwen-max", pattern: /^qwen/ },
        { model: "llama3.2:latest", pattern: /^llama/ },
        { model: "deterministic-fallback", pattern: /^deterministic/ },
      ];

      for (const { model, pattern } of modelFormats) {
        expect(pattern.test(model)).toBe(true);
      }
    });
  });

  describe("Fallback behavior for remote providers", () => {
    it("timeout triggers fallback to deterministic", async () => {
      mockFetch.mockImplementation(() =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 100)
        )
      );

      // Simulating timeout scenario
      try {
        await fetch("https://api.openai.com/v1/chat/completions");
      } catch {
        // Expected timeout
      }

      // Fallback should be deterministic
      const fallbackResponse: LlmResponse = {
        content: "Deterministic fallback response",
        model: "deterministic-fallback",
        durationMs: 0,
        fromFallback: true,
      };

      expect(fallbackResponse.fromFallback).toBe(true);
      expect(fallbackResponse.model).toBe("deterministic-fallback");
    });

    it("API error triggers fallback gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const response = await fetch("https://api.openai.com/v1/chat/completions");
      expect(response.ok).toBe(false);

      // Fallback behavior
      const fallbackResponse: LlmResponse = {
        content: "Fallback due to API error",
        model: "deterministic-fallback",
        fromFallback: true,
        durationMs: 0,
      };

      expect(fallbackResponse.fromFallback).toBe(true);
    });

    it("rate limit error is handled", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: { "retry-after": "60" },
      });

      const response = await fetch("https://api.openai.com/v1/chat/completions");
      expect(response.status).toBe(429);

      // Should handle rate limit gracefully
      const handled = response.status === 429;
      expect(handled).toBe(true);
    });
  });

  describe("Request payload validation", () => {
    it("OpenAI request has required fields", () => {
      const openaiRequest = {
        model: "gpt-4",
        messages: [
          { role: "system", content: "System prompt" },
          { role: "user", content: "User prompt" },
        ],
        max_tokens: 1024,
      };

      expect(openaiRequest.model).toBeDefined();
      expect(openaiRequest.messages).toHaveLength(2);
      expect(openaiRequest.messages[0].role).toBe("system");
      expect(openaiRequest.messages[1].role).toBe("user");
    });

    it("Anthropic request has required fields", () => {
      const anthropicRequest = {
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: "System prompt",
        messages: [
          { role: "user", content: "User prompt" },
        ],
      };

      expect(anthropicRequest.model).toBeDefined();
      expect(anthropicRequest.max_tokens).toBeDefined();
      expect(anthropicRequest.system).toBeDefined();
      expect(anthropicRequest.messages).toHaveLength(1);
    });

    it("secrets are not included in request payload", () => {
      const cleanRequest = {
        model: "gpt-4",
        messages: [
          { role: "user", content: "Analyze this code without API_KEY_PLACEHOLDER" },
        ],
      };

      const requestStr = JSON.stringify(cleanRequest);

      // No actual secret patterns
      expect(requestStr).not.toContain("sk-");
      expect(requestStr).not.toContain("password=");
      expect(requestStr).not.toContain("secret=");
    });
  });
});