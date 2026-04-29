/**
 * Tests for llama.cpp Provider
 * Uses mock API responses for testing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LlamacppProvider } from "../providers/llamacpp-provider.js";
import { checkLlamacppHealth } from "../providers/provider-health.js";

// Mock fetch for API calls
const mockFetch = vi.fn();

// Set up global fetch mock
beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LlamacppProvider", () => {
  describe("constructor", () => {
    it("should use default configuration", () => {
      const provider = new LlamacppProvider();
      expect(provider.type).toBe("llamacpp");
      expect(provider.config.baseUrl).toBe("http://127.0.0.1:8080");
    });

    it("should accept custom configuration", () => {
      const provider = new LlamacppProvider({
        baseUrl: "http://127.0.0.1:8081",
        model: "custom-model.gguf",
        timeout: 60000,
      });
      expect(provider.config.baseUrl).toBe("http://127.0.0.1:8081");
      expect(provider.config.model).toBe("custom-model.gguf");
      expect(provider.config.timeout).toBe(60000);
    });

    it("should reject non-localhost URLs", () => {
      expect(() => {
        new LlamacppProvider({ baseUrl: "http://remote.server.com:8080" });
      }).toThrow("Local LLM providers only allow localhost communication");
    });

    it("should accept localhost variants", () => {
      const providers = [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://0.0.0.0:8080",
        "http://[::1]:8080",
      ];

      for (const url of providers) {
        const provider = new LlamacppProvider({ baseUrl: url });
        expect(provider.config.baseUrl).toBe(url);
      }
    });
  });

  describe("healthCheck", () => {
    it("should return healthy when server responds", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "ok" }),
      });

      // Mock props endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model_path: "/models/llama-3.2.gguf",
        }),
      });

      const provider = new LlamacppProvider();
      const result = await provider.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.provider).toBe("llamacpp");
    });

    it("should return unhealthy when server fails", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const provider = new LlamacppProvider();
      const result = await provider.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain("Connection refused");
    });

    it("should return unhealthy on HTTP error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      const provider = new LlamacppProvider();
      const result = await provider.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain("503");
    });
  });

  describe("getProps", () => {
    it("should return server properties", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          default_generation_settings: {
            n_ctx: 4096,
            temp: 0.7,
          },
          model_path: "/models/llama-3.2.gguf",
        }),
      });

      const provider = new LlamacppProvider();
      const props = await provider.getProps();

      expect(props).not.toBeNull();
      expect(props?.model_path).toBe("/models/llama-3.2.gguf");
    });

    it("should return null on error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Failed"));

      const provider = new LlamacppProvider();
      const props = await provider.getProps();

      expect(props).toBeNull();
    });
  });

  describe("tokenize", () => {
    it("should tokenize text", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tokens: [1, 2, 3, 4, 5] }),
      });

      const provider = new LlamacppProvider();
      const tokens = await provider.tokenize("Hello world");

      expect(tokens).toEqual([1, 2, 3, 4, 5]);
    });

    it("should throw on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: "Bad Request",
      });

      const provider = new LlamacppProvider();
      await expect(provider.tokenize("test")).rejects.toThrow("Tokenization failed");
    });
  });

  describe("analyze", () => {
    it("should analyze code and return response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: "Analysis: This code has potential issues...",
          tokens_evaluated: 100,
          tokens_predicted: 50,
        }),
      });

      const provider = new LlamacppProvider();
      const response = await provider.analyze({
        systemPrompt: "You are a security analyst.",
        userPrompt: "Analyze this code: function login(password) { return password === 'admin123' }",
      });

      expect(response.content).toContain("Analysis");
      expect(response.model).toBe("local-model");
      expect(response.promptTokens).toBe(100);
      expect(response.completionTokens).toBe(50);
    });

    it("should throw error on API failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Bad Request",
      });

      const provider = new LlamacppProvider();
      await expect(provider.analyze({
        systemPrompt: "test",
        userPrompt: "test",
      })).rejects.toThrow("llama.cpp API error");
    });
  });

  describe("generate", () => {
    it("should generate completion with prompt", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: "Generated response",
          tokens_evaluated: 20,
          tokens_predicted: 30,
        }),
      });

      const provider = new LlamacppProvider();
      const response = await provider.generate("Hello, world!");

      expect(response.content).toBe("Generated response");
      expect(response.model).toBe("local-model");
    });

    it("should respect stop sequences", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: "Response",
        }),
      });

      const provider = new LlamacppProvider();
      const response = await provider.generate("test", {
        stop: ["\n\n", "END"],
      });

      expect(response.content).toBe("Response");
      // Verify stop sequences were passed
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"stop"'),
        })
      );
    });
  });

  describe("chat", () => {
    it("should handle chat-style messages", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: "Assistant response",
          tokens_evaluated: 50,
          tokens_predicted: 30,
        }),
      });

      const provider = new LlamacppProvider();
      const response = await provider.chat([
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hello!" },
      ]);

      expect(response.content).toBe("Assistant response");
    });
  });

  describe("embed", () => {
    it("should generate embeddings", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
        }),
      });

      const provider = new LlamacppProvider();
      const embedding = await provider.embed("Hello world");

      expect(embedding.length).toBe(5);
      expect(embedding[0]).toBe(0.1);
    });

    it("should throw on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: "Not Found",
      });

      const provider = new LlamacppProvider();
      await expect(provider.embed("test")).rejects.toThrow("Embedding failed");
    });
  });
});

describe("checkLlamacppHealth", () => {
  it("should check health with default URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ model_path: "/models/test.gguf" }),
    });

    const result = await checkLlamacppHealth();

    expect(result.healthy).toBe(true);
    expect(result.baseUrl).toBe("http://127.0.0.1:8080");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/health",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("should handle missing props endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    mockFetch.mockRejectedValueOnce(new Error("Props endpoint not available"));

    const result = await checkLlamacppHealth();

    expect(result.healthy).toBe(true);
    expect(result.models).toContain("local-model");
  });

  it("should retry on failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    // Second call succeeds, props call also succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ model_path: "/models/test.gguf" }),
    });

    const result = await checkLlamacppHealth(undefined, { retries: 2, retryDelay: 100 });

    expect(result.healthy).toBe(true);
    // First attempt: health fails, second attempt: health succeeds + props
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});