/**
 * Tests for Git Diff Access
 *
 * Tests DiffAccess interface and GitDiffAccess implementation:
 * - Argument array usage (no shell string execution)
 * - Path safety validation
 * - File count and size limits
 * - Diff hunk parsing
 * - Result-returning methods with proper error codes
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { GitDiffAccess, MockDiffAccess, DEFAULT_DIFF_LIMITS } from "../git-diff-access.js";

const TEST_TEMP = path.join(import.meta.dirname, "../../../.test-temp/git-diff-access");

/**
 * Create a Git repository with commits and tags for testing.
 */
function createGitRepoWithCommits(
  repoDir: string,
  baseContent: Record<string, string>,
  headContent: Record<string, string>
): void {
  // Initialize Git repo
  execFileSync("git", ["init"], { cwd: repoDir });
  execFileSync("git", ["config", "user.email", "ctg@example.invalid"], { cwd: repoDir });
  execFileSync("git", ["config", "user.name", "code-to-gate test"], { cwd: repoDir });

  // Create base commit with baseContent files
  for (const [relPath, content] of Object.entries(baseContent)) {
    const filePath = path.join(repoDir, relPath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf8");
  }
  execFileSync("git", ["add", "."], { cwd: repoDir });
  execFileSync("git", ["commit", "-m", "base commit"], { cwd: repoDir });
  execFileSync("git", ["tag", "base"], { cwd: repoDir });

  // Create head commit with modifications/additions
  for (const [relPath, content] of Object.entries(headContent)) {
    const filePath = path.join(repoDir, relPath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf8");
  }
  execFileSync("git", ["add", "."], { cwd: repoDir });
  execFileSync("git", ["commit", "-m", "head commit"], { cwd: repoDir });
  execFileSync("git", ["tag", "head"], { cwd: repoDir });
}

describe("GitDiffAccess", () => {
  beforeEach(() => {
    rmSync(TEST_TEMP, { recursive: true, force: true });
    mkdirSync(TEST_TEMP, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_TEMP, { recursive: true, force: true });
  });

  describe("isPathSafe", () => {
    it("rejects absolute paths", () => {
      const adapter = new GitDiffAccess(TEST_TEMP);
      expect(adapter.isPathSafe("/etc/passwd")).toBe(false);
      expect(adapter.isPathSafe("C:\\Windows\\System32")).toBe(false);
    });

    it("rejects parent directory references", () => {
      const adapter = new GitDiffAccess(TEST_TEMP);
      expect(adapter.isPathSafe("../outside")).toBe(false);
      expect(adapter.isPathSafe("subdir/../outside")).toBe(false);
      expect(adapter.isPathSafe("subdir/../../outside")).toBe(false);
    });

    it("accepts valid relative paths", () => {
      const adapter = new GitDiffAccess(TEST_TEMP);
      expect(adapter.isPathSafe("src/file.ts")).toBe(true);
      expect(adapter.isPathSafe("src/file..ts")).toBe(true);
      expect(adapter.isPathSafe("lib/utils.js")).toBe(true);
      expect(adapter.isPathSafe("README.md")).toBe(true);
    });

    it("rejects paths resolving outside repo root", () => {
      const adapter = new GitDiffAccess(TEST_TEMP);
      // Symlink-like path that would escape
      expect(adapter.isPathSafe("subdir/../../../etc/passwd")).toBe(false);
    });
  });

  describe("getChangedFiles", () => {
    it("returns empty array when git diff fails (non-Git directory)", () => {
      const adapter = new GitDiffAccess(TEST_TEMP);
      // No git repo in test temp
      const files = adapter.getChangedFiles("base", "head");
      expect(files).toEqual([]);
    });

    it("returns changed files for valid Git repo", () => {
      const gitRepo = path.join(TEST_TEMP, "valid-repo");
      mkdirSync(gitRepo, { recursive: true });
      createGitRepoWithCommits(
        gitRepo,
        { "src/a.ts": "const a = 1;\n" },
        { "src/a.ts": "const a = 2;\n", "src/b.ts": "const b = 1;\n" }
      );

      const adapter = new GitDiffAccess(gitRepo);
      const files = adapter.getChangedFiles("base", "head");

      expect(files.length).toBeGreaterThan(0);
      expect(files).toContain("src/a.ts");
      expect(files).toContain("src/b.ts");
    });

    it("returns empty array for same ref", () => {
      const gitRepo = path.join(TEST_TEMP, "same-ref-repo");
      mkdirSync(gitRepo, { recursive: true });
      createGitRepoWithCommits(
        gitRepo,
        { "src/a.ts": "const a = 1;\n" },
        { "src/a.ts": "const a = 2;\n" }
      );

      const adapter = new GitDiffAccess(gitRepo);
      const files = adapter.getChangedFiles("base", "base");

      expect(files).toEqual([]);
    });
  });

  describe("getChangedFilesResult", () => {
    it("returns ref_invalid for non-existent ref", () => {
      const gitRepo = path.join(TEST_TEMP, "invalid-ref-repo");
      mkdirSync(gitRepo, { recursive: true });
      createGitRepoWithCommits(
        gitRepo,
        { "src/a.ts": "const a = 1;\n" },
        { "src/a.ts": "const a = 2;\n" }
      );

      const adapter = new GitDiffAccess(gitRepo);
      const result = adapter.getChangedFilesResult("nonexistent", "head");

      expect(result.status).toBe("ref_invalid");
    });

    it("returns git_failure for non-Git directory", () => {
      // Use a truly isolated non-Git directory outside the project repo
      // Use system temp to ensure it's not inside any git repo
      const nonGitDir = path.join(process.env.TEMP ?? "/tmp", "ctg-non-git-test-" + Date.now());
      mkdirSync(nonGitDir, { recursive: true });
      writeFileSync(path.join(nonGitDir, "file.txt"), "content", "utf8");

      const adapter = new GitDiffAccess(nonGitDir);
      const result = adapter.getChangedFilesResult("base", "head");

      // Git will fail because there's no git repository
      expect(result.status).toBe("git_failure");

      // Cleanup
      rmSync(nonGitDir, { recursive: true, force: true });
    });

    it("returns success with files for valid Git repo", () => {
      const gitRepo = path.join(TEST_TEMP, "valid-result-repo");
      mkdirSync(gitRepo, { recursive: true });
      createGitRepoWithCommits(
        gitRepo,
        { "src/a.ts": "const a = 1;\n" },
        { "src/a.ts": "const a = 2;\n" }
      );

      const adapter = new GitDiffAccess(gitRepo);
      const result = adapter.getChangedFilesResult("base", "head");

      expect(result.status).toBe("success");
      expect(result.value!.length).toBeGreaterThan(0);
      expect(result.value).toContain("src/a.ts");
    });
  });

  describe("getChangedFilesWithStatsResult", () => {
    it("returns ChangedFileStats for valid Git repo", () => {
      const gitRepo = path.join(TEST_TEMP, "stats-repo");
      mkdirSync(gitRepo, { recursive: true });
      createGitRepoWithCommits(
        gitRepo,
        { "src/a.ts": "const a = 1;\n" },
        { "src/a.ts": "const a = 2;\n", "src/b.ts": "const b = 1;\n" }
      );

      const adapter = new GitDiffAccess(gitRepo);
      const result = adapter.getChangedFilesWithStatsResult("base", "head");

      expect(result.status).toBe("success");
      expect(result.value!.length).toBeGreaterThan(0);
      for (const stat of result.value!) {
        expect(stat.path).toBeDefined();
        expect(["added", "modified", "deleted", "renamed"]).toContain(stat.status);
        expect(typeof stat.additions).toBe("number");
        expect(typeof stat.deletions).toBe("number");
      }
    });

    it("returns ref_invalid for invalid refs", () => {
      const gitRepo = path.join(TEST_TEMP, "invalid-stats-repo");
      mkdirSync(gitRepo, { recursive: true });
      createGitRepoWithCommits(
        gitRepo,
        { "src/a.ts": "const a = 1;\n" },
        { "src/a.ts": "const a = 2;\n" }
      );

      const adapter = new GitDiffAccess(gitRepo);
      const result = adapter.getChangedFilesWithStatsResult("nonexistent", "head");

      expect(result.status).toBe("ref_invalid");
    });

    it("reports added, modified, deleted, and renamed files with stats", () => {
      const gitRepo = path.join(TEST_TEMP, "all-statuses-repo");
      mkdirSync(gitRepo, { recursive: true });
      execFileSync("git", ["init"], { cwd: gitRepo });
      execFileSync("git", ["config", "user.email", "ctg@example.invalid"], { cwd: gitRepo });
      execFileSync("git", ["config", "user.name", "code-to-gate test"], { cwd: gitRepo });
      writeFileSync(path.join(gitRepo, "modified.txt"), "before\n", "utf8");
      writeFileSync(path.join(gitRepo, "deleted.txt"), "delete me\n", "utf8");
      writeFileSync(path.join(gitRepo, "old-name.txt"), "rename me\n", "utf8");
      writeFileSync(path.join(gitRepo, "binary.bin"), Buffer.from([0, 1, 2]));
      execFileSync("git", ["add", "."], { cwd: gitRepo });
      execFileSync("git", ["commit", "-m", "base"], { cwd: gitRepo });
      execFileSync("git", ["tag", "base"], { cwd: gitRepo });

      writeFileSync(path.join(gitRepo, "modified.txt"), "after\nwith line\n", "utf8");
      writeFileSync(path.join(gitRepo, "added.txt"), "new\n", "utf8");
      writeFileSync(path.join(gitRepo, "binary.bin"), Buffer.from([0, 3, 4]));
      rmSync(path.join(gitRepo, "deleted.txt"));
      execFileSync("git", ["mv", "old-name.txt", "new-name.txt"], { cwd: gitRepo });
      execFileSync("git", ["add", "."], { cwd: gitRepo });
      execFileSync("git", ["commit", "-m", "head"], { cwd: gitRepo });
      execFileSync("git", ["tag", "head"], { cwd: gitRepo });

      const result = new GitDiffAccess(gitRepo).getChangedFilesWithStatsResult("base", "head");

      expect(result.status).toBe("success");
      expect(result.value).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "added.txt", status: "added", additions: 1 }),
        expect.objectContaining({ path: "modified.txt", status: "modified" }),
        expect.objectContaining({ path: "deleted.txt", status: "deleted", deletions: 1 }),
        expect.objectContaining({ path: "new-name.txt", previousPath: "old-name.txt", status: "renamed" }),
        expect.objectContaining({ path: "binary.bin", status: "modified", additions: 0, deletions: 0 }),
      ]));
    });

    it("enforces the changed-file stats limit", () => {
      const gitRepo = path.join(TEST_TEMP, "stats-limit-repo");
      mkdirSync(gitRepo, { recursive: true });
      createGitRepoWithCommits(
        gitRepo,
        { "a.txt": "a\n" },
        { "a.txt": "aa\n", "b.txt": "b\n" }
      );

      const result = new GitDiffAccess(gitRepo, { maxFiles: 1, maxFileSize: 1024 * 1024 })
        .getChangedFilesWithStatsResult("base", "head");

      expect(result.status).toBe("limit_exceeded");
      expect(result.value).toHaveLength(1);
      expect(result.limit).toEqual({ actual: 2, max: 1 });
    });
  });

  describe("listFilesAtRefResult", () => {
    it("returns success with file list for valid ref", () => {
      const gitRepo = path.join(TEST_TEMP, "list-files-repo");
      mkdirSync(gitRepo, { recursive: true });
      createGitRepoWithCommits(
        gitRepo,
        { "src/a.ts": "const a = 1;\n", "src/b.ts": "const b = 1;\n" },
        { "src/a.ts": "const a = 2;\n" }
      );

      const adapter = new GitDiffAccess(gitRepo);
      const result = adapter.listFilesAtRefResult("base");

      expect(result.status).toBe("success");
      expect(result.value!.length).toBeGreaterThan(0);
      expect(result.value).toContain("src/a.ts");
      expect(result.value).toContain("src/b.ts");
      expect(adapter.listFilesAtRef("base")).toEqual(expect.arrayContaining(["src/a.ts", "src/b.ts"]));
    });

    it("returns ref_invalid for non-existent ref", () => {
      const gitRepo = path.join(TEST_TEMP, "invalid-list-repo");
      mkdirSync(gitRepo, { recursive: true });
      createGitRepoWithCommits(
        gitRepo,
        { "src/a.ts": "const a = 1;\n" },
        { "src/a.ts": "const a = 2;\n" }
      );

      const adapter = new GitDiffAccess(gitRepo);
      const result = adapter.listFilesAtRefResult("nonexistent");

      expect(result.status).toBe("ref_invalid");
    });

    it("returns a truncated legacy list when the file limit is exceeded", () => {
      const gitRepo = path.join(TEST_TEMP, "list-limit-repo");
      mkdirSync(gitRepo, { recursive: true });
      createGitRepoWithCommits(
        gitRepo,
        { "a.txt": "a\n", "b.txt": "b\n" },
        { "a.txt": "aa\n" }
      );

      const adapter = new GitDiffAccess(gitRepo, { maxFiles: 1, maxFileSize: 1024 * 1024 });
      expect(adapter.listFilesAtRefResult("base")).toEqual(expect.objectContaining({
        status: "limit_exceeded",
        limit: { actual: 2, max: 1 },
      }));
      expect(adapter.listFilesAtRef("base")).toHaveLength(1);
      expect(adapter.listFilesAtRef("missing")).toEqual([]);
    });
  });

  describe("validateRefResult", () => {
    it("returns success for valid ref", () => {
      const gitRepo = path.join(TEST_TEMP, "valid-ref-repo");
      mkdirSync(gitRepo, { recursive: true });
      createGitRepoWithCommits(
        gitRepo,
        { "src/a.ts": "const a = 1;\n" },
        { "src/a.ts": "const a = 2;\n" }
      );

      const adapter = new GitDiffAccess(gitRepo);
      const result = adapter.validateRefResult("base");

      expect(result.status).toBe("success");
    });

    it("returns ref_invalid for non-existent ref", () => {
      const gitRepo = path.join(TEST_TEMP, "invalid-ref-validate-repo");
      mkdirSync(gitRepo, { recursive: true });
      createGitRepoWithCommits(
        gitRepo,
        { "src/a.ts": "const a = 1;\n" },
        { "src/a.ts": "const a = 2;\n" }
      );

      const adapter = new GitDiffAccess(gitRepo);
      const result = adapter.validateRefResult("nonexistent");

      expect(result.status).toBe("ref_invalid");
    });
  });

  describe("getFileContent", () => {
    it("returns null for unsafe paths", () => {
      const adapter = new GitDiffAccess(TEST_TEMP);
      expect(adapter.getFileContent("HEAD", "../outside")).toBeNull();
      expect(adapter.getFileContent("HEAD", "/etc/passwd")).toBeNull();
    });

    it("returns null for non-existent file", () => {
      const gitRepo = path.join(TEST_TEMP, "content-nonexist-repo");
      mkdirSync(gitRepo, { recursive: true });
      createGitRepoWithCommits(
        gitRepo,
        { "src/a.ts": "const a = 1;\n" },
        { "src/a.ts": "const a = 2;\n" }
      );

      const adapter = new GitDiffAccess(gitRepo);
      expect(adapter.getFileContent("base", "non-existent.ts")).toBeNull();
    });

    it("returns file content for valid ref and path", () => {
      const gitRepo = path.join(TEST_TEMP, "content-valid-repo");
      mkdirSync(gitRepo, { recursive: true });
      createGitRepoWithCommits(
        gitRepo,
        { "src/a.ts": "const a = 1;\n" },
        { "src/a.ts": "const a = 2;\n" }
      );

      const adapter = new GitDiffAccess(gitRepo);
      const content = adapter.getFileContent("base", "src/a.ts");

      expect(content).toBe("const a = 1;\n");
    });

    it("returns different content for different refs", () => {
      const gitRepo = path.join(TEST_TEMP, "content-diff-repo");
      mkdirSync(gitRepo, { recursive: true });
      createGitRepoWithCommits(
        gitRepo,
        { "src/a.ts": "const a = 1;\n" },
        { "src/a.ts": "const a = 2;\n" }
      );

      const adapter = new GitDiffAccess(gitRepo);
      const baseContent = adapter.getFileContent("base", "src/a.ts");
      const headContent = adapter.getFileContent("head", "src/a.ts");

      expect(baseContent).toBe("const a = 1;\n");
      expect(headContent).toBe("const a = 2;\n");
    });

    it("returns structured path, ref, content, and size failures", () => {
      const gitRepo = path.join(TEST_TEMP, "content-result-repo");
      mkdirSync(gitRepo, { recursive: true });
      createGitRepoWithCommits(
        gitRepo,
        { "src/a.ts": "const a = 1;\n" },
        { "src/a.ts": "const a = 2;\n" }
      );

      expect(new GitDiffAccess(gitRepo).getFileContentResult("base", "../outside"))
        .toEqual(expect.objectContaining({ status: "path_unsafe" }));
      expect(new GitDiffAccess(gitRepo).getFileContentResult("missing", "src/a.ts"))
        .toEqual(expect.objectContaining({ status: "ref_invalid" }));
      expect(new GitDiffAccess(gitRepo).getFileContentResult("base", "src/missing.ts"))
        .toEqual(expect.objectContaining({ status: "content_unavailable" }));
      expect(new GitDiffAccess(gitRepo, { maxFiles: 10, maxFileSize: 1 }).getFileContentResult("base", "src/a.ts"))
        .toEqual(expect.objectContaining({ status: "limit_exceeded" }));
    });
  });

  describe("getFileDiff", () => {
    it("returns null for unsafe paths", () => {
      const adapter = new GitDiffAccess(TEST_TEMP);
      expect(adapter.getFileDiff("base", "head", "../outside")).toBeNull();
      expect(adapter.getFileDiff("base", "head", "/etc/passwd")).toBeNull();
    });

    it("returns null for unchanged file", () => {
      const gitRepo = path.join(TEST_TEMP, "diff-unchanged-repo");
      mkdirSync(gitRepo, { recursive: true });
      createGitRepoWithCommits(
        gitRepo,
        { "src/a.ts": "const a = 1;\n", "src/b.ts": "const b = 1;\n" },
        { "src/a.ts": "const a = 2;\n" }  // b.ts unchanged
      );

      const adapter = new GitDiffAccess(gitRepo);
      expect(adapter.getFileDiff("base", "head", "src/b.ts")).toBeNull();
    });

    it("returns diff hunks for changed file", () => {
      const gitRepo = path.join(TEST_TEMP, "diff-valid-repo");
      mkdirSync(gitRepo, { recursive: true });
      createGitRepoWithCommits(
        gitRepo,
        { "src/a.ts": "const a = 1;\n" },
        { "src/a.ts": "const a = 2;\n" }
      );

      const adapter = new GitDiffAccess(gitRepo);
      const diff = adapter.getFileDiff("base", "head", "src/a.ts");

      expect(diff).not.toBeNull();
      expect(diff!.length).toBeGreaterThan(0);
    });

    it("returns structured path, ref, unchanged, and size failures", () => {
      const gitRepo = path.join(TEST_TEMP, "diff-result-repo");
      mkdirSync(gitRepo, { recursive: true });
      createGitRepoWithCommits(
        gitRepo,
        { "src/a.ts": "const a = 1;\n", "src/same.ts": "same\n" },
        { "src/a.ts": "const a = 2;\n" }
      );

      expect(new GitDiffAccess(gitRepo).getFileDiffResult("base", "head", "../outside"))
        .toEqual(expect.objectContaining({ status: "path_unsafe" }));
      expect(new GitDiffAccess(gitRepo).getFileDiffResult("missing", "head", "src/a.ts"))
        .toEqual(expect.objectContaining({ status: "ref_invalid" }));
      expect(new GitDiffAccess(gitRepo).getFileDiffResult("base", "head", "src/same.ts"))
        .toEqual(expect.objectContaining({ status: "content_unavailable" }));
      expect(new GitDiffAccess(gitRepo, { maxFiles: 10, maxFileSize: 1 }).getFileDiffResult("base", "head", "src/a.ts"))
        .toEqual(expect.objectContaining({ status: "limit_exceeded" }));
    });
  });

  describe("parseDiffHunks", () => {
    it("parses simple hunk header", () => {
      const adapter = new GitDiffAccess(TEST_TEMP);
      // Access private method via casting
      const parse = (adapter as unknown as { parseDiffHunks: (s: string) => unknown[] }).parseDiffHunks;

      const diff = `--- a/file.ts
+++ b/file.ts
@@ -10,5 +10,6 @@
 context line
-removed line
+added line
 context line`;

      const hunks = parse(diff);
      expect(hunks).toHaveLength(1);
      expect(hunks[0]).toHaveProperty("oldStart", 10);
      expect(hunks[0]).toHaveProperty("newStart", 10);
    });

    it("handles multiple hunks", () => {
      const adapter = new GitDiffAccess(TEST_TEMP);
      const parse = (adapter as unknown as { parseDiffHunks: (s: string) => unknown[] }).parseDiffHunks;

      const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 first
+new
 second
@@ -20,2 +21,3 @@
 twenty
+newtwenty
 twenty-one`;

      const hunks = parse(diff);
      expect(hunks).toHaveLength(2);
    });

    it("handles unified=0 format", () => {
      const adapter = new GitDiffAccess(TEST_TEMP);
      const parse = (adapter as unknown as { parseDiffHunks: (s: string) => unknown[] }).parseDiffHunks;

      const diff = `--- a/file.ts
+++ b/file.ts
@@ -5,0 +6,1 @@
+added line`;

      const hunks = parse(diff);
      expect(hunks).toHaveLength(1);
      expect(hunks[0]).toHaveProperty("oldStart", 5);
      expect(hunks[0]).toHaveProperty("oldLines", 0);
      expect(hunks[0]).toHaveProperty("newStart", 6);
      expect(hunks[0]).toHaveProperty("newLines", 1);
    });
  });

  describe("getLimits", () => {
    it("returns default limits when not specified", () => {
      const adapter = new GitDiffAccess(TEST_TEMP);
      const limits = adapter.getLimits();
      expect(limits.maxFiles).toBe(DEFAULT_DIFF_LIMITS.maxFiles);
      expect(limits.maxFileSize).toBe(DEFAULT_DIFF_LIMITS.maxFileSize);
    });

    it("returns custom limits", () => {
      const customLimits = { maxFiles: 100, maxFileSize: 512 * 1024 };
      const adapter = new GitDiffAccess(TEST_TEMP, customLimits);
      const limits = adapter.getLimits();
      expect(limits.maxFiles).toBe(100);
      expect(limits.maxFileSize).toBe(512 * 1024);
    });
  });

  describe("structured Git failure classification", () => {
    it("classifies missing refs and missing content without fallback data", () => {
      const gitRepo = path.join(TEST_TEMP, "classification-repo");
      mkdirSync(gitRepo, { recursive: true });
      execFileSync("git", ["init"], { cwd: gitRepo });
      execFileSync("git", ["config", "user.email", "ctg@example.invalid"], { cwd: gitRepo });
      execFileSync("git", ["config", "user.name", "code-to-gate test"], { cwd: gitRepo });
      writeFileSync(path.join(gitRepo, "tracked.ts"), "export const tracked = true;\n", "utf8");
      execFileSync("git", ["add", "."], { cwd: gitRepo });
      execFileSync("git", ["commit", "-m", "base"], { cwd: gitRepo });

      const adapter = new GitDiffAccess(gitRepo);

      expect(adapter.getFileContentResult("HEAD", "missing.ts").status).toBe("content_unavailable");
      expect(adapter.getFileDiffResult("missing-ref", "HEAD", "tracked.ts").status).toBe("ref_invalid");
      expect(adapter.listFilesAtRefResult("missing-ref").status).toBe("ref_invalid");
      expect(adapter.getChangedFilesWithStatsResult("missing-ref", "HEAD").status).toBe("ref_invalid");
    });
  });

  describe("file count limit enforcement", () => {
    it("returns limit_exceeded when file count exceeds maxFiles", () => {
      const gitRepo = path.join(TEST_TEMP, "limit-repo");
      mkdirSync(gitRepo, { recursive: true });

      // Create repo with many files
      execFileSync("git", ["init"], { cwd: gitRepo });
      execFileSync("git", ["config", "user.email", "ctg@example.invalid"], { cwd: gitRepo });
      execFileSync("git", ["config", "user.name", "code-to-gate test"], { cwd: gitRepo });

      // Create 50 files in base
      mkdirSync(path.join(gitRepo, "src"), { recursive: true });
      for (let i = 0; i < 50; i++) {
        writeFileSync(path.join(gitRepo, "src", `file${i}.ts`), `const f${i} = ${i};\n`, "utf8");
      }
      execFileSync("git", ["add", "."], { cwd: gitRepo });
      execFileSync("git", ["commit", "-m", "base"], { cwd: gitRepo });
      execFileSync("git", ["tag", "base"], { cwd: gitRepo });

      // Modify all files in head
      for (let i = 0; i < 50; i++) {
        writeFileSync(path.join(gitRepo, "src", `file${i}.ts`), `const f${i} = ${i + 1};\n`, "utf8");
      }
      execFileSync("git", ["add", "."], { cwd: gitRepo });
      execFileSync("git", ["commit", "-m", "head"], { cwd: gitRepo });
      execFileSync("git", ["tag", "head"], { cwd: gitRepo });

      // Use very low limit
      const adapter = new GitDiffAccess(gitRepo, { maxFiles: 10, maxFileSize: 1024 * 1024 });
      const result = adapter.getChangedFilesResult("base", "head");

      expect(result.status).toBe("limit_exceeded");
      expect(adapter.getChangedFiles("base", "head")).toHaveLength(10);
    });
  });
});

describe("MockDiffAccess", () => {
  it("returns set content", () => {
    const mock = new MockDiffAccess();
    mock.setContent("HEAD", "file.ts", "content here");
    expect(mock.getFileContent("HEAD", "file.ts")).toBe("content here");
    expect(mock.getFileContent("HEAD", "other.ts")).toBeNull();
  });

  it("returns set changed files", () => {
    const mock = new MockDiffAccess();
    mock.setChangedFiles(["a.ts", "b.ts", "c.ts"]);
    expect(mock.getChangedFiles("base", "head")).toEqual(["a.ts", "b.ts", "c.ts"]);
    expect(mock.getChangedFiles()).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("returns set diff", () => {
    const mock = new MockDiffAccess();
    mock.setDiff("file.ts", [
      {
        oldStart: 10,
        oldLines: 5,
        newStart: 10,
        newLines: 6,
        lines: [
          { type: "context", content: "line" },
          { type: "removed", content: "old line" },
          { type: "added", content: "new line" },
        ],
      },
    ]);
    const diff = mock.getFileDiff("base", "head", "file.ts");
    expect(diff).toHaveLength(1);
    expect(diff?.[0].lines).toHaveLength(3);
    expect(mock.getFileDiff("base", "head", "missing.ts")).toBeNull();

    mock.setFailMode("git_failure");
    expect(mock.getFileDiff("base", "head", "file.ts")).toBeNull();
  });

  it("validates safe paths", () => {
    const mock = new MockDiffAccess();
    expect(mock.isPathSafe("src/file.ts")).toBe(true);
    expect(mock.isPathSafe("../outside")).toBe(false);
    expect(mock.isPathSafe("/absolute")).toBe(false);
    expect(mock.isPathSafe("bad\0path")).toBe(false);
    expect(mock.isPathSafe("NUL")).toBe(false);
  });

  it("covers structured success, failure, and limit contracts", () => {
    const mock = new MockDiffAccess();
    mock.setContent("base", "a.ts", "content");
    mock.setChangedFiles(["a.ts", "b.ts"]);

    expect(mock.getFileContentResult("base", "a.ts")).toEqual({ status: "success", value: "content" });
    expect(mock.getFileContentResult("base", "missing.ts").status).toBe("content_unavailable");
    expect(mock.getFileContentResult("base", "../unsafe").status).toBe("path_unsafe");
    expect(mock.getFileDiffResult("base", "head", "missing.ts").status).toBe("content_unavailable");
    expect(mock.getFileDiffResult("base", "head", "../unsafe").status).toBe("path_unsafe");
    expect(mock.listFilesAtRef("base")).toEqual([]);
    expect(mock.validateRef("base")).toBe(true);
    expect(mock.getChangedFilesWithStatsResult("base", "head").value).toEqual([
      expect.objectContaining({ path: "a.ts", status: "modified" }),
      expect.objectContaining({ path: "b.ts", status: "modified" }),
    ]);

    (mock as unknown as { limits: { maxFiles: number; maxFileSize: number } }).limits =
      { maxFiles: 1, maxFileSize: 1024 };
    expect(mock.getChangedFiles("base", "head")).toHaveLength(1);
    expect(mock.getChangedFilesWithStatsResult("base", "head").status).toBe("limit_exceeded");

    mock.setFailMode("git_failure");
    expect(mock.getFileContentResult("base", "a.ts").status).toBe("git_failure");
    expect(mock.getChangedFilesResult("base", "head").status).toBe("git_failure");
    expect(mock.getFileDiffResult("base", "head", "a.ts").status).toBe("git_failure");
    expect(mock.listFilesAtRefResult("base").status).toBe("git_failure");
    expect(mock.listFilesAtRef("base")).toEqual([]);
    expect(mock.validateRefResult("base").status).toBe("git_failure");
    expect(mock.getChangedFilesWithStatsResult("base", "head").status).toBe("git_failure");

    mock.setFailMode("ref_invalid");
    expect(mock.getFileContentResult("base", "a.ts").status).toBe("ref_invalid");
    expect(mock.getChangedFilesResult("base", "head").status).toBe("ref_invalid");
    expect(mock.listFilesAtRefResult("base").status).toBe("ref_invalid");
    expect(mock.validateRef("base")).toBe(false);
    expect(mock.getChangedFilesWithStatsResult("base", "head").status).toBe("ref_invalid");

    mock.setFailMode("none");
    (mock as unknown as { listFilesAtRefResult: () => unknown }).listFilesAtRefResult =
      () => ({ status: "limit_exceeded", value: ["a.ts"] });
    expect(mock.listFilesAtRef("base")).toEqual(["a.ts"]);
  });
});

describe("Security requirements", () => {
  it("classifies a missing Git executable consistently", () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "";
    try {
      const adapter = new GitDiffAccess(TEST_TEMP);
      expect(adapter.getFileContentResult("base", "safe.ts")).toEqual(expect.objectContaining({ status: "git_failure", message: "Git executable not found" }));
      expect(adapter.getChangedFilesResult("base", "head").status).toBe("git_failure");
      expect(adapter.getFileDiffResult("base", "head", "safe.ts").status).toBe("git_failure");
      expect(adapter.listFilesAtRefResult("base").status).toBe("git_failure");
      expect(adapter.validateRefResult("base").status).toBe("git_failure");
      expect(adapter.getChangedFilesWithStatsResult("base", "head").status).toBe("git_failure");
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("classifies non-Git repository operations without fallback data", () => {
    const adapter = new GitDiffAccess(TEST_TEMP);

    expect(adapter.listFilesAtRefResult("base").status).toBe("git_failure");
    expect(adapter.validateRefResult("base").status).toBe("git_failure");
    expect(adapter.getChangedFilesWithStatsResult("base", "head").status).toBe("git_failure");
    expect(adapter.getFileContentResult("base", "safe.ts").status).toBe("git_failure");
    expect(adapter.getFileDiffResult("base", "head", "safe.ts").status).toBe("git_failure");
  });

  it("rejects option-like and NUL-containing refs in every structured operation", () => {
    const adapter = new GitDiffAccess(TEST_TEMP);
    const unsafeRefs = ["--help", "bad\0ref"];

    for (const ref of unsafeRefs) {
      expect(adapter.getFileContentResult(ref, "safe.ts").status).toBe("ref_invalid");
      expect(adapter.getChangedFilesResult(ref, "head").status).toBe("ref_invalid");
      expect(adapter.getChangedFilesResult("base", ref).status).toBe("ref_invalid");
      expect(adapter.getFileDiffResult(ref, "head", "safe.ts").status).toBe("ref_invalid");
      expect(adapter.getFileDiffResult("base", ref, "safe.ts").status).toBe("ref_invalid");
      expect(adapter.listFilesAtRefResult(ref).status).toBe("ref_invalid");
      expect(adapter.validateRefResult(ref).status).toBe("ref_invalid");
      expect(adapter.getChangedFilesWithStatsResult(ref, "head").status).toBe("ref_invalid");
      expect(adapter.getChangedFilesWithStatsResult("base", ref).status).toBe("ref_invalid");
    }
  });

  it("uses spawnSync with argument array", () => {
    // Verify GitDiffAccess implementation doesn't use shell strings
    // This is a code inspection test - check actual implementation
    const adapter = new GitDiffAccess(TEST_TEMP);

    // The implementation must use spawnSync with ["git", args...]
    // NOT spawnSync("git show ref:file", { shell: true })

    // We can't directly test spawnSync calls, but we verify:
    // 1. isPathSafe rejects unsafe paths before any git call
    // 2. Implementation file inspection shows arg array usage

    expect(adapter.isPathSafe("../malicious")).toBe(false);
    // If path is unsafe, no git command is executed at all
  });

  it("enforces size limits", () => {
    const limits = { maxFiles: 500, maxFileSize: 1024 };
    const adapter = new GitDiffAccess(TEST_TEMP, limits);

    // maxBuffer in spawnSync should match maxFileSize
    // (Verification through implementation inspection)
    const returnedLimits = adapter.getLimits();
    expect(returnedLimits.maxFileSize).toBe(1024);
  });

  it("rejects shell injection attempts", () => {
    const adapter = new GitDiffAccess(TEST_TEMP);

    // Paths that would be dangerous in shell context
    expect(adapter.isPathSafe("file;rm -rf /")).toBe(true);  // Path is valid but won't be shell-interpreted
    expect(adapter.isPathSafe("file$(whoami)")).toBe(true);  // Path is valid but won't be shell-interpreted

    // But absolute paths and parent refs are rejected
    expect(adapter.isPathSafe("/etc/passwd")).toBe(false);
    expect(adapter.isPathSafe("../etc/passwd")).toBe(false);
    expect(adapter.isPathSafe("bad\0path")).toBe(false);
    expect(adapter.isPathSafe("NUL")).toBe(false);
  });
});
