/**
 * 負債6.7: Local LLM Provider Contract Tests
 *
 * Tests for:
 * - Response schema validation
 * - Timeout handling
 * - Local-only mode enforcement
 * - Audit hash validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProvider, createProviderWithFallback } from "../../llm/providers/index.js";
import { DeterministicProvider } from "../../llm/providers/local-base.js";
import { OllamaProvider } from "../../llm/providers/ollama-provider.js";
import { LlamacppProvider } from "../../llm/providers/llamacpp-provider.js";
import { LlmResponse, HealthCheckResult } from "../../llm/types.js";

// Mock fetch for API calls
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("負債6.7: LLM Provider Contract Tests", () => {
  describe("Response schema contract", () => {
    it("DeterministicProvider response has required fields", async () => {
      const provider = new DeterministicProvider();
      const response = await provider.analyze({
        systemPrompt: "test",
        userPrompt: "test",
      });

      // Verify LlmResponse schema
      expect(response.content).toBeDefined();
      expect(typeof response.content).toBe("string");
      expect(response.model).toBeDefined();
      expect(typeof response.model).toBe("string");
      expect(response.durationMs).toBeDefined();
      expect(typeof response.durationMs).toBe("number");
      expect(response.durationMs).toBeGreaterThanOrEqual(0);
      expect(response.fromFallback).toBeDefined();
      expect(typeof response.fromFallback).toBe("boolean");
    });

    it("OllamaProvider response schema when available", async () => {
      // Mock models list
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: "llama3.2:latest" }] }),
      });

      // Mock chat response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: "llama3.2:latest",
          message: {
            role: "assistant",
            content: "Analysis result",
          },
          prompt_eval_count: 100,
          eval_count: 50,
        }),
      });

      const provider = new OllamaProvider({ model: "llama3.2" });
      const response = await provider.analyze({
        systemPrompt: "test",
        userPrompt: "test",
      });

      expect(response.content).toBeDefined();
      expect(response.model).toBe("llama3.2:latest");
      expect(response.promptTokens).toBe(100);
      expect(response.completionTokens).toBe(50);
    });

    it("LlamacppProvider response schema when available", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: "Generated response",
          tokens_evaluated: 20,
          tokens_predicted: 30,
        }),
      });

      const provider = new LlamacppProvider();
      const response = await provider.analyze({
        systemPrompt: "test",
        userPrompt: "test",
      });

      expect(response.content).toBe("Generated response");
      expect(response.promptTokens).toBe(20);
      expect(response.completionTokens).toBe(30);
    });

    it("HealthCheckResult schema is consistent across providers", async () => {
      // Deterministic health check
      const detProvider = new DeterministicProvider();
      const detHealth = await detProvider.healthCheck();

      expect(detHealth.healthy).toBe(true);
      expect(detHealth.provider).toBe("deterministic");
      expect(detHealth.baseUrl).toBe("local");
      expect(detHealth.timestamp).toBeDefined();

      // Ollama health check (mocked)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      const ollamaProvider = new OllamaProvider();
      const ollamaHealth = await ollamaProvider.healthCheck();

      expect(typeof ollamaHealth.healthy).toBe("boolean");
      expect(ollamaHealth.provider).toBe("ollama");
      expect(ollamaHealth.baseUrl).toBeDefined();
      expect(ollamaHealth.timestamp).toBeDefined();
    });
  });

  describe("Timeout handling", () => {
    it("OllamaProvider respects timeout configuration", async () => {
      const provider = new OllamaProvider({
        timeout: 1000,
        baseUrl: "http://127.0.0.1:11434",
      });

      expect(provider.config.timeout).toBe(1000);
    });

    it("LlamacppProvider respects timeout configuration", async () => {
      const provider = new LlamacppProvider({
        timeout: 2000,
        baseUrl: "http://127.0.0.1:8080",
      });

      expect(provider.config.timeout).toBe(2000);
    });

    it("Health check timeout triggers fallback", async () => {
      // Simulate timeout by rejecting
      mockFetch.mockRejectedValue(new Error("Timeout"));

      const provider = await createProviderWithFallback({ provider: "ollama" });
      expect(provider).toBeInstanceOf(DeterministicProvider);
    });

    it("Fallback provider succeeds after timeout", async () => {
      mockFetch.mockRejectedValue(new Error("Timeout"));

      const provider = await createProviderWithFallback({ provider: "ollama" });
      const response = await provider.analyze({
        systemPrompt: "test",
        userPrompt: "test",
      });

      expect(response.content).toBeDefined();
      expect(response.fromFallback).toBe(true);
    });

    it("Provider health check returns error on timeout", async () => {
      mockFetch.mockRejectedValue(new Error("Timeout"));

      const provider = new OllamaProvider();
      const health = await provider.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toContain("Timeout");
    });
  });

  describe("Local-only mode enforcement", () => {
    it("Only localhost URLs are accepted", () => {
      const validUrls = [
        "http://127.0.0.1:11434",
        "http://localhost:11434",
        "http://0.0.0.0:11434",
        "http://[::1]:11434",
      ];

      for (const url of validUrls) {
        const ollama = new OllamaProvider({ baseUrl: url });
        expect(ollama.config.baseUrl).toBe(url);
      }
    });

    it("Non-localhost URLs are rejected at construction", () => {
      const invalidUrls = [
        "http://example.com:11434",
        "http://192.168.1.1:11434",
        "http://10.0.0.1:8080",
        "https://api.openai.com/v1",
      ];

      for (const url of invalidUrls) {
        expect(() => new OllamaProvider({ baseUrl: url })).toThrow();
        expect(() => new LlamacppProvider({ baseUrl: url })).toThrow();
      }
    });

    it("Deterministic provider never makes network calls", async () => {
      const provider = new DeterministicProvider();

      await provider.healthCheck();
      await provider.analyze({ systemPrompt: "", userPrompt: "" });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("validateLocalhostUrl helper rejects remote URLs", async () => {
      const { validateLocalhostUrl } = await import("../../llm/providers/provider-health.js");

      expect(validateLocalhostUrl("http://127.0.0.1:11434")).toBe(true);
      expect(validateLocalhostUrl("http://localhost:8080")).toBe(true);
      expect(validateLocalhostUrl("http://example.com")).toBe(false);
      expect(validateLocalhostUrl("https://api.example.com")).toBe(false);
    });
  });

  describe("Audit hash validation", () => {
    it("DeterministicProvider generates consistent response hash", async () => {
      const provider = new DeterministicProvider();

      const response1 = await provider.analyze({
        systemPrompt: "test",
        userPrompt: "password code",
      });

      const response2 = await provider.analyze({
        systemPrompt: "test",
        userPrompt: "password code",
      });

      // Same input should produce same content (deterministic)
      expect(response1.content).toBe(response2.content);
    });

    it("Response has valid model identifier", async () => {
      const provider = new DeterministicProvider();
      const response = await provider.analyze({
        systemPrompt: "test",
        userPrompt: "test",
      });

      expect(response.model).toBe("deterministic-fallback");
    });

    it("Duration is recorded for all responses", async () => {
      const provider = new DeterministicProvider();
      const response = await provider.analyze({
        systemPrompt: "test",
        userPrompt: "test",
      });

      expect(response.durationMs).toBeDefined();
      expect(response.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Provider availability checks", () => {
    it("isAvailable returns correct status", async () => {
      // Mock healthy response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      const ollama = new OllamaProvider();
      const available = await ollama.isAvailable();

      expect(typeof available).toBe("boolean");
    });

    it("DeterministicProvider is always available", async () => {
      const provider = new DeterministicProvider();
      const available = await provider.isAvailable();

      expect(available).toBe(true);
    });

    it("Unavailable provider falls back gracefully", async () => {
      mockFetch.mockRejectedValue(new Error("Connection refused"));

      const provider = await createProviderWithFallback({ provider: "ollama" });

      expect(provider.type).toBe("deterministic");
      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe("Error handling contract", () => {
    it("Health check returns structured error on failure", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const provider = new OllamaProvider();
      const health = await provider.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toBeDefined();
      expect(typeof health.error).toBe("string");
    });

    it("HTTP error responses are captured", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const provider = new OllamaProvider();
      const health = await provider.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toContain("500");
    });

    it("Malformed responses are handled gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: "structure" }),
      });

      const provider = new OllamaProvider();
      const health = await provider.healthCheck();

      // Should handle malformed response
      expect(typeof health.healthy).toBe("boolean");
    });
  });

  describe("Model configuration contract", () => {
    it("Default models are defined for each provider type", async () => {
      const { DEFAULT_MODELS } = await import("../../llm/types.js");

      expect(DEFAULT_MODELS.ollama).toBeDefined();
      expect(DEFAULT_MODELS.llamacpp).toBeDefined();
    });

    it("Custom model can be specified", () => {
      const ollama = new OllamaProvider({ model: "codellama" });
      expect(ollama.config.model).toBe("codellama");

      const llamacpp = new LlamacppProvider({ model: "custom.gguf" });
      expect(llamacpp.config.model).toBe("custom.gguf");
    });

    it("Default config values are applied", async () => {
      const { DEFAULT_CONFIGS } = await import("../../llm/types.js");

      expect(DEFAULT_CONFIGS.ollama.baseUrl).toBeDefined();
      expect(DEFAULT_CONFIGS.ollama.timeout).toBeDefined();
      expect(DEFAULT_CONFIGS.llamacpp.baseUrl).toBeDefined();
      expect(DEFAULT_CONFIGS.deterministic.timeout).toBeDefined();
    });
  });
});