/**
 * Git Diff Access Implementation
 *
 * Provides safe Git diff operations for Assurance Detector.
 * Uses spawnSync with argument array - NO shell string execution.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import type {
  DiffHunk,
  DiffAccess,
  DiffAccessLimits,
  DiffAccessResult,
  LegacyContentResult,
  LegacyFilesResult,
  LegacyDiffResult,
} from "../types/diff-contracts.js";

// Re-export for backward compatibility
export type {
  DiffHunk,
  DiffLine,
  DiffAccess,
  DiffAccessLimits,
  DiffAccessResult,
  DiffAccessStatus,
} from "../types/diff-contracts.js";

export const DEFAULT_DIFF_LIMITS: DiffAccessLimits = {
  maxFiles: 500,
  maxFileSize: 1024 * 1024, // 1 MiB
};

/**
 * Git-based DiffAccess implementation using spawnSync.
 *
 * Security:
 * - Uses argument array (no shell string execution)
 * - Validates paths are within repo root
 * - Enforces file count and size limits
 */
export class GitDiffAccess implements DiffAccess {
  private repoRoot: string;
  private limits: DiffAccessLimits;

  constructor(repoRoot: string, limits: DiffAccessLimits = DEFAULT_DIFF_LIMITS) {
    this.repoRoot = path.resolve(repoRoot);
    this.limits = limits;
  }

  getFileContent(ref: string, filePath: string): LegacyContentResult {
    const result = this.getFileContentResult(ref, filePath);
    return result.status === "success" ? result.value! : null;
  }

  getFileContentResult(
    ref: string,
    filePath: string
  ): DiffAccessResult<string> {
    // Path validation first
    if (!this.isPathSafe(filePath)) {
      return {
        status: "path_unsafe",
        message: `Path rejected: ${filePath} (absolute, .., NUL, or outside repo)`,
      };
    }

    // Use spawnSync with argument array - NO shell string
    const result = spawnSync("git", ["show", `${ref}:${filePath}`], {
      cwd: this.repoRoot,
      encoding: "utf8",
      maxBuffer: this.limits.maxFileSize,
      timeout: 10000, // 10 second timeout
    });

    // Check for git executable failure
    if (result.error) {
      const errCode = (result.error as NodeJS.ErrnoException).code;
      if (errCode === "ENOENT") {
        return {
          status: "git_failure",
          message: "Git executable not found",
        };
      }
      return {
        status: "git_failure",
        message: result.error.message,
      };
    }

    // Check for ref/content errors
    if (result.status !== 0) {
      const stderr = result.stderr?.trim() || "";
      // Distinguish ref_invalid from content_unavailable
      if (
        stderr.includes("invalid object") ||
        stderr.includes("unknown revision")
      ) {
        return {
          status: "ref_invalid",
          message: `Git ref '${ref}' does not exist or is invalid`,
        };
      }
      if (stderr.includes("does not exist") || stderr.includes("not found")) {
        return {
          status: "content_unavailable",
          message: `File '${filePath}' does not exist at ref '${ref}'`,
        };
      }
      return {
        status: "git_failure",
        message: stderr || `Git show failed with exit code ${result.status}`,
      };
    }

    // Check size limit
    const contentSize = Buffer.byteLength(result.stdout);
    if (contentSize > this.limits.maxFileSize) {
      return {
        status: "limit_exceeded",
        message: `File content exceeds size limit`,
        limit: { actual: contentSize, max: this.limits.maxFileSize },
      };
    }

    return {
      status: "success",
      value: result.stdout,
    };
  }

  getChangedFiles(base: string, head: string): LegacyFilesResult {
    const result = this.getChangedFilesResult(base, head);
    return result.status === "success"
      ? result.value!
      : result.status === "limit_exceeded"
        ? result.value! // Return truncated list on limit exceeded
        : [];
  }

  getChangedFilesResult(
    base: string,
    head: string
  ): DiffAccessResult<string[]> {
    const result = spawnSync("git", ["diff", "--name-only", base, head], {
      cwd: this.repoRoot,
      encoding: "utf8",
      timeout: 30000, // 30 second timeout for large repos
    });

    // Check for git executable failure
    if (result.error) {
      const errCode = (result.error as NodeJS.ErrnoException).code;
      if (errCode === "ENOENT") {
        return {
          status: "git_failure",
          message: "Git executable not found",
        };
      }
      return {
        status: "git_failure",
        message: result.error.message,
      };
    }

    // Check for ref errors
    if (result.status !== 0) {
      const stderr = result.stderr?.trim() || "";
      if (
        stderr.includes("invalid object") ||
        stderr.includes("unknown revision")
      ) {
        return {
          status: "ref_invalid",
          message: `Git ref(s) do not exist: '${base}' or '${head}'`,
        };
      }
      return {
        status: "git_failure",
        message: stderr || `Git diff failed with exit code ${result.status}`,
      };
    }

    // Parse and filter files
    const files = result.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .filter((f) => this.isPathSafe(f));

    // Check file count limit
    if (files.length > this.limits.maxFiles) {
      return {
        status: "limit_exceeded",
        value: files.slice(0, this.limits.maxFiles), // Provide truncated list
        message: `Changed files count exceeds limit`,
        limit: { actual: files.length, max: this.limits.maxFiles },
      };
    }

    return {
      status: "success",
      value: files,
    };
  }

  getFileDiff(
    base: string,
    head: string,
    filePath: string
  ): LegacyDiffResult {
    const result = this.getFileDiffResult(base, head, filePath);
    return result.status === "success" ? result.value! : null;
  }

  getFileDiffResult(
    base: string,
    head: string,
    filePath: string
  ): DiffAccessResult<DiffHunk[]> {
    // Path validation first
    if (!this.isPathSafe(filePath)) {
      return {
        status: "path_unsafe",
        message: `Path rejected: ${filePath}`,
      };
    }

    const result = spawnSync("git", [
      "diff",
      "--unified=0",
      base,
      head,
      "--",
      filePath,
    ], {
      cwd: this.repoRoot,
      encoding: "utf8",
      maxBuffer: this.limits.maxFileSize,
      timeout: 10000,
    });

    // Check for git executable failure
    if (result.error) {
      const errCode = (result.error as NodeJS.ErrnoException).code;
      if (errCode === "ENOENT") {
        return {
          status: "git_failure",
          message: "Git executable not found",
        };
      }
      return {
        status: "git_failure",
        message: result.error.message,
      };
    }

    // Check for ref/content errors
    if (result.status !== 0) {
      const stderr = result.stderr?.trim() || "";
      if (
        stderr.includes("invalid object") ||
        stderr.includes("unknown revision")
      ) {
        return {
          status: "ref_invalid",
          message: `Git ref(s) do not exist: '${base}' or '${head}'`,
        };
      }
      return {
        status: "git_failure",
        message: stderr || `Git diff failed with exit code ${result.status}`,
      };
    }

    // No changes (empty output)
    if (!result.stdout.trim()) {
      return {
        status: "content_unavailable",
        message: `No diff for '${filePath}' between '${base}' and '${head}'`,
      };
    }

    // Check size limit
    const diffSize = Buffer.byteLength(result.stdout);
    if (diffSize > this.limits.maxFileSize) {
      return {
        status: "limit_exceeded",
        message: `Diff output exceeds size limit`,
        limit: { actual: diffSize, max: this.limits.maxFileSize },
      };
    }

    return {
      status: "success",
      value: this.parseDiffHunks(result.stdout),
    };
  }

  isPathSafe(filePath: string): boolean {
    // Reject absolute paths
    if (path.isAbsolute(filePath)) return false;

    // Reject NUL bytes (security: prevents path truncation attacks)
    if (filePath.includes("\0") || filePath.includes("NUL")) return false;

    // Reject parent directory references without rejecting ordinary names such as "file..ts".
    if (filePath.split(/[\\/]/u).includes("..")) return false;

    // Resolve and check it stays within repo root
    const resolved = path.resolve(this.repoRoot, filePath);
    const normalized = path.normalize(resolved);

    const relative = path.relative(this.repoRoot, normalized);
    return relative !== ".."
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative);
  }

  getLimits(): DiffAccessLimits {
    return { ...this.limits };
  }

  private parseDiffHunks(diffOutput: string): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    const lines = diffOutput.split("\n");

    let currentHunk: DiffHunk | null = null;

    for (const line of lines) {
      // Parse hunk header: @@ -oldStart,oldLines +newStart,newLines @@
      const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (hunkMatch) {
        if (currentHunk) hunks.push(currentHunk);

        currentHunk = {
          oldStart: parseInt(hunkMatch[1], 10),
          oldLines: parseInt(hunkMatch[2] || "1", 10),
          newStart: parseInt(hunkMatch[3], 10),
          newLines: parseInt(hunkMatch[4] || "1", 10),
          lines: [],
        };
        continue;
      }

      if (currentHunk) {
        if (line.startsWith("-") && !line.startsWith("---")) {
          currentHunk.lines.push({ type: "removed", content: line.slice(1) });
        } else if (line.startsWith("+") && !line.startsWith("+++")) {
          currentHunk.lines.push({ type: "added", content: line.slice(1) });
        } else if (line.startsWith(" ")) {
          currentHunk.lines.push({ type: "context", content: line.slice(1) });
        }
      }
    }

    if (currentHunk) hunks.push(currentHunk);

    return hunks;
  }
}

/**
 * Mock DiffAccess for testing.
 */
export class MockDiffAccess implements DiffAccess {
  private fileContents: Map<string, string> = new Map();
  private changedFiles: string[] = [];
  private diffs: Map<string, DiffHunk[]> = new Map();
  private limits: DiffAccessLimits = DEFAULT_DIFF_LIMITS;
  private failMode: "none" | "git_failure" | "ref_invalid" | "limit_exceeded" =
    "none";

  setContent(ref: string, filePath: string, content: string): void {
    this.fileContents.set(`${ref}:${filePath}`, content);
  }

  setChangedFiles(files: string[]): void {
    this.changedFiles = files;
  }

  setDiff(filePath: string, hunks: DiffHunk[]): void {
    this.diffs.set(filePath, hunks);
  }

  /** Set mock failure mode for testing error handling */
  setFailMode(mode: "none" | "git_failure" | "ref_invalid" | "limit_exceeded"): void {
    this.failMode = mode;
  }

  getFileContent(ref: string, filePath: string): LegacyContentResult {
    const result = this.getFileContentResult(ref, filePath);
    return result.status === "success" ? result.value! : null;
  }

  getFileContentResult(
    ref: string,
    filePath: string
  ): DiffAccessResult<string> {
    if (this.failMode === "git_failure") {
      return { status: "git_failure", message: "Mock git failure" };
    }
    if (this.failMode === "ref_invalid") {
      return { status: "ref_invalid", message: `Mock: ref '${ref}' invalid` };
    }

    if (!this.isPathSafe(filePath)) {
      return { status: "path_unsafe", message: `Path rejected: ${filePath}` };
    }

    const content = this.fileContents.get(`${ref}:${filePath}`);
    if (content === undefined) {
      return {
        status: "content_unavailable",
        message: `File '${filePath}' not at ref '${ref}'`,
      };
    }

    return { status: "success", value: content };
  }

  getChangedFiles(_base?: string, _head?: string): LegacyFilesResult {
    const result = this.getChangedFilesResult(
      _base ?? "base",
      _head ?? "head"
    );
    return result.status === "success" ||
      result.status === "limit_exceeded"
      ? result.value!
      : [];
  }

  getChangedFilesResult(
    _base: string,
    _head: string
  ): DiffAccessResult<string[]> {
    if (this.failMode === "git_failure") {
      return { status: "git_failure", message: "Mock git failure" };
    }
    if (this.failMode === "ref_invalid") {
      return { status: "ref_invalid", message: "Mock: refs invalid" };
    }

    if (this.changedFiles.length > this.limits.maxFiles) {
      return {
        status: "limit_exceeded",
        value: this.changedFiles.slice(0, this.limits.maxFiles),
        message: "Mock: files exceeded limit",
        limit: { actual: this.changedFiles.length, max: this.limits.maxFiles },
      };
    }

    return { status: "success", value: this.changedFiles };
  }

  getFileDiff(
    _base: string,
    _head: string,
    filePath: string
  ): LegacyDiffResult {
    const result = this.getFileDiffResult(_base, _head, filePath);
    return result.status === "success" ? result.value! : null;
  }

  getFileDiffResult(
    _base: string,
    _head: string,
    filePath: string
  ): DiffAccessResult<DiffHunk[]> {
    if (this.failMode === "git_failure") {
      return { status: "git_failure", message: "Mock git failure" };
    }

    if (!this.isPathSafe(filePath)) {
      return { status: "path_unsafe", message: `Path rejected: ${filePath}` };
    }

    const diff = this.diffs.get(filePath);
    if (diff === undefined) {
      return {
        status: "content_unavailable",
        message: `No diff for '${filePath}'`,
      };
    }

    return { status: "success", value: diff };
  }

  isPathSafe(filePath: string): boolean {
    // Match GitDiffAccess behavior for consistency
    if (path.isAbsolute(filePath)) return false;
    if (filePath.includes("\0") || filePath.includes("NUL")) return false;
    if (filePath.split(/[\\/]/u).includes("..")) return false;
    return true;
  }

  getLimits(): DiffAccessLimits {
    return { ...this.limits };
  }
}
