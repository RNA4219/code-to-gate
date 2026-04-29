/**
 * Cache module exports for code-to-gate
 *
 * Provides incremental caching for file hashes, repo graphs, and findings
 * to optimize performance for medium repos (500-2000 files).
 */

export { FileHashCache, FileHashEntry } from "./file-cache.js";
export { GraphCache, GraphCacheEntry } from "./graph-cache.js";
export { FindingsCache, FindingsCacheEntry } from "./findings-cache.js";
export { CacheManager, CacheOptions, CacheStats, CacheValidationResult } from "./cache-manager.js";

// Re-export CacheMode type from CLI for convenience
export type { CacheMode } from "../cli/exit-codes.js";