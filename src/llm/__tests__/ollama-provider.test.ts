/**
 * Tests for Ollama Provider
 * Uses mock API responses for testing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OllamaProvider } from "../providers/ollama-provider.js";
import { checkOllamaHealth } from "../providers/provider-health.js";

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

describe("OllamaProvider", () => {
  describe("constructor", () => {
    it("should use default configuration", () => {
      const provider = new OllamaProvider();
      expect(provider.type).toBe("ollama");
      expect(provider.config.baseUrl).toBe("http://127.0.0.1:11434");
    });

    it("should accept custom configuration", () => {
      const provider = new OllamaProvider({
        baseUrl: "http://127.0.0.1:11435",
        model: "codellama",
        timeout: 60000,
      });
      expect(provider.config.baseUrl).toBe("http://127.0.0.1:11435");
      expect(provider.config.model).toBe("codellama");
      expect(provider.config.timeout).toBe(60000);
    });

    it("should reject non-localhost URLs", () => {
      expect(() => {
        new OllamaProvider({ baseUrl: "http://remote.server.com:11434" });
      }).toThrow("Local LLM providers only allow localhost communication");
    });

    it("should accept localhost variants", () => {
      const providers = [
        "http://localhost:11434",
        "http://127.0.0.1:11434",
        "http://0.0.0.0:11434",
        "http://[::1]:11434",
      ];

      for (const url of providers) {
        const provider = new OllamaProvider({ baseUrl: url });
        expect(provider.config.baseUrl).toBe(url);
      }
    });
  });

  describe("healthCheck", () => {
    it("should return healthy when server responds", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { name: "llama3.2:latest" },
            { name: "codellama:latest" },
          ],
        }),
      });

      const provider = new OllamaProvider();
      const result = await provider.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.provider).toBe("ollama");
      expect(result.models).toContain("llama3.2:latest");
    });

    it("should return unhealthy when server fails", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const provider = new OllamaProvider();
      const result = await provider.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain("Connection refused");
    });

    it("should return unhealthy on HTTP error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const provider = new OllamaProvider();
      const result = await provider.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain("500");
    });
  });

  describe("listModels", () => {
    it("should return list of available models", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { name: "llama3.2:latest", size: 2000000000 },
            { name: "mistral:latest", size: 4000000000 },
          ],
        }),
      });

      const provider = new OllamaProvider();
      const models = await provider.listModels();

      expect(models.length).toBe(2);
      expect(models[0].name).toBe("llama3.2:latest");
    });
  });

  describe("hasModel", () => {
    it("should return true when model exists", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: "llama3.2:latest" }],
        }),
      });

      const provider = new OllamaProvider();
      const result = await provider.hasModel("llama3.2");

      expect(result).toBe(true);
    });

    it("should return false when model does not exist", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: "llama3.2:latest" }],
        }),
      });

      const provider = new OllamaProvider();
      const result = await provider.hasModel("codellama");

      expect(result).toBe(false);
    });
  });

  describe("analyze", () => {
    it("should analyze code and return response", async () => {
      // Mock models list
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: "llama3.2:latest" }],
        }),
      });

      // Mock chat response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: "llama3.2:latest",
          message: {
            role: "assistant",
            content: "Analysis: This code appears to have a potential security issue...",
          },
          prompt_eval_count: 100,
          eval_count: 50,
        }),
      });

      const provider = new OllamaProvider({ model: "llama3.2" });
      const response = await provider.analyze({
        systemPrompt: "You are a security analyst.",
        userPrompt: "Analyze this code: function login(password) { return password === 'admin123' }",
      });

      expect(response.content).toContain("Analysis");
      expect(response.model).toBe("llama3.2:latest");
      expect(response.promptTokens).toBe(100);
      expect(response.completionTokens).toBe(50);
    });

    it("should throw error when model not available", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      const provider = new OllamaProvider({ model: "nonexistent" });
      await expect(provider.analyze({
        systemPrompt: "test",
        userPrompt: "test",
      })).rejects.toThrow("is not available in Ollama");
    });

    it("should throw error on API failure", async () => {
      // Mock models list
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: "llama3.2:latest" }],
        }),
      });

      // Mock failed chat response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Bad Request",
      });

      const provider = new OllamaProvider({ model: "llama3.2" });
      await expect(provider.analyze({
        systemPrompt: "test",
        userPrompt: "test",
      })).rejects.toThrow("Ollama API error");
    });
  });

  describe("generate", () => {
    it("should generate completion with prompt", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: "llama3.2:latest",
          response: "Generated text response",
          prompt_eval_count: 20,
          eval_count: 30,
        }),
      });

      const provider = new OllamaProvider();
      const response = await provider.generate("Hello, world!");

      expect(response.content).toBe("Generated text response");
      expect(response.model).toBe("llama3.2:latest");
    });
  });
});

describe("checkOllamaHealth", () => {
  it("should check health with default URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [] }),
    });

    const result = await checkOllamaHealth();

    expect(result.healthy).toBe(true);
    expect(result.baseUrl).toBe("http://127.0.0.1:11434");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/tags",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("should retry on failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [] }),
    });

    const result = await checkOllamaHealth(undefined, { retries: 2, retryDelay: 100 });

    expect(result.healthy).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});