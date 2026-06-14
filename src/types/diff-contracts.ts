/**
 * Diff Access Contracts
 *
 * Interface definitions for Git diff operations.
 * Used by:
 * - application/assurance/diff-rules.ts (consumer)
 * - adapters/git-diff-access.ts (implementer)
 *
 * Layer: types (no imports from other src layers)
 */

/**
 * Single line in a diff hunk
 */
export interface DiffLine {
  type: "context" | "removed" | "added";
  content: string;
}

/**
 * A diff hunk with line changes
 */
export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

/**
 * Limits for diff operations
 */
export interface DiffAccessLimits {
  maxFiles: number;
  maxFileSize: number;
}

/**
 * Changed file with status and line statistics
 * Used for diff operations that need both status and line counts
 */
export interface ChangedFileStats {
  path: string;
  /** For renamed files, the previous path before rename */
  previousPath?: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
}

/**
 * Status codes for DiffAccess operations.
 *
 * Structured returns enable callers to distinguish:
 * - Actual absence (content_unavailable) from operational failure (git_failure)
 * - Security rejection (path_unsafe) from limit enforcement (limit_exceeded)
 */
export type DiffAccessStatus =
  | "success"
  | "git_failure" // git command failed (executable missing, repo corrupt)
  | "ref_invalid" // git ref doesn't exist or is malformed
  | "limit_exceeded" // file too large or too many files changed
  | "content_unavailable" // file doesn't exist at specified ref
  | "path_unsafe"; // path validation failed (absolute, .., NUL, outside repo)

/**
 * Structured result wrapper for DiffAccess operations.
 *
 * Replaces nullable returns with explicit status codes.
 * Callers can handle specific failure modes appropriately.
 */
export interface DiffAccessResult<T> {
  status: DiffAccessStatus;
  /** Present only when status === 'success' */
  value?: T;
  /** Diagnostic message for non-success statuses */
  message?: string;
  /** Present when status === 'limit_exceeded' */
  limit?: { actual: number; max: number };
}

/**
 * Legacy nullable returns (deprecated).
 *
 * New code should use structured result types.
 * Existing implementations can migrate incrementally.
 */
export type LegacyContentResult = string | null;
export type LegacyFilesResult = string[];
export type LegacyDiffResult = DiffHunk[] | null;

/**
 * DiffAccess contract for Git operations
 *
 * Security requirements:
 * - Implementations MUST use spawnSync with argument array (no shell string execution)
 * - Path validation MUST reject absolute paths, ".." references, and NUL bytes
 * - File limits MUST enforce maxFiles and maxFileSize
 *
 * Return types:
 * - Structured (recommended): getResult methods return DiffAccessResult<T>
 * - Legacy (deprecated): nullable methods remain for backward compatibility
 */
export interface DiffAccess {
  /**
   * Get file content at specified Git ref (structured result).
   * @returns DiffAccessResult with content on success, or error status
   */
  getFileContentResult(
    ref: string,
    filePath: string
  ): DiffAccessResult<string>;

  /**
   * Get file content at specified Git ref (legacy nullable).
   * @returns null if file doesn't exist at ref or exceeds size limit
   * @deprecated Use getFileContentResult for structured error handling
   */
  getFileContent(ref: string, filePath: string): LegacyContentResult;

  /**
   * Get list of changed files between base and head (structured result).
   * @returns DiffAccessResult with paths on success, or error status
   */
  getChangedFilesResult(
    base: string,
    head: string
  ): DiffAccessResult<string[]>;

  /**
   * Get list of changed files between base and head (legacy).
   * @returns relative paths from repo root (empty array on failure)
   * @deprecated Use getChangedFilesResult for structured error handling
   */
  getChangedFiles(base: string, head: string): LegacyFilesResult;

  /**
   * Get unified diff for specified file (structured result).
   * @returns DiffAccessResult with hunks on success, or error status
   */
  getFileDiffResult(
    base: string,
    head: string,
    filePath: string
  ): DiffAccessResult<DiffHunk[]>;

  /**
   * Get unified diff for specified file (legacy nullable).
   * @returns null if file unchanged
   * @deprecated Use getFileDiffResult for structured error handling
   */
  getFileDiff(
    base: string,
    head: string,
    filePath: string
  ): LegacyDiffResult;

  /**
   * Check if path is within repo root (symlink escape prevention).
   * Rejects: absolute paths, ".." segments, NUL bytes, paths outside repo.
   */
  isPathSafe(filePath: string): boolean;

  /**
   * Get current limits configuration.
   */
  getLimits(): DiffAccessLimits;

  /**
   * List all files at a specific Git ref (structured result).
   * @returns DiffAccessResult with relative file paths on success, or error status
   */
  listFilesAtRefResult(ref: string): DiffAccessResult<string[]>;

  /**
   * List all files at a specific Git ref (legacy).
   * @returns relative paths from repo root (empty array on failure)
   * @deprecated Use listFilesAtRefResult for structured error handling
   */
  listFilesAtRef(ref: string): LegacyFilesResult;

  /**
   * Validate if a Git ref exists (structured result).
   * @returns DiffAccessResult indicating ref validity
   */
  validateRefResult(ref: string): DiffAccessResult<void>;

  /**
   * Validate if a Git ref exists (legacy boolean).
   * @returns true if ref is valid, false otherwise
   * @deprecated Use validateRefResult for structured error handling
   */
  validateRef(ref: string): boolean;

  /**
   * Get changed files with status and line statistics (structured result).
   * Combines name-status and numstat outputs into single result.
   * @returns DiffAccessResult with ChangedFileStats array on success, or error status
   */
  getChangedFilesWithStatsResult(
    base: string,
    head: string
  ): DiffAccessResult<ChangedFileStats[]>;
}