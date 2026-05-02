/**
 * Cache Type Definitions
 * Shared types for cache module
 */

/**
 * Progress event for cache validation
 */
export interface CacheProgressEvent {
  phase: "validation" | "hash-computation" | "blast-radius" | "complete";
  totalFiles: number;
  processedFiles: number;
  batchNumber: number;
  totalBatches: number;
  elapsedMs: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  fileHash: { entryCount: number; hitRate: number };
  graph: { hasCache: boolean; fileCount?: number };
  findings: { entryCount: number; totalFindings: number };
  overall: { filesChanged: number; filesCached: number; needsFullScan: boolean };
}

/**
 * Result of cache validation
 */
export interface CacheValidationResult {
  changedFiles: string[];
  unchangedFiles: string[];
  blastRadius: string[];
  needsFullScan: boolean;
}