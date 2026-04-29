/**
 * File Hash Cache - stores file content hashes for incremental scanning
 *
 * Performance requirement (Phase 2):
 * - Medium repo (500-2000 files) scan <= 45s
 *
 * Cache invalidation:
 * - File content change (hash mismatch)
 * - Config file change (policy/config hash change)
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { toPosix } from "../core/path-utils.js";

/**
 * Entry for a cached file hash
 */
export interface FileHashEntry {
  /** File path relative to repo root */
  path: string;
  /** SHA-256 hash of file content */
  hash: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Last modification time (ms since epoch) */
  mtimeMs: number;
  /** Timestamp when this entry was cached */
  cachedAt: number;
}

/**
 * Cache metadata stored alongside entries
 */
interface CacheMetadata {
  version: string;
  repoRoot: string;
  configHash?: string;
  policyHash?: string;
  createdAt: number;
  updatedAt: number;
}

const CACHE_VERSION = "file-hash-cache@v1";

/**
 * File Hash Cache implementation
 */
export class FileHashCache {
  private entries: Map<string, FileHashEntry> = new Map();
  private metadata: CacheMetadata;
  private cachePath: string;
  private repoRoot: string;

  /**
   * Create a new file hash cache
   * @param repoRoot - Absolute path to repository root
   * @param cacheDir - Directory to store cache files (default: .qh/.cache)
   */
  constructor(repoRoot: string, cacheDir?: string) {
    this.repoRoot = repoRoot;
    const dir = cacheDir ?? path.join(repoRoot, ".qh", ".cache");
    this.cachePath = path.join(dir, "file-hash-cache.json");
    this.metadata = {
      version: CACHE_VERSION,
      repoRoot,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Load cache from disk if exists and valid
   * @returns True if cache was loaded successfully
   */
  load(): boolean {
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
   * Get cached entry for a file
   * @param relPath - Relative path to file
   * @returns Cached entry or undefined if not cached
   */
  get(relPath: string): FileHashEntry | undefined {
    return this.entries.get(relPath);
  }

  /**
   * Check if file needs re-scanning (hash changed or not cached)
   * @param absPath - Absolute path to file
   * @returns True if file needs to be scanned
   */
  needsRescan(absPath: string): boolean {
    const relPath = toPosix(path.relative(this.repoRoot, absPath));
    const cached = this.entries.get(relPath);

    if (!cached) {
      return true; // Not cached, needs scan
    }

    try {
      const stat = statSync(absPath);

      // Fast check: mtime unchanged
      if (stat.mtimeMs === cached.mtimeMs && stat.size === cached.sizeBytes) {
        return false; // File unchanged
      }

      // Slow check: hash comparison
      const content = readFileSync(absPath, "utf8");
      const hash = this.computeHash(content);

      return hash !== cached.hash;
    } catch {
      return true; // File might have been deleted
    }
  }

  /**
   * Compute hash for file content
   * @param content - File content
   * @returns SHA-256 hash
   */
  computeHash(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Update or add entry for a file
   * @param absPath - Absolute path to file
   * @param content - File content (optional, will read if not provided)
   * @returns The cached entry
   */
  update(absPath: string, content?: string): FileHashEntry {
    const relPath = toPosix(path.relative(this.repoRoot, absPath));
    const fileContent = content ?? readFileSync(absPath, "utf8");
    const stat = statSync(absPath);

    const entry: FileHashEntry = {
      path: relPath,
      hash: this.computeHash(fileContent),
      sizeBytes: stat.size,
      mtimeMs: stat.mtimeMs,
      cachedAt: Date.now(),
    };

    this.entries.set(relPath, entry);
    return entry;
  }

  /**
   * Get all files that need re-scanning (changed files)
   * @param files - List of absolute file paths to check
   * @returns Array of absolute paths that need scanning
   */
  getChangedFiles(files: string[]): string[] {
    return files.filter((file) => this.needsRescan(file));
  }

  /**
   * Get all cached entries
   * @returns Array of all cached entries
   */
  getAllEntries(): FileHashEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Set config hash for cache invalidation
   * @param hash - SHA-256 hash of config files
   */
  setConfigHash(hash: string): void {
    this.metadata.configHash = hash;
  }

  /**
   * Set policy hash for cache invalidation
   * @param hash - SHA-256 hash of policy files
   */
  setPolicyHash(hash: string): void {
    this.metadata.policyHash = hash;
  }

  /**
   * Check if config/policy changed (requires full re-scan)
   * @param currentConfigHash - Current config hash
   * @param currentPolicyHash - Current policy hash
   * @returns True if config/policy changed
   */
  isConfigChanged(currentConfigHash?: string, currentPolicyHash?: string): boolean {
    if (currentConfigHash && this.metadata.configHash !== currentConfigHash) {
      return true;
    }
    if (currentPolicyHash && this.metadata.policyHash !== currentPolicyHash) {
      return true;
    }
    return false;
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
  getStats(): { entryCount: number; createdAt: number; updatedAt: number } {
    return {
      entryCount: this.entries.size,
      createdAt: this.metadata.createdAt,
      updatedAt: this.metadata.updatedAt,
    };
  }
}