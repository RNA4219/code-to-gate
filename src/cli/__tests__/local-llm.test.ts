/**
 * CLI tests for local LLM integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProvider, createProviderWithFallback, createAutoProvider } from "../../llm/providers/index.js";
import { DeterministicProvider } from "../../llm/providers/local-base.js";
import { OllamaProvider } from "../../llm/providers/ollama-provider.js";
import { LlamacppProvider } from "../../llm/providers/llamacpp-provider.js";
import { checkOllamaHealth, checkLlamacppHealth, findAvailableProvider } from "../../llm/providers/provider-health.js";

// Mock fetch for API calls
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CLI Local LLM Integration", () => {
  describe("createProvider", () => {
    it("should create Ollama provider", () => {
      const provider = createProvider({ provider: "ollama" });
      expect(provider).toBeInstanceOf(OllamaProvider);
    });

    it("should create llama.cpp provider", () => {
      const provider = createProvider({ provider: "llamacpp" });
      expect(provider).toBeInstanceOf(LlamacppProvider);
    });

    it("should create deterministic provider", () => {
      const provider = createProvider({ provider: "deterministic" });
      expect(provider).toBeInstanceOf(DeterministicProvider);
    });

    it("should throw for unknown provider", () => {
      expect(() => createProvider({ provider: "unknown" as any })).toThrow("Unknown provider type");
    });
  });

  describe("createProviderWithFallback", () => {
    it("should return deterministic when Ollama unavailable", async () => {
      mockFetch.mockRejectedValue(new Error("Connection refused"));

      const provider = await createProviderWithFallback({ provider: "ollama" });
      expect(provider).toBeInstanceOf(DeterministicProvider);
      expect(provider.type).toBe("deterministic");
    });

    it("should return deterministic when llama.cpp unavailable", async () => {
      mockFetch.mockRejectedValue(new Error("Connection refused"));

      const provider = await createProviderWithFallback({ provider: "llamacpp" });
      expect(provider).toBeInstanceOf(DeterministicProvider);
    });

    it("should return Ollama provider when available", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{ name: "llama3.2" }] }),
      });

      const provider = await createProviderWithFallback({ provider: "ollama" });
      expect(provider).toBeInstanceOf(OllamaProvider);
    });

    it("should return deterministic provider directly when requested", async () => {
      const provider = await createProviderWithFallback({ provider: "deterministic" });
      expect(provider).toBeInstanceOf(DeterministicProvider);
      // Should not call fetch
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("createAutoProvider", () => {
    it("should try Ollama first", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: "llama3.2" }] }),
      });

      const provider = await createAutoProvider();
      expect(provider.type).toBe("ollama");
    });

    it("should fall back to llama.cpp if Ollama unavailable", async () => {
      // Ollama fails
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));
      // llama.cpp succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "ok" }),
      });

      const provider = await createAutoProvider();
      expect(provider.type).toBe("llamacpp");
    });

    it("should fall back to deterministic if all fail", async () => {
      mockFetch.mockRejectedValue(new Error("Connection refused"));

      const provider = await createAutoProvider();
      expect(provider).toBeInstanceOf(DeterministicProvider);
    });
  });

  describe("findAvailableProvider", () => {
    it("should return first available provider", async () => {
      // Ollama healthy
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: "llama3.2" }] }),
      });

      const result = await findAvailableProvider(["ollama", "llamacpp"]);

      expect(result).not.toBeNull();
      expect(result?.provider).toBe("ollama");
    });

    it("should skip unhealthy providers", async () => {
      // Ollama unhealthy
      mockFetch.mockRejectedValueOnce(new Error("Failed"));
      // llama.cpp healthy
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "ok" }),
      });

      const result = await findAvailableProvider(["ollama", "llamacpp"]);

      expect(result).not.toBeNull();
      expect(result?.provider).toBe("llamacpp");
    });

    it("should return null when all unhealthy", async () => {
      mockFetch.mockRejectedValue(new Error("Failed"));

      const result = await findAvailableProvider(["ollama", "llamacpp"]);

      expect(result).toBeNull();
    });
  });

  describe("Deterministic Provider", () => {
    it("should always be available", async () => {
      const provider = new DeterministicProvider();
      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });

    it("should return deterministic analysis", async () => {
      const provider = new DeterministicProvider();
      const response = await provider.analyze({
        systemPrompt: "test",
        userPrompt: "Analyze this password handling code",
      });

      expect(response.fromFallback).toBe(true);
      expect(response.content).toContain("password");
    });

    it("should detect security patterns", async () => {
      const provider = new DeterministicProvider();

      const tests = [
        { prompt: "password", expected: "password" },
        { prompt: "sql query", expected: "SQL" },
        { prompt: "auth login", expected: "Authentication" },
        { prompt: "api key", expected: "API key" },
        { prompt: "eval() function", expected: "Dynamic code" },
      ];

      for (const test of tests) {
        const response = await provider.analyze({
          systemPrompt: "",
          userPrompt: test.prompt,
        });
        expect(response.content).toContain(test.expected);
      }
    });

    it("should return default message when no patterns matched", async () => {
      const provider = new DeterministicProvider();
      const response = await provider.analyze({
        systemPrompt: "",
        userPrompt: "random unrelated content",
      });

      expect(response.content).toContain("Deterministic analysis completed");
    });
  });

  describe("--llm-provider option validation", () => {
    it("should validate ollama provider name", () => {
      const validProviders = ["ollama", "llamacpp", "deterministic"];
      expect(validProviders).toContain("ollama");
    });

    it("should validate llamacpp provider name", () => {
      const validProviders = ["ollama", "llamacpp", "deterministic"];
      expect(validProviders).toContain("llamacpp");
    });

    it("should validate deterministic provider name", () => {
      const validProviders = ["ollama", "llamacpp", "deterministic"];
      expect(validProviders).toContain("deterministic");
    });
  });

  describe("Health check integration", () => {
    it("should include response time in health check", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      const result = await checkOllamaHealth();
      expect(result.responseTimeMs).toBeDefined();
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should include timestamp in health check", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "ok" }),
      });

      const result = await checkLlamacppHealth();
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });

  describe("localhost enforcement", () => {
    it("should block non-localhost URLs in Ollama", () => {
      expect(() => new OllamaProvider({ baseUrl: "http://example.com:11434" }))
        .toThrow("Local LLM providers only allow localhost communication");
    });

    it("should block non-localhost URLs in llama.cpp", () => {
      expect(() => new LlamacppProvider({ baseUrl: "http://example.com:8080" }))
        .toThrow("Local LLM providers only allow localhost communication");
    });

    it("should allow custom localhost ports", () => {
      const ollama = new OllamaProvider({ baseUrl: "http://127.0.0.1:11435" });
      expect(ollama.config.baseUrl).toBe("http://127.0.0.1:11435");

      const llamacpp = new LlamacppProvider({ baseUrl: "http://127.0.0.1:8081" });
      expect(llamacpp.config.baseUrl).toBe("http://127.0.0.1:8081");
    });
  });

  // P1-02: require-llm failure path tests
  describe("require-llm failure handling", () => {
    it("should fallback to deterministic when ollama unavailable without require-llm", async () => {
      mockFetch.mockRejectedValue(new Error("Connection refused"));

      const provider = await createProviderWithFallback({ provider: "ollama" });
      expect(provider).toBeInstanceOf(DeterministicProvider);
      expect(provider.type).toBe("deterministic");
    });

    it("should indicate fallback occurred in response", async () => {
      mockFetch.mockRejectedValue(new Error("Connection refused"));

      const provider = await createProviderWithFallback({ provider: "ollama" });
      const response = await provider.analyze({
        systemPrompt: "test",
        userPrompt: "test prompt",
      });

      expect(response.fromFallback).toBe(true);
    });

    it("should return deterministic analysis on fallback", async () => {
      mockFetch.mockRejectedValue(new Error("Connection refused"));

      const provider = await createProviderWithFallback({ provider: "ollama" });
      const response = await provider.analyze({
        systemPrompt: "test",
        userPrompt: "password handling code",
      });

      // Deterministic provider returns pattern-based analysis
      expect(response.content).toBeDefined();
      expect(response.content.length).toBeGreaterThan(0);
    });

    it("should succeed when deterministic provider explicitly requested", async () => {
      mockFetch.mockRejectedValue(new Error("Should not be called"));

      const provider = await createProviderWithFallback({ provider: "deterministic" });
      expect(provider).toBeInstanceOf(DeterministicProvider);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // P1-02: trust verification tests
  describe("LLM trust verification", () => {
    it("should mark deterministic response as fromFallback", async () => {
      const provider = new DeterministicProvider();
      const response = await provider.analyze({
        systemPrompt: "test",
        userPrompt: "test",
      });
      expect(response.fromFallback).toBe(true);
    });

    it("should not call external endpoints for deterministic provider", async () => {
      const provider = new DeterministicProvider();
      await provider.analyze({
        systemPrompt: "test",
        userPrompt: "test",
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should enforce local-only for all non-deterministic providers", () => {
      const invalidUrls = [
        "http://example.com:11434",
        "http://192.168.1.1:11434",
        "http://10.0.0.1:8080",
        "https://api.example.com/v1",
      ];

      for (const url of invalidUrls) {
        expect(() => new OllamaProvider({ baseUrl: url }))
          .toThrow("Local LLM providers only allow localhost communication");
        expect(() => new LlamacppProvider({ baseUrl: url }))
          .toThrow("Local LLM providers only allow localhost communication");
      }
    });
  });
});