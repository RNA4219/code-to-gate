import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { prReviewPublishCommand } from "../pr-review-publish.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const EXIT = {
  OK: 0,
  READINESS_NOT_CLEAR: 1,
  USAGE_ERROR: 2,
  SCAN_FAILED: 3,
  LLM_FAILED: 4,
  POLICY_FAILED: 5,
  PLUGIN_FAILED: 6,
  SCHEMA_FAILED: 7,
  IMPORT_FAILED: 8,
  INTEGRATION_EXPORT_FAILED: 9,
  INTERNAL_ERROR: 10,
  ASSURANCE_FAILED: 11,
};

const VERSION = "0.1.0";

function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function writeReviewArtifacts(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "pr-review.md"), "## code-to-gate PR Review\n\nready\n", "utf8");
  writeFileSync(
    path.join(dir, "pr-review.json"),
    JSON.stringify({
      version: "ctg/v1",
      generated_at: "2026-07-05T00:00:00Z",
      run_id: "pr-review-run",
      repo: { root: "." },
      tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
      artifact: "pr-review",
      schema: "pr-review@v1",
      completeness: "complete",
      status: "pass",
      markdown: { path: path.join(dir, "pr-review.md"), generated: true },
      sections: {
        blockReasons: [],
        acceptedRisks: [],
        tests: [],
        specDrift: [],
        evidence: [],
      },
      summary: { blockers: 0, acceptedRisks: 0, tests: 0, specDrift: 0, evidenceLinks: 0 },
      generated_by: "ctg-pr-review-v1",
    }, null, 2),
    "utf8"
  );
}

describe("pr-review-publish CLI", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "ctg-pr-review-publish-"));
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("writes github-app-health.json without posting in dry-run mode", async () => {
    const artifactDir = path.join(tempRoot, "artifacts");
    writeReviewArtifacts(artifactDir);

    const exitCode = await prReviewPublishCommand([
      "--from",
      artifactDir,
      "--repo",
      "owner/repo",
      "--pull",
      "42",
      "--commit-sha",
      "abcdef1234567890",
      "--artifact-url",
      "https://example.com/artifacts/run",
      "--dry-run",
      "--quiet",
    ], { VERSION, EXIT, getOption });

    const health = JSON.parse(readFileSync(path.join(artifactDir, "github-app-health.json"), "utf8"));
    expect(exitCode).toBe(EXIT.OK);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(health).toMatchObject({
      artifact: "github-app-health",
      schema: "github-app-health@v1",
      status: "dry_run",
      authMode: "none",
      repository: { owner: "owner", repo: "repo" },
      pullRequest: { number: 42, commitSha: "abcdef1234567890" },
      publish: { action: "skipped", marker: "code-to-gate PR Review" },
    });
    expect(health.source.artifactUrl).toBe("https://example.com/artifacts/run");
    expect(health.source.markdownHashSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("updates an existing PR review comment using GITHUB_TOKEN", async () => {
    vi.stubEnv("GITHUB_TOKEN", "token-123");
    vi.stubEnv("GITHUB_SHA", "1234567890abcdef");
    const artifactDir = path.join(tempRoot, "artifacts");
    writeReviewArtifacts(artifactDir);
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          {
            id: 123,
            user: { login: "code-to-gate-app" },
            body: "## code-to-gate PR Review\nold",
            created_at: "2026-07-05T00:00:00Z",
          },
        ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 123 }),
      });

    const exitCode = await prReviewPublishCommand([
      "--from",
      artifactDir,
      "--repo",
      "owner/repo",
      "--pull",
      "42",
      "--quiet",
    ], { VERSION, EXIT, getOption });

    const health = JSON.parse(readFileSync(path.join(artifactDir, "github-app-health.json"), "utf8"));
    expect(exitCode).toBe(EXIT.OK);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][1].method).toBe("PATCH");
    expect(health.status).toBe("posted");
    expect(health.authMode).toBe("github-token");
    expect(health.pullRequest.commitSha).toBe("1234567890abcdef");
    expect(health.publish).toMatchObject({ action: "updated", commentId: 123 });
  });

  it("writes failed health evidence when authentication is missing", async () => {
    const artifactDir = path.join(tempRoot, "artifacts");
    writeReviewArtifacts(artifactDir);

    const exitCode = await prReviewPublishCommand([
      "--from",
      artifactDir,
      "--repo",
      "owner/repo",
      "--pull",
      "42",
      "--quiet",
    ], { VERSION, EXIT, getOption });

    const health = JSON.parse(readFileSync(path.join(artifactDir, "github-app-health.json"), "utf8"));
    expect(exitCode).toBe(EXIT.INTEGRATION_EXPORT_FAILED);
    expect(health.status).toBe("failed");
    expect(health.publish.action).toBe("failed");
    expect(health.error).toContain("missing GitHub authentication");
  });
});
