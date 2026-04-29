/**
 * Findings Cache - stores findings for incremental analysis
 *
 * Performance requirement (Phase 2):
 * - Medium repo (500-2000 files) analyze <= 45s (LLM excluded)
 *
 * Cache strategy:
 * - Store findings per file
 * - Re-evaluate only changed files + dependent files (blast radius)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Finding, FindingsArtifact } from "../types/artifacts.js";

/**
 * Entry for cached findings per file
 */
export interface FindingsCacheEntry {
  /** File path (relative) */
  path: string;
  /** File hash at time of evaluation */
  fileHash: string;
  /** Findings for this file */
  findings: Finding[];
  /** Timestamp when cached */
  cachedAt: number;
}

/**
 * Cache metadata
 */
interface CacheMetadata {
  version: string;
  repoRoot: string;
  ruleVersions: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

const CACHE_VERSION = "findings-cache@v1";

/**
 * Findings Cache implementation
 */
export class FindingsCache {
  private entries: Map<string, FindingsCacheEntry> = new Map();
  private metadata: CacheMetadata;
  private cachePath: string;
  private repoRoot: string;

  /**
   * Create a new findings cache
   * @param repoRoot - Absolute path to repository root
   * @param cacheDir - Directory to store cache files (default: .qh/.cache)
   */
  constructor(repoRoot: string, cacheDir?: string) {
    this.repoRoot = repoRoot;
    const dir = cacheDir ?? path.join(repoRoot, ".qh", ".cache");
    this.cachePath = path.join(dir, "findings-cache.json");
    this.metadata = {
      version: CACHE_VERSION,
      repoRoot,
      ruleVersions: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Load cache from disk if exists and valid
   * @param currentRuleVersions - Current rule versions for invalidation check
   * @returns True if cache was loaded successfully
   */
  load(currentRuleVersions?: Record<string, string>): boolean {
    if (!existsSync(this.cachePath)) {
      return false;
    }

    try {
      const content = readFileSync(this.cachePath, "utf8");
      const data = JSON.parse(content);

      // Validate version
      if (data.metadata?.version !== CACHE_VERSION) {
        return false;
      }

      // Validate repo root
      if (data.metadata?.repoRoot !== this.repoRoot) {
        return false;
      }

      // Check rule versions for invalidation
      if (currentRuleVersions) {
        const cachedVersions = data.metadata?.ruleVersions ?? {};
        for (const [ruleId, version] of Object.entries(currentRuleVersions)) {
          if (cachedVersions[ruleId] !== version) {
            // Rule version changed, invalidate cache
            return false;
          }
        }
      }

      this.metadata = data.metadata;
      this.entries.clear();

      for (const entry of data.entries) {
        this.entries.set(entry.path, entry);
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Save cache to disk
   */
  save(): void {
    const dir = path.dirname(this.cachePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.metadata.updatedAt = Date.now();

    const data = {
      metadata: this.metadata,
      entries: Array.from(this.entries.values()),
    };

    writeFileSync(this.cachePath, JSON.stringify(data, null, 2), "utf8");
  }

  /**
   * Get cached findings for a file
   * @param relPath - Relative path to file
   * @param fileHash - Current file hash to validate
   * @returns Cached findings or undefined if invalid
   */
  get(relPath: string, fileHash: string): Finding[] | undefined {
    const cached = this.entries.get(relPath);

    if (!cached) {
      return undefined;
    }

    // Validate hash
    if (cached.fileHash !== fileHash) {
      return undefined;
    }

    return cached.findings;
  }

  /**
   * Check if file findings need re-evaluation
   * @param relPath - Relative path to file
   * @param fileHash - Current file hash
   * @returns True if findings need re-evaluation
   */
  needsReevaluate(relPath: string, fileHash: string): boolean {
    const cached = this.entries.get(relPath);

    if (!cached) {
      return true; // Not cached
    }

    return cached.fileHash !== fileHash; // Hash changed
  }

  /**
   * Update or add findings for a file
   * @param relPath - Relative path to file
   * @param fileHash - File hash
   * @param findings - Findings for this file
   */
  update(relPath: string, fileHash: string, findings: Finding[]): void {
    const entry: FindingsCacheEntry = {
      path: relPath,
      fileHash,
      findings,
      cachedAt: Date.now(),
    };

    this.entries.set(relPath, entry);
  }

  /**
   * Get all cached findings
   * @returns FindingsArtifact with all cached findings
   */
  getAllFindings(): Finding[] {
    const allFindings: Finding[] = [];

    for (const entry of this.entries.values()) {
      allFindings.push(...entry.findings);
    }

    return allFindings;
  }

  /**
   * Get files that need re-evaluation
   * @param fileHashes - Map of file paths to current hashes
   * @returns Array of file paths that need re-evaluation
   */
  getFilesNeedingReevaluation(fileHashes: Map<string, string>): string[] {
    const needsReevaluate: string[] = [];

    for (const [path, hash] of fileHashes) {
      if (this.needsReevaluate(path, hash)) {
        needsReevaluate.push(path);
      }
    }

    return needsReevaluate;
  }

  /**
   * Set rule versions for cache invalidation
   * @param versions - Map of rule IDs to versions
   */
  setRuleVersions(versions: Record<string, string>): void {
    this.metadata.ruleVersions = versions;
  }

  /**
   * Remove entries for files that no longer exist
   * @param existingPaths - Set of existing file paths
   */
  pruneMissing(existingPaths: Set<string>): void {
    const toDelete: string[] = [];

    for (const path of this.entries.keys()) {
      if (!existingPaths.has(path)) {
        toDelete.push(path);
      }
    }

    for (const path of toDelete) {
      this.entries.delete(path);
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.entries.clear();
    this.metadata.updatedAt = Date.now();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    entryCount: number;
    totalFindings: number;
    createdAt: number;
    updatedAt: number;
  } {
    let totalFindings = 0;
    for (const entry of this.entries.values()) {
      totalFindings += entry.findings.length;
    }

    return {
      entryCount: this.entries.size,
      totalFindings,
      createdAt: this.metadata.createdAt,
      updatedAt: this.metadata.updatedAt,
    };
  }
}