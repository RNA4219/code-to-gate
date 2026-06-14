/**
 * Git File Access Adapter
 *
 * Adapts GitDiffAccess to GitFileAccess interface for database analyzer.
 * This file exists in adapters layer to maintain architecture boundaries.
 *
 * SPEC-29 Phase 3: Implements structured result contract for diagnostics.
 * SPEC-29 Phase 3: Accepts optional limits for database analysis (DB_ANALYSIS_LIMITS).
 */

import { GitDiffAccess, DB_ANALYSIS_LIMITS, DEFAULT_DIFF_LIMITS } from "./git-diff-access.js";
import type { GitFileAccess } from "../types/contracts.js";
import type { DiffAccessResult, DiffAccessLimits } from "../types/diff-contracts.js";

// Re-export DB_ANALYSIS_LIMITS for database analysis callers
export { DB_ANALYSIS_LIMITS };

/**
 * GitFileAccess implementation using GitDiffAccess
 *
 * Provides safe git file operations for core layer via interface injection.
 */
export class GitFileAccessAdapter implements GitFileAccess {
  private diffAccess: GitDiffAccess;

  /**
   * Create GitFileAccessAdapter with optional limits
   * @param repoRoot - Repository root directory
   * @param limits - Optional limits for file operations (defaults to DEFAULT_DIFF_LIMITS)
   */
  constructor(repoRoot: string, limits?: DiffAccessLimits) {
    this.diffAccess = new GitDiffAccess(repoRoot, limits ?? DEFAULT_DIFF_LIMITS);
  }

  getFileContentResult(gitRef: string, filePath: string): DiffAccessResult<string> {
    return this.diffAccess.getFileContentResult(gitRef, filePath);
  }

  getFileContent(gitRef: string, filePath: string): string | null {
    const result = this.diffAccess.getFileContentResult(gitRef, filePath);
    return result.status === "success" ? result.value! : null;
  }

  listFilesAtRefResult(gitRef: string): DiffAccessResult<string[]> {
    return this.diffAccess.listFilesAtRefResult(gitRef);
  }

  listFilesAtRef(gitRef: string): string[] {
    const result = this.diffAccess.listFilesAtRefResult(gitRef);
    // Convert error statuses to empty array for legacy compatibility
    return result.status === "success" || result.status === "limit_exceeded"
      ? result.value!
      : [];
  }
}