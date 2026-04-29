/**
 * Graph Cache - stores NormalizedRepoGraph for incremental analysis
 *
 * Performance requirement (Phase 2):
 * - Medium repo (500-2000 files) analyze <= 45s (LLM excluded)
 *
 * Cache strategy:
 * - Store partial graph for unchanged files
 * - Rebuild only for changed files + blast radius
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { NormalizedRepoGraph } from "../types/graph.js";

/**
 * Entry for a cached graph
 */
export interface GraphCacheEntry {
  /** Graph artifact */
  graph: NormalizedRepoGraph;
  /** Hash of all file hashes combined */
  filesHash: string;
  /** Config hash at time of caching */
  configHash?: string;
  /** Timestamp when cached */
  cachedAt: number;
}

/**
 * Cache metadata
 */
interface CacheMetadata {
  version: string;
  repoRoot: string;
  createdAt: number;
  updatedAt: number;
}

const CACHE_VERSION = "graph-cache@v1";

/**
 * Graph Cache implementation
 */
export class GraphCache {
  private entry: GraphCacheEntry | null = null;
  private metadata: CacheMetadata;
  private cachePath: string;
  private repoRoot: string;

  /**
   * Create a new graph cache
   * @param repoRoot - Absolute path to repository root
   * @param cacheDir - Directory to store cache files (default: .qh/.cache)
   */
  constructor(repoRoot: string, cacheDir?: string) {
    this.repoRoot = repoRoot;
    const dir = cacheDir ?? path.join(repoRoot, ".qh", ".cache");
    this.cachePath = path.join(dir, "graph-cache.json");
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
      this.entry = data.entry;

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Save cache to disk
   */
  save(): void {
    if (!this.entry) {
      return;
    }

    const dir = path.dirname(this.cachePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.metadata.updatedAt = Date.now();

    const data = {
      metadata: this.metadata,
      entry: this.entry,
    };

    writeFileSync(this.cachePath, JSON.stringify(data, null, 2), "utf8");
  }

  /**
   * Get cached graph
   * @returns Cached graph or undefined
   */
  get(): NormalizedRepoGraph | undefined {
    return this.entry?.graph;
  }

  /**
   * Check if graph needs rebuild
   * @param currentFilesHash - Combined hash of all file hashes
   * @param currentConfigHash - Current config hash (optional)
   * @returns True if graph needs to be rebuilt
   */
  needsRebuild(currentFilesHash: string, currentConfigHash?: string): boolean {
    if (!this.entry) {
      return true; // Not cached
    }

    if (this.entry.filesHash !== currentFilesHash) {
      return true; // Files changed
    }

    if (currentConfigHash && this.entry.configHash !== currentConfigHash) {
      return true; // Config changed
    }

    return false;
  }

  /**
   * Update cache with new graph
   * @param graph - NormalizedRepoGraph to cache
   * @param filesHash - Combined hash of all file hashes
   * @param configHash - Config hash (optional)
   */
  update(graph: NormalizedRepoGraph, filesHash: string, configHash?: string): void {
    this.entry = {
      graph,
      filesHash,
      configHash,
      cachedAt: Date.now(),
    };
  }

  /**
   * Compute combined hash from file hash entries
   * @param hashes - Array of file hashes
   * @returns Combined SHA-256 hash
   */
  computeFilesHash(hashes: string[]): string {
    // Sort hashes for deterministic ordering
    const sorted = hashes.sort();
    const combined = sorted.join("|");
    const buffer = Buffer.from(combined, "utf8");

    // Simple hash implementation
    let hash = 0;
    for (let i = 0; i < buffer.length; i++) {
      hash = ((hash << 5) - hash) + buffer[i];
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, "0");
  }

  /**
   * Get files from cached graph
   * @returns Array of cached file paths (relative)
   */
  getCachedFiles(): string[] {
    if (!this.entry) {
      return [];
    }
    return this.entry.graph.files.map((f) => f.path);
  }

  /**
   * Get symbols from cached graph
   * @returns Cached symbols
   */
  getCachedSymbols(): unknown[] {
    if (!this.entry) {
      return [];
    }
    return this.entry.graph.symbols;
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.entry = null;
    this.metadata.updatedAt = Date.now();
  }

  /**
   * Get cache statistics
   */
  getStats(): { hasCache: boolean; cachedAt?: number; fileCount?: number } {
    return {
      hasCache: this.entry !== null,
      cachedAt: this.entry?.cachedAt,
      fileCount: this.entry?.graph.files.length,
    };
  }
}