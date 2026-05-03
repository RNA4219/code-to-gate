/**
 * File Processor Types
 * Types and interfaces for parallel file processing
 */

import type { ParseResult } from "../adapters/ts-adapter.js";
import type { RepoFile } from "../types/artifacts.js";

/**
 * Threshold for large repo processing
 */
export const LARGE_REPO_THRESHOLD = 5000;

/**
 * Options for file processor
 */
export interface FileProcessorOptions {
  /** Maximum number of worker threads (default: 4) */
  maxWorkers?: number;
  /** Batch size per worker (default: 50) */
  batchSize?: number;
  /** Timeout per file in ms (default: 10000) */
  timeoutMs?: number;
  /** Enable worker threads (default: true if available) */
  useWorkers?: boolean;
  /** Repo root for relative path computation */
  repoRoot: string;
  /** Enable streaming mode for large repos (default: true for 5000+ files) */
  streamingMode?: boolean;
  /** Chunk size for memory-efficient processing (default: 500) */
  chunkSize?: number;
  /** Enable progress reporting (default: false) */
  verbose?: boolean;
  /** Enable lazy symbol loading (default: true for large repos) */
  lazySymbols?: boolean;
  /** Use tree-sitter parser if available (default: false) */
  useTreeSitter?: boolean;
  /** Tree-sitter is initialized and available */
  treeSitterAvailable?: boolean;
}

/**
 * Progress event for large repo processing
 */
export interface ProcessingProgressEvent {
  /** Current phase of processing */
  phase: "discovery" | "batch-processing" | "graph-building" | "complete";
  /** Total files to process */
  totalFiles: number;
  /** Files processed so far */
  processedFiles: number;
  /** Current batch number */
  batchNumber: number;
  /** Total batches */
  totalBatches: number;
  /** Time elapsed in ms */
  elapsedMs: number;
  /** Estimated remaining time in ms */
  estimatedRemainingMs: number;
  /** Files per second rate */
  filesPerSecond: number;
}

/**
 * Result of processing a single file
 */
export interface FileProcessorResult {
  /** RepoFile metadata */
  file: RepoFile;
  /** Parse result (symbols, relations, diagnostics) */
  parseResult: ParseResult;
  /** Processing time in ms */
  processTimeMs: number;
  /** Whether processing succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Whether symbols are lazily loaded (not included in parseResult) */
  symbolsLazyLoaded?: boolean;
}

/**
 * Internal batch processing message
 */
export interface ProcessBatchMessage {
  type: "process-batch";
  files: Array<{ path: string; content: string; fileId: string }>;
  repoRoot: string;
}

/**
 * Internal batch result message
 */
export interface ProcessBatchResultMessage {
  type: "batch-result";
  results: FileProcessorResult[];
}