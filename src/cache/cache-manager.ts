/**
 * Unified Cache Manager - coordinates all cache types
 *
 * Performance requirement (Phase 2):
 * - Medium repo (500-2000 files) scan <= 45s
 * - Medium repo analyze <= 45s (LLM excluded)
 * - Large repo (5000+ files) scan <= 120s
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { toPosix } from "../core/path-utils.js";

import { FileHashCache, FileHashEntry } from "./file-cache.js";
import { GraphCache } from "./graph-cache.js";
import { FindingsCache } from "./findings-cache.js";
import type { NormalizedRepoGraph } from "../types/graph.js";
import type { Finding } from "../types/artifacts.js";
import {
  validateCacheStandard,
  validateCacheStreaming,
  computeBlastRadius,
  computeBlastRadiusOptimized,
} from "./cache-validation.js";

import type { CacheValidationResult, CacheProgressEvent, CacheStats } from "./cache-types.js";
export { CacheValidationResult, CacheProgressEvent, CacheStats } from "./cache-types.js";

/**
 * Threshold for large repo processing
 */
export const LARGE_REPO_THRESHOLD = 5000;

/**
 * Options for cache manager
 */
export interface CacheOptions {
  enabled: boolean;
  cacheDir?: string;
  forceRescan?: boolean;
  computeBlastRadius?: boolean;
  batchSize?: number;
  streamingValidation?: boolean;
  onProgress?: (progress: CacheProgressEvent) => void;
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

  isLargeRepo(fileCount: number): boolean {
    return fileCount >= LARGE_REPO_THRESHOLD;
  }

  initialize(ruleVersions?: Record<string, string>): boolean {
    if (!this.options.enabled || this.options.forceRescan) {
      return false;
    }

    const fileLoaded = this.fileCache.load();
    const graphLoaded = this.graphCache.load();
    const findingsLoaded = this.findingsCache.load(ruleVersions);

    return fileLoaded && graphLoaded && findingsLoaded;
  }

  save(): void {
    if (!this.options.enabled) return;

    this.fileCache.save();
    this.graphCache.save();
    this.findingsCache.save();
  }

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

    const combined = hashes.sort().join("|");
    return createHash("sha256").update(combined).digest("hex");
  }

  computePolicyHash(policyPath?: string): string | undefined {
    if (!policyPath) return undefined;

    const absPath = path.isAbsolute(policyPath)
      ? policyPath
      : path.join(this.repoRoot, policyPath);

    if (!existsSync(absPath)) return undefined;

    const content = readFileSync(absPath, "utf8");
    return createHash("sha256").update(content).digest("hex");
  }

  validateCache(
    allFiles: string[],
    configHash?: string,
    policyHash?: string
  ): CacheValidationResult {
    const configChanged = this.fileCache.isConfigChanged(configHash, policyHash);

    if (configChanged || this.options.forceRescan) {
      return {
        changedFiles: allFiles,
        unchangedFiles: [],
        blastRadius: allFiles,
        needsFullScan: true,
      };
    }

    if (this.isLargeRepo(allFiles.length) && this.options.streamingValidation) {
      return this.validateCacheStreamingInternal(allFiles);
    }

    return this.validateCacheStandardInternal(allFiles);
  }

  private validateCacheStandardInternal(allFiles: string[]): CacheValidationResult {
    const result = validateCacheStandard(
      allFiles,
      this.repoRoot,
      this.fileCache,
      this.options.computeBlastRadius ?? true,
      (files) => computeBlastRadius(files, this.repoRoot, this.graphCache)
    );

    this.hitCount = result.hitCount;
    this.missCount = result.missCount;

    const blastRadius = this.options.computeBlastRadius
      ? computeBlastRadius(result.changedFiles, this.repoRoot, this.graphCache)
      : result.changedFiles;

    return {
      changedFiles: result.changedFiles,
      unchangedFiles: result.unchangedFiles,
      blastRadius,
      needsFullScan: false,
    };
  }

  private validateCacheStreamingInternal(allFiles: string[]): CacheValidationResult {
    this.validationStartTime = Date.now();

    const result = validateCacheStreaming(
      allFiles,
      this.repoRoot,
      this.fileCache,
      this.options,
      this.emitProgress.bind(this),
      this.validationStartTime
    );

    this.hitCount = result.hitCount;
    this.missCount = result.missCount;

    const blastRadius = this.options.computeBlastRadius
      ? computeBlastRadiusOptimized(
          result.changedFiles,
          this.repoRoot,
          this.graphCache,
          this.emitProgress.bind(this)
        )
      : result.changedFiles;

    this.emitProgress("complete", Math.ceil(allFiles.length / (this.options.batchSize ?? 500)), Math.ceil(allFiles.length / (this.options.batchSize ?? 500)), allFiles.length);

    return {
      changedFiles: result.changedFiles,
      unchangedFiles: result.unchangedFiles,
      blastRadius,
      needsFullScan: false,
    };
  }

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

  getFileHash(absPath: string, content?: string): FileHashEntry {
    const relPath = toPosix(path.relative(this.repoRoot, absPath));
    const cached = this.fileCache.get(relPath);

    if (cached && !this.fileCache.needsRescan(absPath)) {
      return cached;
    }

    return this.fileCache.update(absPath, content);
  }

  getCachedGraph(filesHash: string, configHash?: string): NormalizedRepoGraph | undefined {
    if (this.graphCache.needsRebuild(filesHash, configHash)) {
      return undefined;
    }
    return this.graphCache.get();
  }

  updateGraphCache(graph: NormalizedRepoGraph, filesHash: string, configHash?: string): void {
    this.graphCache.update(graph, filesHash, configHash);
  }

  getCachedFindings(relPath: string, fileHash: string): Finding[] | undefined {
    return this.findingsCache.get(relPath, fileHash);
  }

  updateFindingsCache(relPath: string, fileHash: string, findings: Finding[]): void {
    this.findingsCache.update(relPath, fileHash, findings);
  }

  getAllCachedFindings(): Finding[] {
    return this.findingsCache.getAllFindings();
  }

  setConfigPolicyHashes(configHash?: string, policyHash?: string): void {
    if (configHash) this.fileCache.setConfigHash(configHash);
    if (policyHash) this.fileCache.setPolicyHash(policyHash);
  }

  setRuleVersions(versions: Record<string, string>): void {
    this.findingsCache.setRuleVersions(versions);
  }

  pruneMissingFiles(existingPaths: Set<string>): void {
    this.findingsCache.pruneMissing(existingPaths);
  }

  clear(): void {
    this.fileCache.clear();
    this.graphCache.clear();
    this.findingsCache.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

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

  isEnabled(): boolean {
    return this.options.enabled;
  }
}