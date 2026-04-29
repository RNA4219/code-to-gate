/**
 * Unified Cache Manager - coordinates all cache types
 *
 * Performance requirement (Phase 2):
 * - Medium repo (500-2000 files) scan <= 45s
 * - Medium repo analyze <= 45s (LLM excluded)
 *
 * Features:
 * - Incremental cache based on file hash
 * - Diff-only re-scan (changed files + blast radius)
 * - Cache invalidation on config/policy change
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { toPosix } from "../core/path-utils.js";

import { FileHashCache, FileHashEntry } from "./file-cache.js";
import { GraphCache, GraphCacheEntry } from "./graph-cache.js";
import { FindingsCache, FindingsCacheEntry } from "./findings-cache.js";
import type { NormalizedRepoGraph } from "../types/graph.js";
import type { Finding } from "../types/artifacts.js";

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
      ...options,
    };

    this.fileCache = new FileHashCache(repoRoot, this.options.cacheDir);
    this.graphCache = new GraphCache(repoRoot, this.options.cacheDir);
    this.findingsCache = new FindingsCache(repoRoot, this.options.cacheDir);
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

    // Determine changed and unchanged files
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

    // Compute blast radius (files that might be affected by changes)
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