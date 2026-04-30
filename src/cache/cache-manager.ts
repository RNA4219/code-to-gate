/**
 * Unified Cache Manager - coordinates all cache types
 *
 * Performance requirement (Phase 2):
 * - Medium repo (500-2000 files) scan <= 45s
 * - Medium repo analyze <= 45s (LLM excluded)
 * - Large repo (5000+ files) scan <= 120s
 *
 * Features:
 * - Incremental cache based on file hash
 * - Diff-only re-scan (changed files + blast radius)
 * - Cache invalidation on config/policy change
 * - Batch operations for large file sets
 * - Memory-efficient validation for large repos
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { toPosix } from "../core/path-utils.js";

import { FileHashCache, FileHashEntry } from "./file-cache.js";
import { GraphCache, GraphCacheEntry } from "./graph-cache.js";
import { FindingsCache, FindingsCacheEntry } from "./findings-cache.js";
import type { NormalizedRepoGraph } from "../types/graph.js";
import type { Finding } from "../types/artifacts.js";

/**
 * Threshold for large repo processing
 */
export const LARGE_REPO_THRESHOLD = 5000;

/**
 * Options for cache manager
 */
export interface CacheOptions {
  /** Enable caching (default: true) */
  enabled: boolean;
  /** Cache directory (default: .qh/.cache) */
  cacheDir?: string;
  /** Force full re-scan (ignore cache) */
  forceRescan?: boolean;
  /** Compute blast radius for changed files */
  computeBlastRadius?: boolean;
  /** Batch size for large repo processing (default: 500) */
  batchSize?: number;
  /** Enable streaming validation for large repos */
  streamingValidation?: boolean;
  /** Progress callback for large repos */
  onProgress?: (progress: CacheProgressEvent) => void;
}

/**
 * Progress event for cache validation
 */
export interface CacheProgressEvent {
  /** Phase of cache operation */
  phase: "validation" | "hash-computation" | "blast-radius" | "complete";
  /** Total files */
  totalFiles: number;
  /** Files processed */
  processedFiles: number;
  /** Current batch */
  batchNumber: number;
  /** Total batches */
  totalBatches: number;
  /** Time elapsed in ms */
  elapsedMs: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** File hash cache stats */
  fileHash: {
    entryCount: number;
    hitRate: number;
  };
  /** Graph cache stats */
  graph: {
    hasCache: boolean;
    fileCount?: number;
  };
  /** Findings cache stats */
  findings: {
    entryCount: number;
    totalFindings: number;
  };
  /** Overall stats */
  overall: {
    filesChanged: number;
    filesCached: number;
    needsFullScan: boolean;
  };
}

/**
 * Result of cache validation
 */
export interface CacheValidationResult {
  /** Files that need to be scanned */
  changedFiles: string[];
  /** Files that can use cached data */
  unchangedFiles: string[];
  /** Files in blast radius (need re-analysis) */
  blastRadius: string[];
  /** Whether full re-scan is required */
  needsFullScan: boolean;
}

/**
 * Cache Manager implementation
 */
export class CacheManager {
  private fileCache: FileHashCache;
  private graphCache: GraphCache;
  private findingsCache: FindingsCache;
  private repoRoot: string;
  private options: CacheOptions;
  private hitCount = 0;
  private missCount = 0;
  private validationStartTime = 0;

  /**
   * Create a new cache manager
   * @param repoRoot - Absolute path to repository root
   * @param options - Cache options
   */
  constructor(repoRoot: string, options?: Partial<CacheOptions>) {
    this.repoRoot = repoRoot;
    this.options = {
      enabled: true,
      cacheDir: path.join(repoRoot, ".qh", ".cache"),
      forceRescan: false,
      computeBlastRadius: true,
      batchSize: 500,
      streamingValidation: true,
      onProgress: undefined,
      ...options,
    };

    this.fileCache = new FileHashCache(repoRoot, this.options.cacheDir);
    this.graphCache = new GraphCache(repoRoot, this.options.cacheDir);
    this.findingsCache = new FindingsCache(repoRoot, this.options.cacheDir);
  }

  /**
   * Check if this is a large repo
   * @param fileCount - Number of files
   * @returns True if large repo mode should be used
   */
  isLargeRepo(fileCount: number): boolean {
    return fileCount >= LARGE_REPO_THRESHOLD;
  }

  /**
   * Initialize caches - load from disk if available
   * @param ruleVersions - Current rule versions for findings cache validation
   * @returns True if all caches loaded successfully
   */
  initialize(ruleVersions?: Record<string, string>): boolean {
    if (!this.options.enabled || this.options.forceRescan) {
      return false;
    }

    const fileLoaded = this.fileCache.load();
    const graphLoaded = this.graphCache.load();
    const findingsLoaded = this.findingsCache.load(ruleVersions);

    return fileLoaded && graphLoaded && findingsLoaded;
  }

  /**
   * Save all caches to disk
   */
  save(): void {
    if (!this.options.enabled) {
      return;
    }

    this.fileCache.save();
    this.graphCache.save();
    this.findingsCache.save();
  }

  /**
   * Compute config hash for invalidation
   * @param configPaths - Paths to config files
   * @returns SHA-256 hash of config contents
   */
  computeConfigHash(configPaths: string[]): string {
    const hashes: string[] = [];

    for (const configPath of configPaths) {
      const absPath = path.isAbsolute(configPath)
        ? configPath
        : path.join(this.repoRoot, configPath);

      if (existsSync(absPath)) {
        const content = readFileSync(absPath, "utf8");
        hashes.push(createHash("sha256").update(content).digest("hex"));
      }
    }

    // Combine all hashes
    const combined = hashes.sort().join("|");
    return createHash("sha256").update(combined).digest("hex");
  }

  /**
   * Compute policy hash for invalidation
   * @param policyPath - Path to policy file
   * @returns SHA-256 hash of policy content
   */
  computePolicyHash(policyPath?: string): string | undefined {
    if (!policyPath) {
      return undefined;
    }

    const absPath = path.isAbsolute(policyPath)
      ? policyPath
      : path.join(this.repoRoot, policyPath);

    if (!existsSync(absPath)) {
      return undefined;
    }

    const content = readFileSync(absPath, "utf8");
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Validate cache and determine what needs re-scanning
   * @param allFiles - All files in repo
   * @param configHash - Current config hash
   * @param policyHash - Current policy hash
   * @returns Cache validation result
   */
  validateCache(
    allFiles: string[],
    configHash?: string,
    policyHash?: string
  ): CacheValidationResult {
    // Check if full re-scan needed
    const configChanged = this.fileCache.isConfigChanged(configHash, policyHash);

    if (configChanged || this.options.forceRescan) {
      return {
        changedFiles: allFiles,
        unchangedFiles: [],
        blastRadius: allFiles,
        needsFullScan: true,
      };
    }

    // For large repos, use streaming validation
    if (this.isLargeRepo(allFiles.length) && this.options.streamingValidation) {
      return this.validateCacheStreaming(allFiles);
    }

    // Standard validation for smaller repos
    return this.validateCacheStandard(allFiles);
  }

  /**
   * Standard cache validation for smaller repos
   * @param allFiles - All files in repo
   * @returns Cache validation result
   */
  private validateCacheStandard(allFiles: string[]): CacheValidationResult {
    const changedFiles: string[] = [];
    const unchangedFiles: string[] = [];
    const cachedFiles = new Set(this.fileCache.getAllEntries().map((e) => e.path));

    for (const file of allFiles) {
      const relPath = toPosix(path.relative(this.repoRoot, file));

      if (!cachedFiles.has(relPath) || this.fileCache.needsRescan(file)) {
        changedFiles.push(file);
        this.missCount++;
      } else {
        unchangedFiles.push(file);
        this.hitCount++;
      }
    }

    const blastRadius = this.options.computeBlastRadius
      ? this.computeBlastRadius(changedFiles)
      : changedFiles;

    return {
      changedFiles,
      unchangedFiles,
      blastRadius,
      needsFullScan: false,
    };
  }

  /**
   * Streaming cache validation for large repos
   * Processes files in batches to reduce memory pressure
   * @param allFiles - All files in repo
   * @returns Cache validation result
   */
  private validateCacheStreaming(allFiles: string[]): CacheValidationResult {
    this.validationStartTime = Date.now();
    const batchSize = this.options.batchSize ?? 500;

    const changedFiles: string[] = [];
    const unchangedFiles: string[] = [];
    const cachedFiles = new Set(this.fileCache.getAllEntries().map((e) => e.path));

    const totalBatches = Math.ceil(allFiles.length / batchSize);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, allFiles.length);
      const batchFiles = allFiles.slice(batchStart, batchEnd);

      for (const file of batchFiles) {
        const relPath = toPosix(path.relative(this.repoRoot, file));

        // Fast mtime check before hash comparison
        if (cachedFiles.has(relPath)) {
          const cachedEntry = this.fileCache.get(relPath);
          if (cachedEntry) {
            try {
              const stat = statSync(file);
              // Fast check: if mtime and size unchanged, skip hash computation
              if (stat.mtimeMs === cachedEntry.mtimeMs && stat.size === cachedEntry.sizeBytes) {
                unchangedFiles.push(file);
                this.hitCount++;
                continue;
              }
            } catch {
              // File might have been deleted, mark as changed
              changedFiles.push(file);
              this.missCount++;
              continue;
            }
          }
        }

        // Needs rescan or not cached
        if (!cachedFiles.has(relPath) || this.fileCache.needsRescan(file)) {
          changedFiles.push(file);
          this.missCount++;
        } else {
          unchangedFiles.push(file);
          this.hitCount++;
        }
      }

      // Emit progress
      this.emitProgress("validation", batchIndex + 1, totalBatches, batchEnd);

      // Periodically clear memory for large repos
      if (batchIndex % 5 === 0 && global.gc) {
        global.gc();
      }
    }

    const blastRadius = this.options.computeBlastRadius
      ? this.computeBlastRadiusOptimized(changedFiles)
      : changedFiles;

    this.emitProgress("complete", totalBatches, totalBatches, allFiles.length);

    return {
      changedFiles,
      unchangedFiles,
      blastRadius,
      needsFullScan: false,
    };
  }

  /**
   * Emit progress event
   * @param phase - Current phase
   * @param batchNumber - Current batch number
   * @param totalBatches - Total batches
   * @param processedFiles - Files processed so far
   */
  private emitProgress(
    phase: CacheProgressEvent["phase"],
    batchNumber: number,
    totalBatches: number,
    processedFiles: number
  ): void {
    if (this.options.onProgress) {
      const elapsedMs = Date.now() - this.validationStartTime;
      this.options.onProgress({
        phase,
        totalFiles: processedFiles,
        processedFiles,
        batchNumber,
        totalBatches,
        elapsedMs,
      });
    }
  }

  /**
   * Compute blast radius - files affected by changes
   * @param changedFiles - Files that changed
   * @returns Files in blast radius (changed + dependent files)
   */
  private computeBlastRadius(changedFiles: string[]): string[] {
    const blastRadius = new Set<string>(changedFiles);

    // Get cached graph to find dependencies
    const cachedGraph = this.graphCache.get();

    if (!cachedGraph) {
      return changedFiles;
    }

    // Find files that import or depend on changed files
    const changedRelPaths = new Set(
      changedFiles.map((f) => toPosix(path.relative(this.repoRoot, f)))
    );

    for (const relation of cachedGraph.relations) {
      // If a changed file is imported by another file
      if (relation.kind === "imports" || relation.kind === "depends_on") {
        const toPath = relation.to.replace(/^file:/, "");

        if (changedRelPaths.has(toPath)) {
          // The importing file is in blast radius
          const fromPath = relation.from.replace(/^file:/, "");
          blastRadius.add(path.join(this.repoRoot, fromPath));
        }
      }
    }

    return Array.from(blastRadius);
  }

  /**
   * Optimized blast radius computation for large repos
   * Uses batch processing to reduce memory pressure
   * @param changedFiles - Files that changed
   * @returns Files in blast radius (changed + dependent files)
   */
  private computeBlastRadiusOptimized(changedFiles: string[]): string[] {
    const blastRadius = new Set<string>(changedFiles);
    const cachedGraph = this.graphCache.get();

    if (!cachedGraph) {
      return changedFiles;
    }

    const changedRelPaths = new Set(
      changedFiles.map((f) => toPosix(path.relative(this.repoRoot, f)))
    );

    // Process relations in batches for memory efficiency
    const relations = cachedGraph.relations;
    const batchSize = 1000;
    const totalBatches = Math.ceil(relations.length / batchSize);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, relations.length);
      const batchRelations = relations.slice(batchStart, batchEnd);

      for (const relation of batchRelations) {
        if (relation.kind === "imports" || relation.kind === "depends_on") {
          const toPath = relation.to.replace(/^file:/, "");

          if (changedRelPaths.has(toPath)) {
            const fromPath = relation.from.replace(/^file:/, "");
            blastRadius.add(path.join(this.repoRoot, fromPath));
          }
        }
      }

      this.emitProgress("blast-radius", batchIndex + 1, totalBatches, batchEnd);
    }

    return Array.from(blastRadius);
  }

  /**
   * Batch update file hashes for large file sets
   * @param files - Array of file info objects
   * @returns Array of updated hash entries
   */
  batchUpdateHashes(files: Array<{ path: string; content?: string; hash?: string }>): FileHashEntry[] {
    const entries: FileHashEntry[] = [];
    const batchSize = this.options.batchSize ?? 500;
    const totalBatches = Math.ceil(files.length / batchSize);

    this.validationStartTime = Date.now();

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, files.length);
      const batchFiles = files.slice(batchStart, batchEnd);

      for (const fileInfo of batchFiles) {
        const entry = this.fileCache.update(fileInfo.path, fileInfo.content);
        entries.push(entry);
      }

      this.emitProgress("hash-computation", batchIndex + 1, totalBatches, batchEnd);
    }

    return entries;
  }

  /**
   * Get file hash from cache or compute new hash
   * @param absPath - Absolute file path
   * @param content - File content (optional)
   * @returns File hash entry
   */
  getFileHash(absPath: string, content?: string): FileHashEntry {
    const relPath = toPosix(path.relative(this.repoRoot, absPath));

    // Check cache
    const cached = this.fileCache.get(relPath);

    if (cached && !this.fileCache.needsRescan(absPath)) {
      return cached;
    }

    // Compute new hash
    return this.fileCache.update(absPath, content);
  }

  /**
   * Get cached graph if valid
   * @param filesHash - Combined hash of all file hashes
   * @param configHash - Current config hash
   * @returns Cached graph or undefined
   */
  getCachedGraph(filesHash: string, configHash?: string): NormalizedRepoGraph | undefined {
    if (this.graphCache.needsRebuild(filesHash, configHash)) {
      return undefined;
    }

    return this.graphCache.get();
  }

  /**
   * Update graph cache
   * @param graph - NormalizedRepoGraph to cache
   * @param filesHash - Combined hash of all file hashes
   * @param configHash - Config hash
   */
  updateGraphCache(
    graph: NormalizedRepoGraph,
    filesHash: string,
    configHash?: string
  ): void {
    this.graphCache.update(graph, filesHash, configHash);
  }

  /**
   * Get cached findings for a file
   * @param relPath - Relative file path
   * @param fileHash - File hash
   * @returns Cached findings or undefined
   */
  getCachedFindings(relPath: string, fileHash: string): Finding[] | undefined {
    return this.findingsCache.get(relPath, fileHash);
  }

  /**
   * Update findings cache for a file
   * @param relPath - Relative file path
   * @param fileHash - File hash
   * @param findings - Findings for this file
   */
  updateFindingsCache(relPath: string, fileHash: string, findings: Finding[]): void {
    this.findingsCache.update(relPath, fileHash, findings);
  }

  /**
   * Get all cached findings
   * @returns All cached findings
   */
  getAllCachedFindings(): Finding[] {
    return this.findingsCache.getAllFindings();
  }

  /**
   * Set config and policy hashes
   * @param configHash - Config hash
   * @param policyHash - Policy hash
   */
  setConfigPolicyHashes(configHash?: string, policyHash?: string): void {
    if (configHash) {
      this.fileCache.setConfigHash(configHash);
    }
    if (policyHash) {
      this.fileCache.setPolicyHash(policyHash);
    }
  }

  /**
   * Set rule versions for findings cache
   * @param versions - Rule versions map
   */
  setRuleVersions(versions: Record<string, string>): void {
    this.findingsCache.setRuleVersions(versions);
  }

  /**
   * Prune cache entries for deleted files
   * @param existingPaths - Set of existing file paths (relative)
   */
  pruneMissingFiles(existingPaths: Set<string>): void {
    this.findingsCache.pruneMissing(existingPaths);
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.fileCache.clear();
    this.graphCache.clear();
    this.findingsCache.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hitCount + this.missCount;
    const hitRate = total > 0 ? this.hitCount / total : 0;

    return {
      fileHash: {
        entryCount: this.fileCache.getStats().entryCount,
        hitRate,
      },
      graph: this.graphCache.getStats(),
      findings: this.findingsCache.getStats(),
      overall: {
        filesChanged: this.missCount,
        filesCached: this.hitCount,
        needsFullScan: this.options.forceRescan ?? false,
      },
    };
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.options.enabled;
  }
}