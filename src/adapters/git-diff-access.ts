/**
 * Git Diff Access Implementation
 *
 * Provides safe Git diff operations for Assurance Detector.
 * Uses spawnSync with argument array - NO shell string execution.
 *
 * Security:
 * - Rejects refs containing NUL bytes (prevents option injection via malformed refs)
 * - Uses --end-of-options to prevent option injection attacks
 * - Uses -z flag for NUL-delimited output (handles filenames with special chars)
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
  ChangedFileStats,
} from "../types/diff-contracts.js";

// Re-export for backward compatibility
export type {
  DiffHunk,
  DiffLine,
  DiffAccess,
  DiffAccessLimits,
  DiffAccessResult,
  DiffAccessStatus,
  ChangedFileStats,
} from "../types/diff-contracts.js";

export const DEFAULT_DIFF_LIMITS: DiffAccessLimits = {
  maxFiles: 500,
  maxFileSize: 1024 * 1024, // 1 MiB
};

/**
 * Limits for database analysis operations.
 * Higher limits allow comprehensive DB migration discovery.
 * SPEC-29 Phase 3: Added to prevent SQL migration truncation.
 */
export const DB_ANALYSIS_LIMITS: DiffAccessLimits = {
  maxFiles: 10000,
  maxFileSize: 5 * 1024 * 1024, // 5 MiB for large migration files
};

/**
 * Check if a Git ref contains NUL bytes or option-like prefixes.
 * Rejects refs that could be interpreted as Git options.
 */
function isRefSafe(ref: string): boolean {
  // Reject NUL bytes (security: prevents path/ref truncation attacks)
  if (ref.includes("\0")) return false;
  // Reject refs that look like Git options (starts with -)
  if (ref.startsWith("-")) return false;
  return true;
}

/**
 * Create ref_invalid result for unsafe refs
 */
function unsafeRefResult(ref: string): DiffAccessResult<never> {
  if (ref.includes("\0")) {
    return {
      status: "ref_invalid",
      message: `Git ref contains NUL byte: rejected for security`,
    };
  }
  if (ref.startsWith("-")) {
    return {
      status: "ref_invalid",
      message: `Git ref '${ref}' looks like a Git option: rejected for security`,
    };
  }
  throw new Error("unsafeRefResult called with a safe ref");
}

function classifySpawnError(
  error: Error | undefined,
  limit?: { message: string; max: number }
): DiffAccessResult<never> | null {
  if (!error) return null;

  const errCode = (error as NodeJS.ErrnoException).code;
  if (errCode === "ENOENT") {
    return { status: "git_failure", message: "Git executable not found" };
  }
  if (errCode === "ENOBUFS" && limit) {
    return {
      status: "limit_exceeded",
      message: limit.message,
      limit: { actual: limit.max + 1, max: limit.max },
    };
  }
  return { status: "git_failure", message: error.message };
}

function isInvalidRefError(stderr: string): boolean {
  return [
    "invalid object",
    "unknown revision",
    "Not a valid object name",
    "bad revision",
    "ambiguous argument",
  ].some(fragment => stderr.includes(fragment));
}

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
    // Ref validation: reject NUL bytes and option-like refs
    if (!isRefSafe(ref)) {
      return unsafeRefResult(ref);
    }

    // Path validation first
    if (!this.isPathSafe(filePath)) {
      return {
        status: "path_unsafe",
        message: `Path rejected: ${filePath} (absolute, .., NUL, or outside repo)`,
      };
    }

    // Use spawnSync with argument array - NO shell string
    // Use --end-of-options to prevent ref being interpreted as Git option
    const result = spawnSync("git", ["show", "--end-of-options", `${ref}:${filePath}`], {
      cwd: this.repoRoot,
      encoding: "utf8",
      maxBuffer: this.limits.maxFileSize,
      timeout: 10000, // 10 second timeout
    });

    const spawnError = classifySpawnError(result.error, {
      message: "File content exceeds size limit",
      max: this.limits.maxFileSize,
    });
    if (spawnError) return spawnError;

    // Check for ref/content errors
    if (result.status !== 0) {
      const stderr = result.stderr?.trim() || "";
      // Distinguish ref_invalid from content_unavailable
      if (isInvalidRefError(stderr)) {
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
    // Ref validation: reject NUL bytes and option-like refs
    if (!isRefSafe(base)) {
      return unsafeRefResult(base);
    }
    if (!isRefSafe(head)) {
      return unsafeRefResult(head);
    }

    // Use --end-of-options to prevent refs being interpreted as Git options
    const result = spawnSync("git", ["diff", "--name-only", "--end-of-options", base, head], {
      cwd: this.repoRoot,
      encoding: "utf8",
      timeout: 30000, // 30 second timeout for large repos
    });

    const spawnError = classifySpawnError(result.error);
    if (spawnError) return spawnError;

    // Check for ref errors
    if (result.status !== 0) {
      const stderr = result.stderr?.trim() || "";
      if (isInvalidRefError(stderr)) {
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
    // Ref validation: reject NUL bytes and option-like refs
    if (!isRefSafe(base)) {
      return unsafeRefResult(base);
    }
    if (!isRefSafe(head)) {
      return unsafeRefResult(head);
    }

    // Path validation first
    if (!this.isPathSafe(filePath)) {
      return {
        status: "path_unsafe",
        message: `Path rejected: ${filePath}`,
      };
    }

    // Use --end-of-options to prevent refs being interpreted as Git options
    const result = spawnSync("git", [
      "diff",
      "--unified=0",
      "--end-of-options",
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

    const spawnError = classifySpawnError(result.error, {
      message: "Diff output exceeds size limit",
      max: this.limits.maxFileSize,
    });
    if (spawnError) return spawnError;

    // Check for ref/content errors
    if (result.status !== 0) {
      const stderr = result.stderr?.trim() || "";
      if (isInvalidRefError(stderr)) {
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

  // ============================================================
  // New methods for file enumeration and ref validation
  // ============================================================

  listFilesAtRef(ref: string): LegacyFilesResult {
    const result = this.listFilesAtRefResult(ref);
    return result.status === "success"
      ? result.value!
      : result.status === "limit_exceeded"
        ? result.value!
        : [];
  }

  listFilesAtRefResult(ref: string): DiffAccessResult<string[]> {
    // Ref validation: reject NUL bytes and option-like refs
    if (!isRefSafe(ref)) {
      return unsafeRefResult(ref);
    }

    // Use --end-of-options to prevent ref being interpreted as Git option
    const result = spawnSync("git", ["ls-tree", "-r", "--name-only", "--end-of-options", ref], {
      cwd: this.repoRoot,
      encoding: "utf8",
      timeout: 30000, // 30 second timeout for large repos
    });

    const spawnError = classifySpawnError(result.error);
    if (spawnError) return spawnError;

    // Check for ref errors
    if (result.status !== 0) {
      const stderr = result.stderr?.trim() || "";
      if (isInvalidRefError(stderr)) {
        return {
          status: "ref_invalid",
          message: `Git ref '${ref}' does not exist or is invalid`,
        };
      }
      return {
        status: "git_failure",
        message: stderr || `Git ls-tree failed with exit code ${result.status}`,
      };
    }

    // Parse and filter files (apply path safety)
    const files = result.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .filter((f) => this.isPathSafe(f));

    // Check file count limit
    if (files.length > this.limits.maxFiles) {
      return {
        status: "limit_exceeded",
        value: files.slice(0, this.limits.maxFiles),
        message: "File count exceeds limit",
        limit: { actual: files.length, max: this.limits.maxFiles },
      };
    }

    return {
      status: "success",
      value: files,
    };
  }

  validateRef(ref: string): boolean {
    const result = this.validateRefResult(ref);
    return result.status === "success";
  }

  validateRefResult(ref: string): DiffAccessResult<void> {
    // Ref validation: reject NUL bytes and option-like refs
    if (!isRefSafe(ref)) {
      return unsafeRefResult(ref);
    }

    // Use --end-of-options to prevent ref being interpreted as Git option
    const result = spawnSync("git", ["rev-parse", "--verify", "--end-of-options", ref], {
      cwd: this.repoRoot,
      encoding: "utf8",
      timeout: 5000, // 5 second timeout
    });

    const spawnError = classifySpawnError(result.error);
    if (spawnError) return spawnError;

    // Check for ref errors
    if (result.status !== 0) {
      const stderr = result.stderr?.trim() || "";
      return {
        status: "ref_invalid",
        message: `Git ref '${ref}' is invalid or does not exist: ${stderr}`,
      };
    }

    return {
      status: "success",
      value: undefined,
    };
  }

  getChangedFilesWithStatsResult(
    base: string,
    head: string
  ): DiffAccessResult<ChangedFileStats[]> {
    // Ref validation: reject NUL bytes and option-like refs
    if (!isRefSafe(base)) {
      return unsafeRefResult(base);
    }
    if (!isRefSafe(head)) {
      return unsafeRefResult(head);
    }

    // Get name-status with -z for NUL-delimited output (handles special chars in filenames)
    // Use --end-of-options to prevent refs being interpreted as Git options
    const nameStatusResult = spawnSync(
      "git",
      ["diff", "--name-status", "-z", "--end-of-options", base, head],
      {
        cwd: this.repoRoot,
        encoding: "utf8",
        timeout: 30000,
      }
    );

    const nameStatusError = classifySpawnError(nameStatusResult.error);
    if (nameStatusError) return nameStatusError;

    // Check for ref errors
    if (nameStatusResult.status !== 0) {
      const stderr = nameStatusResult.stderr?.trim() || "";
      if (isInvalidRefError(stderr)) {
        return {
          status: "ref_invalid",
          message: `Git ref(s) do not exist: '${base}' or '${head}'`,
        };
      }
      return {
        status: "git_failure",
        message: stderr || `Git diff failed with exit code ${nameStatusResult.status}`,
      };
    }

    // Get numstat with -z for NUL-delimited output
    const numstatResult = spawnSync(
      "git",
      ["diff", "--numstat", "-z", "--end-of-options", base, head],
      {
        cwd: this.repoRoot,
        encoding: "utf8",
        timeout: 30000,
      }
    );

    const numstatError = classifySpawnError(numstatResult.error);
    if (numstatError) return numstatError;

    if (numstatResult.status !== 0) {
      const stderr = numstatResult.stderr?.trim() || "";
      return {
        status: "git_failure",
        message: stderr || `Git diff --numstat failed with exit code ${numstatResult.status}`,
      };
    }

    // Parse NUL-delimited name-status output
    // Format with -z: status NUL path NUL (for normal)
    // For renames: status NUL oldPath NUL newPath NUL
    const statusMap: Map<string, { status: "added" | "modified" | "deleted" | "renamed"; previousPath?: string }> =
      new Map();
    const nameStatusParts = nameStatusResult.stdout.split("\0").filter((p) => p.length > 0);

    for (let i = 0; i < nameStatusParts.length; i++) {
      const statusOrPath = nameStatusParts[i];
      // status codes: A, M, D, Rxx, Cxx
      if (/^[AMDRC]/.test(statusOrPath)) {
        const status = statusOrPath;
        const filePath = nameStatusParts[i + 1];
        if (!filePath) continue;

        if (status === "A") {
          statusMap.set(filePath, { status: "added" });
          i += 1; // consume one path
        } else if (status === "M") {
          statusMap.set(filePath, { status: "modified" });
          i += 1;
        } else if (status === "D") {
          statusMap.set(filePath, { status: "deleted" });
          i += 1;
        } else if (status.startsWith("R") || status.startsWith("C")) {
          // Rename/Copy: status, oldPath, newPath
          const oldPath = filePath;
          const newPath = nameStatusParts[i + 2];
          if (newPath) {
            statusMap.set(newPath, { status: "renamed", previousPath: oldPath });
            i += 2; // consume two paths
          } else {
            i += 1;
          }
        } else {
          i += 1;
        }
      }
    }

    // Parse NUL-delimited numstat output.
    // Normal: additions TAB deletions TAB path NUL
    // Rename/copy: additions TAB deletions TAB NUL oldPath NUL newPath NUL
    const statsMap: Map<string, { additions: number; deletions: number }> =
      new Map();
    const numstatParts = numstatResult.stdout.split("\0").filter((p) => p.length > 0);

    for (let i = 0; i < numstatParts.length; i++) {
      const part = numstatParts[i];
      const fields = part.split("\t");
      if (fields.length < 3) continue;

      const [addStr, delStr, ...pathFields] = fields;
      const additions = addStr === "-" ? 0 : parseInt(addStr, 10);
      const deletions = delStr === "-" ? 0 : parseInt(delStr, 10);
      const inlinePath = pathFields.join("\t");

      if (inlinePath) {
        statsMap.set(inlinePath, { additions, deletions });
        continue;
      }

      const oldPath = numstatParts[i + 1];
      const newPath = numstatParts[i + 2];
      if (newPath) {
        statsMap.set(newPath, { additions, deletions });
        i += 2;
      } else if (oldPath) {
        statsMap.set(oldPath, { additions, deletions });
        i += 1;
      }
    }

    // Build combined result
    const changedFiles: ChangedFileStats[] = [];
    for (const [filePath, statusInfo] of statusMap) {
      // Skip unsafe paths
      if (!this.isPathSafe(filePath)) continue;
      if (statusInfo.previousPath && !this.isPathSafe(statusInfo.previousPath)) continue;

      const stats = statsMap.get(filePath) || { additions: 0, deletions: 0 };
      changedFiles.push({
        path: filePath,
        previousPath: statusInfo.previousPath,
        status: statusInfo.status,
        additions: stats.additions,
        deletions: stats.deletions,
      });
    }

    // Check file count limit
    if (changedFiles.length > this.limits.maxFiles) {
      return {
        status: "limit_exceeded",
        value: changedFiles.slice(0, this.limits.maxFiles),
        message: "Changed files count exceeds limit",
        limit: { actual: changedFiles.length, max: this.limits.maxFiles },
      };
    }

    return {
      status: "success",
      value: changedFiles,
    };
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

  // ============================================================
  // New methods for file enumeration and ref validation (mocks)
  // ============================================================

  listFilesAtRef(ref: string): LegacyFilesResult {
    const result = this.listFilesAtRefResult(ref);
    return result.status === "success"
      ? result.value!
      : result.status === "limit_exceeded"
        ? result.value!
        : [];
  }

  listFilesAtRefResult(ref: string): DiffAccessResult<string[]> {
    if (this.failMode === "git_failure") {
      return { status: "git_failure", message: "Mock git failure" };
    }
    if (this.failMode === "ref_invalid") {
      return { status: "ref_invalid", message: `Mock: ref '${ref}' invalid` };
    }

    // Mock returns empty array by default (can be extended if needed)
    return { status: "success", value: [] };
  }

  validateRef(ref: string): boolean {
    const result = this.validateRefResult(ref);
    return result.status === "success";
  }

  validateRefResult(ref: string): DiffAccessResult<void> {
    if (this.failMode === "git_failure") {
      return { status: "git_failure", message: "Mock git failure" };
    }
    if (this.failMode === "ref_invalid") {
      return { status: "ref_invalid", message: `Mock: ref '${ref}' invalid` };
    }

    // Mock returns success by default
    return { status: "success", value: undefined };
  }

  getChangedFilesWithStatsResult(
    _base: string,
    _head: string
  ): DiffAccessResult<ChangedFileStats[]> {
    if (this.failMode === "git_failure") {
      return { status: "git_failure", message: "Mock git failure" };
    }
    if (this.failMode === "ref_invalid") {
      return { status: "ref_invalid", message: "Mock: refs invalid" };
    }

    // Mock returns changed files with zero stats by default
    const stats: ChangedFileStats[] = this.changedFiles.map((f) => ({
      path: f,
      status: "modified" as const,
      additions: 0,
      deletions: 0,
    }));

    if (stats.length > this.limits.maxFiles) {
      return {
        status: "limit_exceeded",
        value: stats.slice(0, this.limits.maxFiles),
        message: "Mock: files exceeded limit",
        limit: { actual: stats.length, max: this.limits.maxFiles },
      };
    }

    return { status: "success", value: stats };
  }
}
