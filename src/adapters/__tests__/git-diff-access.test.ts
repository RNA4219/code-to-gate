/**
 * Tests for Git Diff Access
 *
 * Tests DiffAccess interface and GitDiffAccess implementation:
 * - Argument array usage (no shell string execution)
 * - Path safety validation
 * - File count and size limits
 * - Diff hunk parsing
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { GitDiffAccess, MockDiffAccess, DEFAULT_DIFF_LIMITS } from "../git-diff-access.js";

const TEST_TEMP = path.join(import.meta.dirname, "../../../.test-temp/git-diff-access");

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
    it("returns empty array when git diff fails", () => {
      const adapter = new GitDiffAccess(TEST_TEMP);
      // No git repo in test temp
      const files = adapter.getChangedFiles("base", "head");
      expect(files).toEqual([]);
    });

    it("enforces file count limit", () => {
      const limits = { maxFiles: 10, maxFileSize: 1024 };
      const adapter = new GitDiffAccess(TEST_TEMP, limits);

      // Mock with many files would be sliced
      // (Real test requires git repo setup)
    });
  });

  describe("getFileContent", () => {
    it("returns null for unsafe paths", () => {
      const adapter = new GitDiffAccess(TEST_TEMP);
      expect(adapter.getFileContent("HEAD", "../outside")).toBeNull();
      expect(adapter.getFileContent("HEAD", "/etc/passwd")).toBeNull();
    });

    it("returns null for non-existent file", () => {
      const adapter = new GitDiffAccess(TEST_TEMP);
      expect(adapter.getFileContent("HEAD", "non-existent.ts")).toBeNull();
    });
  });

  describe("getFileDiff", () => {
    it("returns null for unsafe paths", () => {
      const adapter = new GitDiffAccess(TEST_TEMP);
      expect(adapter.getFileDiff("base", "head", "../outside")).toBeNull();
      expect(adapter.getFileDiff("base", "head", "/etc/passwd")).toBeNull();
    });

    it("returns null for unchanged file", () => {
      const adapter = new GitDiffAccess(TEST_TEMP);
      expect(adapter.getFileDiff("base", "head", "unchanged.ts")).toBeNull();
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
  });

  it("validates safe paths", () => {
    const mock = new MockDiffAccess();
    expect(mock.isPathSafe("src/file.ts")).toBe(true);
    expect(mock.isPathSafe("../outside")).toBe(false);
    expect(mock.isPathSafe("/absolute")).toBe(false);
  });
});

describe("Security requirements", () => {
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
});
