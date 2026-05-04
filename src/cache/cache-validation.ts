/**
 * Cache Validation Logic
 * Handles cache validation and blast radius computation
 */

import { statSync } from "node:fs";
import path from "node:path";
import { toPosix } from "../core/path-utils.js";
import type { FileHashCache } from "./file-cache.js";
import type { GraphCache } from "./graph-cache.js";
import type { CacheProgressEvent, CacheOptions } from "./cache-manager.js";

/**
 * Standard cache validation for smaller repos
 */
export function validateCacheStandard(
  allFiles: string[],
  repoRoot: string,
  fileCache: FileHashCache,
  _computeBlastRadius: boolean,
  _blastRadiusFn: (files: string[]) => string[]
): { changedFiles: string[]; unchangedFiles: string[]; hitCount: number; missCount: number } {
  const changedFiles: string[] = [];
  const unchangedFiles: string[] = [];
  const cachedFiles = new Set(fileCache.getAllEntries().map((e) => e.path));
  let hitCount = 0;
  let missCount = 0;

  for (const file of allFiles) {
    const relPath = toPosix(path.relative(repoRoot, file));

    if (!cachedFiles.has(relPath) || fileCache.needsRescan(file)) {
      changedFiles.push(file);
      missCount++;
    } else {
      unchangedFiles.push(file);
      hitCount++;
    }
  }

  return { changedFiles, unchangedFiles, hitCount, missCount };
}

/**
 * Streaming cache validation for large repos
 * Processes files in batches to reduce memory pressure
 */
export function validateCacheStreaming(
  allFiles: string[],
  repoRoot: string,
  fileCache: FileHashCache,
  options: CacheOptions,
  emitProgress: (phase: CacheProgressEvent["phase"], batch: number, total: number, files: number) => void,
  _startTime: number
): { changedFiles: string[]; unchangedFiles: string[]; hitCount: number; missCount: number } {
  const batchSize = options.batchSize ?? 500;
  const changedFiles: string[] = [];
  const unchangedFiles: string[] = [];
  const cachedFiles = new Set(fileCache.getAllEntries().map((e) => e.path));
  let hitCount = 0;
  let missCount = 0;

  const totalBatches = Math.ceil(allFiles.length / batchSize);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, allFiles.length);
    const batchFiles = allFiles.slice(batchStart, batchEnd);

    for (const file of batchFiles) {
      const relPath = toPosix(path.relative(repoRoot, file));

      // Fast mtime check before hash comparison
      if (cachedFiles.has(relPath)) {
        const cachedEntry = fileCache.get(relPath);
        if (cachedEntry) {
          try {
            const stat = statSync(file);
            // Fast check: if mtime and size unchanged, skip hash computation
            if (stat.mtimeMs === cachedEntry.mtimeMs && stat.size === cachedEntry.sizeBytes) {
              unchangedFiles.push(file);
              hitCount++;
              continue;
            }
          } catch {
            // File might have been deleted, mark as changed
            changedFiles.push(file);
            missCount++;
            continue;
          }
        }
      }

      // Needs rescan or not cached
      if (!cachedFiles.has(relPath) || fileCache.needsRescan(file)) {
        changedFiles.push(file);
        missCount++;
      } else {
        unchangedFiles.push(file);
        hitCount++;
      }
    }

    // Emit progress
    emitProgress("validation", batchIndex + 1, totalBatches, batchEnd);

    // Periodically clear memory for large repos
    if (batchIndex % 5 === 0 && global.gc) {
      global.gc();
    }
  }

  return { changedFiles, unchangedFiles, hitCount, missCount };
}

/**
 * Compute blast radius - files affected by changes
 */
export function computeBlastRadius(
  changedFiles: string[],
  repoRoot: string,
  graphCache: GraphCache
): string[] {
  const blastRadius = new Set<string>(changedFiles);

  // Get cached graph to find dependencies
  const cachedGraph = graphCache.get();

  if (!cachedGraph) {
    return changedFiles;
  }

  // Find files that import or depend on changed files
  const changedRelPaths = new Set(
    changedFiles.map((f) => toPosix(path.relative(repoRoot, f)))
  );

  for (const relation of cachedGraph.relations) {
    // If a changed file is imported by another file
    if (relation.kind === "imports" || relation.kind === "depends_on") {
      const toPath = relation.to.replace(/^file:/, "");

      if (changedRelPaths.has(toPath)) {
        // The importing file is in blast radius
        const fromPath = relation.from.replace(/^file:/, "");
        blastRadius.add(path.join(repoRoot, fromPath));
      }
    }
  }

  return Array.from(blastRadius);
}

/**
 * Optimized blast radius computation for large repos
 * Uses batch processing to reduce memory pressure
 */
export function computeBlastRadiusOptimized(
  changedFiles: string[],
  repoRoot: string,
  graphCache: GraphCache,
  emitProgress: (phase: CacheProgressEvent["phase"], batch: number, total: number, files: number) => void
): string[] {
  const blastRadius = new Set<string>(changedFiles);
  const cachedGraph = graphCache.get();

  if (!cachedGraph) {
    return changedFiles;
  }

  const changedRelPaths = new Set(
    changedFiles.map((f) => toPosix(path.relative(repoRoot, f)))
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
          blastRadius.add(path.join(repoRoot, fromPath));
        }
      }
    }

    emitProgress("blast-radius", batchIndex + 1, totalBatches, batchEnd);
  }

  return Array.from(blastRadius);
}