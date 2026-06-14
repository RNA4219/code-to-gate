/**
 * Unit tests for database-analyzer.ts
 *
 * SPEC-29 Phase 3: Tests Git ref failure scenarios, diagnostic generation,
 * completeness determination, and diagnostic deduplication.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync as nodeReadFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { GitFileAccess } from "../../types/contracts.js";
import type { DiffAccessResult } from "../../types/diff-contracts.js";
import { analyzeDatabaseAssetsAtRef, analyzeDatabaseAssets, WorkspaceFileSource } from "../database-analyzer.js";
import { DefaultHashService } from "../hash-service.js";

const TEST_TEMP = path.join(import.meta.dirname, "../../../.test-temp/database-analyzer-unit");

/**
 * Mock GitFileAccess for testing failure scenarios
 */
class MockGitFileAccess implements GitFileAccess {
  private listResult: DiffAccessResult<string[]>;
  private contentResults: Map<string, DiffAccessResult<string>>;

  constructor(
    listResult: DiffAccessResult<string[]>,
    contentResults: Map<string, DiffAccessResult<string>> = new Map()
  ) {
    this.listResult = listResult;
    this.contentResults = contentResults;
  }

  listFilesAtRefResult(_gitRef: string): DiffAccessResult<string[]> {
    return this.listResult;
  }

  listFilesAtRef(gitRef: string): string[] {
    const result = this.listFilesAtRefResult(gitRef);
    return result.status === "success" || result.status === "limit_exceeded"
      ? result.value!
      : [];
  }

  getFileContentResult(_gitRef: string, filePath: string): DiffAccessResult<string> {
    return this.contentResults.get(filePath) ?? { status: "success", value: "" };
  }

  getFileContent(gitRef: string, filePath: string): string | null {
    const result = this.getFileContentResult(gitRef, filePath);
    return result.status === "success" ? result.value! : null;
  }
}

describe("Database Analyzer - Git Ref Failure Scenarios", () => {
  beforeEach(() => {
    rmSync(TEST_TEMP, { recursive: true, force: true });
    mkdirSync(TEST_TEMP, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_TEMP, { recursive: true, force: true });
  });

  describe("Git file listing git_failure", () => {
    it("generates GIT_OPERATION_FAILED diagnostic", () => {
      const mockGitAccess = new MockGitFileAccess({
        status: "git_failure",
        message: "Git command failed: fatal: not a git repository",
      });

      const artifact = analyzeDatabaseAssetsAtRef({
        repoRoot: TEST_TEMP,
        gitRef: "base",
        gitFileAccess: mockGitAccess,
        hashService: new DefaultHashService(),
      });

      expect(artifact.completeness).toBe("partial");
      expect(artifact.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "GIT_OPERATION_FAILED",
          severity: "error",
        })
      );
      expect(artifact.stats.filesAnalyzed).toBe(0);
    });
  });

  describe("Git file listing ref_invalid", () => {
    it("generates INVALID_GIT_REF diagnostic", () => {
      const mockGitAccess = new MockGitFileAccess({
        status: "ref_invalid",
        message: "Invalid git ref: unknown revision 'invalid-ref'",
      });

      const artifact = analyzeDatabaseAssetsAtRef({
        repoRoot: TEST_TEMP,
        gitRef: "invalid-ref",
        gitFileAccess: mockGitAccess,
        hashService: new DefaultHashService(),
      });

      expect(artifact.completeness).toBe("partial");
      expect(artifact.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "INVALID_GIT_REF",
          severity: "error",
        })
      );
    });
  });

  describe("Git file listing limit_exceeded", () => {
    it("generates FILE_LIST_LIMIT_EXCEEDED diagnostic", () => {
      // Simulate limit exceeded with 500 files returned
      const mockGitAccess = new MockGitFileAccess({
        status: "limit_exceeded",
        value: Array.from({ length: 500 }, (_, i) => `src/file${i}.ts`),
        limit: { max: 500, actual: 600 },
      });

      const artifact = analyzeDatabaseAssetsAtRef({
        repoRoot: TEST_TEMP,
        gitRef: "base",
        gitFileAccess: mockGitAccess,
        hashService: new DefaultHashService(),
      });

      expect(artifact.completeness).toBe("partial");
      expect(artifact.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "FILE_LIST_LIMIT_EXCEEDED",
          severity: "warning",
        })
      );
    });

    it("analyzes already retrieved files even when limit exceeded", () => {
      // Simulate limit exceeded with SQL files returned
      const mockGitAccess = new MockGitFileAccess(
        {
          status: "limit_exceeded",
          value: ["migrations/V00000001__base.sql", "migrations/V00000002__head.sql"],
          limit: { max: 500, actual: 600 },
        },
        new Map([
          ["migrations/V00000001__base.sql", { status: "success", value: "CREATE TABLE users (id INT);" }],
          ["migrations/V00000002__head.sql", { status: "success", value: "CREATE TABLE orders (id INT);" }],
        ])
      );

      const artifact = analyzeDatabaseAssetsAtRef({
        repoRoot: TEST_TEMP,
        gitRef: "base",
        gitFileAccess: mockGitAccess,
        hashService: new DefaultHashService(),
      });

      expect(artifact.completeness).toBe("partial");
      expect(artifact.stats.filesAnalyzed).toBe(2);
      expect(artifact.migrations.length).toBe(2);
    });
  });

  describe("File content read failures", () => {
    it("generates diagnostic for content_unavailable", () => {
      const mockGitAccess = new MockGitFileAccess(
        { status: "success", value: ["migrations/V00000001__base.sql"] },
        new Map([
          ["migrations/V00000001__base.sql", { status: "content_unavailable", message: "File not found at ref" }],
        ])
      );

      const artifact = analyzeDatabaseAssetsAtRef({
        repoRoot: TEST_TEMP,
        gitRef: "base",
        gitFileAccess: mockGitAccess,
        hashService: new DefaultHashService(),
      });

      expect(artifact.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "FILE_NOT_FOUND_AT_REF",
          severity: "error",
          filePath: "migrations/V00000001__base.sql",
        })
      );
    });

    it("generates diagnostic for git_failure on read", () => {
      const mockGitAccess = new MockGitFileAccess(
        { status: "success", value: ["migrations/V00000001__base.sql"] },
        new Map([
          ["migrations/V00000001__base.sql", { status: "git_failure", message: "Git cat-file failed" }],
        ])
      );

      const artifact = analyzeDatabaseAssetsAtRef({
        repoRoot: TEST_TEMP,
        gitRef: "base",
        gitFileAccess: mockGitAccess,
        hashService: new DefaultHashService(),
      });

      expect(artifact.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "GIT_READ_FAILURE",
          severity: "error",
        })
      );
    });

    it("generates diagnostic for limit_exceeded on read (file too large)", () => {
      const mockGitAccess = new MockGitFileAccess(
        { status: "success", value: ["migrations/large.sql"] },
        new Map([
          ["migrations/large.sql", { status: "limit_exceeded", message: "File exceeds size limit", limit: { max: 1024 * 1024, actual: 5 * 1024 * 1024 } }],
        ])
      );

      const artifact = analyzeDatabaseAssetsAtRef({
        repoRoot: TEST_TEMP,
        gitRef: "base",
        gitFileAccess: mockGitAccess,
        hashService: new DefaultHashService(),
      });

      expect(artifact.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "FILE_SIZE_LIMIT_EXCEEDED",
          severity: "warning",
        })
      );
      // File size limit exceeded should make completeness partial
      expect(artifact.completeness).toBe("partial");
    });

    it.each([
      ["ref_invalid", "INVALID_GIT_REF_READ"],
      ["path_unsafe", "PATH_NOT_SAFE"],
      ["unexpected_status", "READ_ERROR_AT_REF"],
    ] as const)("maps %s read failures to %s", (status, code) => {
      const mockGitAccess = new MockGitFileAccess(
        { status: "success", value: ["migrations/problem.sql"] },
        new Map([
          ["migrations/problem.sql", {
            status,
            message: "structured read failure",
          } as DiffAccessResult<string>],
        ])
      );

      const artifact = analyzeDatabaseAssetsAtRef({
        repoRoot: TEST_TEMP,
        gitRef: "base",
        gitFileAccess: mockGitAccess,
      });

      expect(artifact.completeness).toBe("partial");
      expect(artifact.diagnostics).toContainEqual(expect.objectContaining({
        code,
        severity: "error",
        filePath: "migrations/problem.sql",
      }));
    });
  });

  describe("Default diagnostics and metadata", () => {
    it.each([
      ["limit_exceeded", "FILE_LIST_LIMIT_EXCEEDED"],
      ["git_failure", "GIT_OPERATION_FAILED"],
      ["ref_invalid", "INVALID_GIT_REF"],
    ] as const)("uses a safe default message for %s listing failures", (status, code) => {
      const listResult = status === "limit_exceeded"
        ? { status, value: [], limit: { actual: 2, max: 1 } }
        : { status };
      const artifact = analyzeDatabaseAssetsAtRef({
        repoRoot: TEST_TEMP,
        gitRef: "base",
        gitFileAccess: new MockGitFileAccess(listResult as DiffAccessResult<string[]>),
      });

      expect(artifact.diagnostics).toContainEqual(expect.objectContaining({ code }));
      expect(JSON.stringify(artifact.diagnostics)).not.toContain("undefined");
    });

    it("returns a partial compatibility artifact when GitFileAccess is omitted", () => {
      const artifact = analyzeDatabaseAssetsAtRef({
        repoRoot: TEST_TEMP,
        gitRef: "base",
      });

      expect(artifact.completeness).toBe("partial");
      expect(artifact.repo).toEqual(expect.objectContaining({ root: TEST_TEMP, revision: "base" }));
      expect(artifact.diagnostics).toContainEqual(expect.objectContaining({ code: "GIT_ACCESS_NOT_PROVIDED" }));
    });

    it("preserves supplied graph metadata and emits verbose phase records", () => {
      const repoDir = path.join(TEST_TEMP, "verbose-graph");
      mkdirSync(path.join(repoDir, "migrations"), { recursive: true });
      writeFileSync(path.join(repoDir, "migrations", "001.sql"), "CREATE TABLE users (id INTEGER PRIMARY KEY);", "utf8");
      const graph = {
        version: "ctg/v1",
        generated_at: "2026-06-14T00:00:00.000Z",
        run_id: "run-graph",
        repo: { root: repoDir },
        tool: { name: "code-to-gate", version: "test", plugin_versions: [] },
        files: [],
        symbols: [],
        edges: [],
        stats: { fileCount: 0, symbolCount: 0, edgeCount: 0 },
      } as never;
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

      const artifact = analyzeDatabaseAssets({ repoRoot: repoDir, graph, verbose: true });

      expect(artifact.run_id).toBe("run-graph");
      expect(artifact.tool.version).toBe("test");
      expect(log).toHaveBeenCalledTimes(2);
      log.mockRestore();
    });
  });

  describe("repo.root determination", () => {
    it("uses actual repo root for Git ref analysis", () => {
      const mockGitAccess = new MockGitFileAccess(
        { status: "success", value: [] },
        new Map()
      );

      const artifact = analyzeDatabaseAssetsAtRef({
        repoRoot: TEST_TEMP,
        gitRef: "base",
        gitFileAccess: mockGitAccess,
        hashService: new DefaultHashService(),
      });

      expect(artifact.repo.root).toBe(TEST_TEMP);
      expect(artifact.repo.root).not.toBe("");
    });
  });

  describe("Diagnostic deduplication", () => {
    it("deduplicates diagnostics with same id", () => {
      const mockGitAccess = new MockGitFileAccess(
        { status: "git_failure", message: "Git failed" },
        new Map([
          ["migrations/V00000001__base.sql", { status: "git_failure", message: "Git failed" }],
          ["migrations/V00000002__head.sql", { status: "git_failure", message: "Git failed" }],
        ])
      );

      const artifact = analyzeDatabaseAssetsAtRef({
        repoRoot: TEST_TEMP,
        gitRef: "base",
        gitFileAccess: mockGitAccess,
        hashService: new DefaultHashService(),
      });

      // Count diagnostics with same code
      const gitFailureDiags = artifact.diagnostics.filter(d => d.code === "GIT_OPERATION_FAILED");
      // Should have only one GIT_OPERATION_FAILED from listFilesAtRefResult
      expect(gitFailureDiags.length).toBe(1);
    });
  });

  describe("No DB files normal analysis", () => {
    it("returns empty diagnostics and complete status when no DB files exist", () => {
      // Create a git repo with no DB files
      const repoDir = path.join(TEST_TEMP, "no-db-repo");
      mkdirSync(repoDir, { recursive: true });
      mkdirSync(path.join(repoDir, "src"), { recursive: true });
      execFileSync("git", ["init"], { cwd: repoDir });
      execFileSync("git", ["config", "user.email", "ctg@example.invalid"], { cwd: repoDir });
      execFileSync("git", ["config", "user.name", "code-to-gate test"], { cwd: repoDir });
      writeFileSync(path.join(repoDir, "src", "index.ts"), "export {};", "utf8");
      execFileSync("git", ["add", "."], { cwd: repoDir });
      execFileSync("git", ["commit", "-m", "initial"], { cwd: repoDir });
      execFileSync("git", ["tag", "v1"], { cwd: repoDir });

      const artifact = analyzeDatabaseAssets({
        repoRoot: repoDir,
        hashService: new DefaultHashService(),
      });

      expect(artifact.diagnostics).toEqual([]);
      expect(artifact.completeness).toBe("complete");
      expect(artifact.stats.filesAnalyzed).toBe(0);
    });
  });

  describe("Workspace read failures", () => {
    it("marks workspace read failures as READ_ERROR and partial", () => {
      const repoDir = path.join(TEST_TEMP, "workspace-read-failure");
      mkdirSync(path.join(repoDir, "migrations"), { recursive: true });
      writeFileSync(path.join(repoDir, "migrations", "good.sql"), "CREATE TABLE ok (id INT);", "utf8");
      writeFileSync(path.join(repoDir, "migrations", "broken.sql"), "CREATE TABLE broken (id INT);", "utf8");

      const fileSource = new WorkspaceFileSource(repoDir, (filePath, encoding) => {
        if (filePath.endsWith(path.join("migrations", "broken.sql"))) {
          throw new Error("Permission denied");
        }
        return nodeReadFileSync(filePath, encoding);
      });

      const artifact = analyzeDatabaseAssets({
        repoRoot: repoDir,
        fileSource,
        hashService: new DefaultHashService(),
      });

      expect(artifact.completeness).toBe("partial");
      expect(artifact.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "READ_ERROR",
          severity: "error",
          filePath: "migrations/broken.sql",
        })
      );
      expect(JSON.stringify(artifact.diagnostics)).not.toContain(repoDir);
    });

    it("redacts secrets and summarizes parsing errors without exposing credentials", () => {
      const repoDir = path.join(TEST_TEMP, "workspace-redaction");
      mkdirSync(path.join(repoDir, "migrations"), { recursive: true });
      writeFileSync(
        path.join(repoDir, "migrations", "broken.sql"),
        "password='super-secret'; postgres://user:secret@example.invalid/db; CREATE TABLE broken (id INT",
        "utf8"
      );

      const artifact = analyzeDatabaseAssets({ repoRoot: repoDir });
      const serialized = JSON.stringify(artifact);

      expect(artifact.completeness).toBe("partial");
      expect(artifact.diagnostics).toContainEqual(expect.objectContaining({ code: "PARTIAL_PARSE" }));
      expect(serialized).not.toContain("super-secret");
      expect(serialized).not.toContain("user:secret@");
    });

    it("uses a safe message when a non-Error value is thrown", () => {
      const repoDir = path.join(TEST_TEMP, "workspace-unknown-error");
      mkdirSync(path.join(repoDir, "migrations"), { recursive: true });
      writeFileSync(path.join(repoDir, "migrations", "broken.sql"), "CREATE TABLE broken (id INT);", "utf8");
      const fileSource = new WorkspaceFileSource(repoDir, () => {
        throw "read failed";
      });

      const artifact = analyzeDatabaseAssets({ repoRoot: repoDir, fileSource });

      expect(artifact.diagnostics).toContainEqual(expect.objectContaining({
        code: "READ_ERROR",
        message: "Unknown error",
      }));
    });
  });
});
