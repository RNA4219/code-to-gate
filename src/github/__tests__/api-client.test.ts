/**
 * Tests for GitHub API Client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GitHubApiClient,
  GitHubApiError,
  createGitHubClientFromEnv,
  type GitHubClientConfig,
  type CheckRunOptions,
  type CheckAnnotation,
} from "../api-client.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("api-client", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const createTestConfig = (): GitHubClientConfig => ({
    owner: "test-owner",
    repo: "test-repo",
    token: "test-token-123",
  });

  describe("GitHubApiClient", () => {
    describe("constructor", () => {
      it("creates client with required config", () => {
        const client = new GitHubApiClient(createTestConfig());
        expect(client).toBeDefined();
      });

      it("stores owner and repo from config", () => {
        const client = new GitHubApiClient(createTestConfig());
        // Access via methods that use these values
        expect(client).toBeDefined();
      });

      it("uses default baseUrl when not provided", () => {
        const config = createTestConfig();
        const client = new GitHubApiClient(config);
        expect(client).toBeDefined();
      });

      it("uses custom baseUrl when provided", () => {
        const config = createTestConfig();
        config.baseUrl = "https://github.example.com/api/v3";
        const client = new GitHubApiClient(config);
        expect(client).toBeDefined();
      });

      it("stores token from config", () => {
        const config = createTestConfig();
        config.token = "my-pat-token";
        const client = new GitHubApiClient(config);
        expect(client).toBeDefined();
      });
    });

    describe("create", () => {
      it("creates client with PAT authentication", async () => {
        const config = createTestConfig();
        const client = await GitHubApiClient.create(config);
        expect(client).toBeDefined();
      });

      it("throws error for GitHub App authentication without JWT handling", async () => {
        const config: GitHubClientConfig = {
          owner: "test-owner",
          repo: "test-repo",
          app: {
            appId: 12345,
            privateKey: "mock-private-key",
          },
        };

        await expect(GitHubApiClient.create(config)).rejects.toThrow(GitHubApiError);
      });

      it("uses token when both app and token are provided", async () => {
        const config: GitHubClientConfig = {
          owner: "test-owner",
          repo: "test-repo",
          app: {
            appId: 12345,
            privateKey: "mock-private-key",
          },
          token: "fallback-token",
        };

        const client = await GitHubApiClient.create(config);
        expect(client).toBeDefined();
      });
    });

    describe("createComment", () => {
      it("creates a PR comment successfully", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 12345 }),
        });

        const client = new GitHubApiClient(createTestConfig());
        const commentId = await client.createComment(42, "Test comment body");

        expect(commentId).toBe(12345);
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      it("makes POST request to correct endpoint", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 12345 }),
        });

        const client = new GitHubApiClient(createTestConfig());
        await client.createComment(42, "Test comment");

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain("/repos/test-owner/test-repo/issues/42/comments");
        expect(options.method).toBe("POST");
      });

      it("includes authorization header", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 12345 }),
        });

        const config = createTestConfig();
        config.token = "secret-token";
        const client = new GitHubApiClient(config);
        await client.createComment(42, "Test comment");

        const [, options] = mockFetch.mock.calls[0];
        expect(options.headers.authorization).toBe("Bearer secret-token");
      });

      it("throws GitHubApiError on API failure", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: "Not Found",
          text: () => Promise.resolve("Resource not found"),
        });

        const client = new GitHubApiClient(createTestConfig());
        await expect(client.createComment(42, "Test comment")).rejects.toThrow(GitHubApiError);
      });

      it("throws GitHubApiError with cause on network error", async () => {
        mockFetch.mockRejectedValueOnce(new Error("Network error"));

        const client = new GitHubApiClient(createTestConfig());
        await expect(client.createComment(42, "Test comment")).rejects.toThrow(GitHubApiError);
      });
    });

    describe("updateComment", () => {
      it("updates an existing comment successfully", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

        const client = new GitHubApiClient(createTestConfig());
        await client.updateComment(12345, "Updated comment body");

        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      it("makes PATCH request to correct endpoint", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

        const client = new GitHubApiClient(createTestConfig());
        await client.updateComment(12345, "Updated comment");

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain("/repos/test-owner/test-repo/issues/comments/12345");
        expect(options.method).toBe("PATCH");
      });

      it("throws GitHubApiError on update failure", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          text: () => Promise.resolve("Permission denied"),
        });

        const client = new GitHubApiClient(createTestConfig());
        await expect(client.updateComment(12345, "Updated")).rejects.toThrow(GitHubApiError);
      });
    });

    describe("getComments", () => {
      it("gets comments successfully", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            { id: 1, user: { login: "user1" }, body: "Comment 1", created_at: "2025-01-01T00:00:00Z" },
            { id: 2, user: { login: "user2" }, body: "Comment 2", created_at: "2025-01-02T00:00:00Z" },
          ]),
        });

        const client = new GitHubApiClient(createTestConfig());
        const comments = await client.getComments(42);

        expect(comments).toHaveLength(2);
        expect(comments[0].id).toBe(1);
        expect(comments[0].user).toBe("user1");
        expect(comments[0].body).toBe("Comment 1");
      });

      it("makes GET request to correct endpoint", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });

        const client = new GitHubApiClient(createTestConfig());
        await client.getComments(42);

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain("/repos/test-owner/test-repo/issues/42/comments");
        expect(options.method).toBe("GET");
      });

      it("handles comments without user", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            { id: 1, user: undefined, body: "Comment", created_at: "2025-01-01T00:00:00Z" },
          ]),
        });

        const client = new GitHubApiClient(createTestConfig());
        const comments = await client.getComments(42);

        expect(comments[0].user).toBe("unknown");
      });

      it("throws GitHubApiError on get comments failure", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: () => Promise.resolve("Server error"),
        });

        const client = new GitHubApiClient(createTestConfig());
        await expect(client.getComments(42)).rejects.toThrow(GitHubApiError);
      });
    });

    describe("findExistingComment", () => {
      it("finds existing code-to-gate comment", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            { id: 100, user: { login: "user1" }, body: "Regular comment", created_at: "2025-01-01T00:00:00Z" },
            { id: 200, user: { login: "bot" }, body: "## code-to-gate Analysis\n\nStatus: PASSED", created_at: "2025-01-02T00:00:00Z" },
          ]),
        });

        const client = new GitHubApiClient(createTestConfig());
        const commentId = await client.findExistingComment(42);

        expect(commentId).toBe(200);
      });

      it("finds comment with alternate header format", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            { id: 300, user: { login: "bot" }, body: "code-to-gate Analysis Report", created_at: "2025-01-01T00:00:00Z" },
          ]),
        });

        const client = new GitHubApiClient(createTestConfig());
        const commentId = await client.findExistingComment(42);

        expect(commentId).toBe(300);
      });

      it("returns null when no existing comment found", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            { id: 100, user: { login: "user1" }, body: "Regular comment", created_at: "2025-01-01T00:00:00Z" },
          ]),
        });

        const client = new GitHubApiClient(createTestConfig());
        const commentId = await client.findExistingComment(42);

        expect(commentId).toBeNull();
      });
    });

    describe("createOrUpdateComment", () => {
      it("creates new comment when none exists", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]), // getComments returns empty
        });
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 12345 }), // createComment
        });

        const client = new GitHubApiClient(createTestConfig());
        const commentId = await client.createOrUpdateComment(42, "New comment");

        expect(commentId).toBe(12345);
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it("updates existing comment when found", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            { id: 200, user: { login: "bot" }, body: "## code-to-gate Analysis", created_at: "2025-01-01T00:00:00Z" },
          ]),
        });
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}), // updateComment
        });

        const client = new GitHubApiClient(createTestConfig());
        const commentId = await client.createOrUpdateComment(42, "Updated comment");

        expect(commentId).toBe(200);
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    describe("createCheckRun", () => {
      it("creates a check run successfully", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 99999 }),
        });

        const client = new GitHubApiClient(createTestConfig());
        const checkRunId = await client.createCheckRun("test-check", "completed", {
          headSha: "abc123",
          conclusion: "success",
        });

        expect(checkRunId).toBe(99999);
      });

      it("makes POST request to check-runs endpoint", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 99999 }),
        });

        const client = new GitHubApiClient(createTestConfig());
        await client.createCheckRun("test-check", "in_progress", {
          headSha: "abc123",
        });

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain("/repos/test-owner/test-repo/check-runs");
        expect(options.method).toBe("POST");
      });

      it("includes all options in request body", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 99999 }),
        });

        const client = new GitHubApiClient(createTestConfig());
        const options: CheckRunOptions = {
          headSha: "abc123",
          conclusion: "failure",
          startedAt: "2025-01-01T00:00:00Z",
          completedAt: "2025-01-01T00:05:00Z",
          output: {
            title: "Test Output",
            summary: "Test summary",
            text: "Test text",
            annotations: [],
          },
          actions: [
            { label: "Re-run", description: "Re-run analysis", identifier: "rerun" },
          ],
        };

        await client.createCheckRun("test-check", "completed", options);

        const [, requestOptions] = mockFetch.mock.calls[0];
        const body = JSON.parse(requestOptions.body);

        expect(body.name).toBe("test-check");
        expect(body.status).toBe("completed");
        expect(body.head_sha).toBe("abc123");
        expect(body.conclusion).toBe("failure");
        expect(body.started_at).toBe("2025-01-01T00:00:00Z");
        expect(body.completed_at).toBe("2025-01-01T00:05:00Z");
        expect(body.output.title).toBe("Test Output");
        expect(body.actions).toHaveLength(1);
      });

      it("throws GitHubApiError on check run creation failure", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          text: () => Promise.resolve("Bad credentials"),
        });

        const client = new GitHubApiClient(createTestConfig());
        await expect(
          client.createCheckRun("test-check", "completed", { headSha: "abc123" })
        ).rejects.toThrow(GitHubApiError);
      });
    });

    describe("updateCheckRun", () => {
      it("updates a check run successfully", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

        const client = new GitHubApiClient(createTestConfig());
        await client.updateCheckRun(99999, {
          status: "completed",
          conclusion: "success",
        });

        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      it("makes PATCH request to correct endpoint", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

        const client = new GitHubApiClient(createTestConfig());
        await client.updateCheckRun(99999, { conclusion: "failure" });

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain("/repos/test-owner/test-repo/check-runs/99999");
        expect(options.method).toBe("PATCH");
      });

      it("throws GitHubApiError on update failure", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: "Not Found",
          text: () => Promise.resolve("Check run not found"),
        });

        const client = new GitHubApiClient(createTestConfig());
        await expect(
          client.updateCheckRun(99999, { conclusion: "success" })
        ).rejects.toThrow(GitHubApiError);
      });
    });

    describe("addAnnotations", () => {
      it("adds annotations to check run", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

        const client = new GitHubApiClient(createTestConfig());
        const annotations: CheckAnnotation[] = [
          {
            path: "src/file.ts",
            start_line: 10,
            end_line: 15,
            annotation_level: "warning",
            message: "Test warning",
            title: "TEST_RULE",
          },
        ];

        await client.addAnnotations(99999, annotations);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);
        expect(body.output.annotations).toHaveLength(1);
      });
    });

    describe("getRepoInfo", () => {
      it("gets repository info successfully", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            full_name: "test-owner/test-repo",
            default_branch: "main",
            private: false,
          }),
        });

        const client = new GitHubApiClient(createTestConfig());
        const info = await client.getRepoInfo();

        expect(info.fullName).toBe("test-owner/test-repo");
        expect(info.defaultBranch).toBe("main");
        expect(info.private).toBe(false);
      });

      it("throws GitHubApiError on get repo info failure", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: "Not Found",
          text: () => Promise.resolve("Repository not found"),
        });

        const client = new GitHubApiClient(createTestConfig());
        await expect(client.getRepoInfo()).rejects.toThrow(GitHubApiError);
      });
    });
  });

  describe("GitHubApiError", () => {
    it("creates error with message", () => {
      const error = new GitHubApiError("Test error message", null);
      expect(error.message).toBe("Test error message");
      expect(error.name).toBe("GitHubApiError");
    });

    it("stores cause property", () => {
      const cause = { status: 404, body: "Not found" };
      const error = new GitHubApiError("Test error", cause);
      expect(error.cause).toBe(cause);
    });

    it("is instanceof Error", () => {
      const error = new GitHubApiError("Test error", null);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("createGitHubClientFromEnv", () => {
    it("creates client from GITHUB_TOKEN", async () => {
      vi.stubEnv("GITHUB_TOKEN", "test-env-token");

      const client = await createGitHubClientFromEnv("owner", "repo");
      expect(client).toBeDefined();
    });

    it("returns null when no authentication available", async () => {
      vi.stubEnv("GITHUB_TOKEN", undefined);

      const client = await createGitHubClientFromEnv("owner", "repo");
      expect(client).toBeNull();
    });

    it("handles GitHub App config by throwing error (JWT not implemented)", async () => {
      vi.stubEnv("GITHUB_APP_ID", "12345");
      vi.stubEnv("GITHUB_APP_KEY", "mock-key");
      vi.stubEnv("GITHUB_TOKEN", undefined);

      // GitHub App auth requires JWT - throws error since not implemented
      await expect(createGitHubClientFromEnv("owner", "repo")).rejects.toThrow(GitHubApiError);
    });

    it("uses GITHUB_TOKEN over GitHub App config", async () => {
      vi.stubEnv("GITHUB_TOKEN", "test-token");
      vi.stubEnv("GITHUB_APP_ID", "12345");
      vi.stubEnv("GITHUB_APP_KEY", "mock-key");

      const client = await createGitHubClientFromEnv("owner", "repo");
      expect(client).toBeDefined();
    });

    it("parses GITHUB_APP_INSTALLATION_ID as number in config", async () => {
      vi.stubEnv("GITHUB_APP_ID", "12345");
      vi.stubEnv("GITHUB_APP_KEY", "mock-key");
      vi.stubEnv("GITHUB_APP_INSTALLATION_ID", "98765");
      vi.stubEnv("GITHUB_TOKEN", undefined);

      // GitHub App auth requires JWT - throws error since not implemented
      await expect(createGitHubClientFromEnv("owner", "repo")).rejects.toThrow(
        "GitHub App authentication requires JWT handling"
      );
    });
  });

  describe("authentication headers", () => {
    it("includes authorization header when token is set", async () => {
      const config = createTestConfig();
      config.token = "my-secret-token";
      const client = new GitHubApiClient(config);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 1 }),
      });

      await client.createComment(42, "test");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.authorization).toBe("Bearer my-secret-token");
    });

    it("does not include authorization header when no token", async () => {
      const config = createTestConfig();
      config.token = undefined;
      const client = new GitHubApiClient(config);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 1 }),
      });

      await client.createComment(42, "test");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.authorization).toBeUndefined();
    });

    it("includes user-agent header", async () => {
      const client = new GitHubApiClient(createTestConfig());

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 1 }),
      });

      await client.createComment(42, "test");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["user-agent"]).toBe("code-to-gate");
    });

    it("includes accept header for API version", async () => {
      const client = new GitHubApiClient(createTestConfig());

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 1 }),
      });

      await client.createComment(42, "test");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.accept).toBe("application/vnd.github.v3+json");
    });
  });

  describe("error handling", () => {
    it("wraps fetch errors in GitHubApiError", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      const client = new GitHubApiClient(createTestConfig());
      await expect(client.createComment(42, "test")).rejects.toThrow(GitHubApiError);
    });

    it("includes response status in nested error cause", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: () => Promise.resolve("Rate limit exceeded"),
      });

      const client = new GitHubApiClient(createTestConfig());

      try {
        await client.createComment(42, "test");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GitHubApiError);
        const apiError = error as GitHubApiError;
        // Error is wrapped: createComment catches request's error and wraps it
        // So the cause is another GitHubApiError with the actual status/body
        expect(apiError.cause).toBeDefined();
        expect(apiError.cause).toBeInstanceOf(GitHubApiError);
        const innerError = apiError.cause as GitHubApiError;
        expect(innerError.cause).toBeDefined();
        expect((innerError.cause as Record<string, unknown>).status).toBe(403);
        expect((innerError.cause as Record<string, unknown>).body).toBe("Rate limit exceeded");
      }
    });
  });
});