/**
 * Parallel File Processor - parses files using worker threads
 *
 * Performance requirement (Phase 2):
 * - Medium repo (500-2000 files) scan <= 45s
 * - Large repo (5000+ files) scan <= 120s
 *
 * Strategy:
 * - Use Node.js worker_threads for parallel parsing
 * - Batch files by language for efficient parsing
 * - Fallback to single-thread if workers unavailable
 * - Streaming processing for large repos (5000+ files)
 * - Memory-efficient chunked processing
 * - Lazy symbol loading (symbols only loaded when needed)
 */

import { Worker, isMainThread } from "node:worker_threads";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";

import { sha256, toPosix } from "../core/path-utils.js";
import { detectLanguage, detectRole } from "../core/file-utils.js";
import { parseTypeScriptFile, type ParseResult } from "../adapters/ts-adapter.js";
import { parseJavaScriptFile } from "../adapters/js-adapter.js";
import { parsePythonFile } from "../adapters/py-adapter.js";
import { parseRubyFile } from "../adapters/rb-adapter.js";
import { parseRegexLanguageFile, type RegexLanguage } from "../adapters/regex-language-adapter.js";
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
interface ProcessBatchMessage {
  type: "process-batch";
  files: Array<{ path: string; content: string; fileId: string }>;
  repoRoot: string;
}

/**
 * Internal batch result message
 */
interface ProcessBatchResultMessage {
  type: "batch-result";
  results: FileProcessorResult[];
}

/**
 * Parallel file processor implementation
 */
export class FileProcessor extends EventEmitter {
  private options: FileProcessorOptions;
  private workers: Worker[] = [];
  private pendingResults: Map<string, FileProcessorResult[]> = new Map();
  private workerBusy: boolean[] = [];
  private processingStartTime: number = 0;
  private processedCount: number = 0;
  private lazySymbolCache: Map<string, () => ParseResult> = new Map();

  /**
   * Create a new file processor
   * @param options - Processing options
   */
  constructor(options: FileProcessorOptions) {
    super();
    this.options = {
      maxWorkers: 4,
      batchSize: 50,
      timeoutMs: 10000,
      useWorkers: isMainThread && this.canUseWorkers(),
      streamingMode: true,
      chunkSize: 500,
      verbose: false,
      lazySymbols: true,
      ...options,
    };
  }

  /**
   * Check if processing a large repo
   * @param fileCount - Number of files to process
   * @returns True if large repo mode should be used
   */
  isLargeRepo(fileCount: number): boolean {
    return fileCount >= LARGE_REPO_THRESHOLD;
  }

  /**
   * Get optimized batch size based on file count
   * @param fileCount - Number of files
   * @returns Optimized batch size
   */
  getOptimizedBatchSize(fileCount: number): number {
    if (fileCount >= LARGE_REPO_THRESHOLD) {
      // For large repos, use larger batches for efficiency
      return Math.min(200, Math.ceil(fileCount / this.options.maxWorkers! / 2));
    }
    return this.options.batchSize!;
  }

  /**
   * Check if worker threads are available
   */
  private canUseWorkers(): boolean {
    try {
      // Check if we're in a worker thread already
      if (!isMainThread) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Process files in parallel
   * @param filePaths - Absolute paths to files
   * @returns Array of processing results
   */
  async processFiles(filePaths: string[]): Promise<FileProcessorResult[]> {
    if (filePaths.length === 0) {
      return [];
    }

    // For small batches or when workers disabled, use single-thread
    if (filePaths.length < this.options.batchSize! || !this.options.useWorkers) {
      return this.processFilesSingleThread(filePaths);
    }

    // Use worker threads for larger batches
    return this.processFilesWithWorkers(filePaths);
  }

  /**
   * Process files in single-thread mode
   * @param filePaths - Absolute paths to files
   * @returns Array of processing results
   */
  private processFilesSingleThread(filePaths: string[]): FileProcessorResult[] {
    const results: FileProcessorResult[] = [];

    for (const filePath of filePaths) {
      const startTime = Date.now();
      const result = this.processFile(filePath);
      result.processTimeMs = Date.now() - startTime;
      results.push(result);

      this.emit("file-processed", result);
    }

    return results;
  }

  /**
   * Process files using worker threads
   * @param filePaths - Absolute paths to files
   * @returns Array of processing results
   */
  private async processFilesWithWorkers(filePaths: string[]): Promise<FileProcessorResult[]> {
    const results: FileProcessorResult[] = [];
    const batches = this.createBatches(filePaths);

    // Create workers
    const workerPath = this.getWorkerPath();
    const numWorkers = Math.min(this.options.maxWorkers!, batches.length);

    for (let i = 0; i < numWorkers; i++) {
      const worker = new Worker(workerPath);
      this.workers.push(worker);
      this.workerBusy.push(false);

      worker.on("message", (message: ProcessBatchResultMessage) => {
        if (message.type === "batch-result") {
          results.push(...message.results);
          this.workerBusy[i] = false;
          this.emit("batch-complete", message.results);
        }
      });

      worker.on("error", (error) => {
        this.emit("worker-error", error);
      });
    }

    // Dispatch batches to workers
    let batchIndex = 0;
    const pendingBatches = [...batches];

    while (pendingBatches.length > 0) {
      // Find available worker
      const availableWorker = this.workerBusy.findIndex((busy) => !busy);

      if (availableWorker === -1) {
        // Wait for a worker to become available
        await new Promise<void>((resolve) => {
          this.once("batch-complete", () => resolve());
        });
        continue;
      }

      const batch = pendingBatches.shift()!;
      this.workerBusy[availableWorker] = true;

      const message: ProcessBatchMessage = {
        type: "process-batch",
        files: batch.map((filePath) => ({
          path: filePath,
          content: readFileSync(filePath, "utf8"),
          fileId: `file:${toPosix(path.relative(this.options.repoRoot, filePath))}`,
        })),
        repoRoot: this.options.repoRoot,
      };

      this.workers[availableWorker].postMessage(message);
      batchIndex++;
    }

    // Wait for all workers to complete
    await new Promise<void>((resolve) => {
      const checkComplete = () => {
        if (this.workerBusy.every((busy) => !busy)) {
          resolve();
        } else {
          this.once("batch-complete", checkComplete);
        }
      };
      checkComplete();
    });

    // Terminate workers
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.workerBusy = [];

    return results;
  }

  /**
   * Create batches of files for workers
   * @param filePaths - File paths to batch
   * @returns Array of file path batches
   */
  private createBatches(filePaths: string[]): string[][] {
    const batches: string[][] = [];
    const batchSize = this.options.batchSize!;

    for (let i = 0; i < filePaths.length; i += batchSize) {
      batches.push(filePaths.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * Get worker script path
   */
  private getWorkerPath(): string {
    // In production, this would be a compiled worker script
    // For development, we use a fallback
    return path.join(__dirname, "file-processor-worker.js");
  }

  /**
   * Process a single file
   * @param filePath - Absolute path to file
   * @returns Processing result
   */
  processFile(filePath: string): FileProcessorResult {
    try {
      const relPath = toPosix(path.relative(this.options.repoRoot, filePath));
      const content = readFileSync(filePath, "utf8");
      const fileId = `file:${relPath}`;

      const language = detectLanguage(filePath);
      const role = detectRole(relPath);
      const hash = sha256(content);

      // Parse based on language
      let parseResult: ParseResult;

      if (language === "ts" || language === "tsx") {
        parseResult = parseTypeScriptFile(filePath, this.options.repoRoot, fileId);
      } else if (language === "js" || language === "jsx") {
        parseResult = parseJavaScriptFile(filePath, this.options.repoRoot, fileId);
      } else if (language === "py") {
        parseResult = parsePythonFile(filePath, this.options.repoRoot, fileId);
      } else if (language === "rb") {
        parseResult = parseRubyFile(filePath, this.options.repoRoot, fileId);
      } else if (language === "go" || language === "rs" || language === "java" || language === "php") {
        parseResult = parseRegexLanguageFile(filePath, this.options.repoRoot, fileId, language);
      } else {
        // Fallback for unsupported languages
        parseResult = {
          symbols: [],
          relations: [],
          diagnostics: [],
          parserStatus: "skipped",
          parserAdapter: "ctg-text-v0",
        };
      }

      const file: RepoFile = {
        id: fileId,
        path: relPath,
        language,
        role,
        hash,
        sizeBytes: Buffer.byteLength(content),
        lineCount: content.split(/\r?\n/).length,
        moduleId: `module:${relPath}`,
        parser: {
          status: parseResult.parserStatus,
          adapter: parseResult.parserAdapter,
          errorCode: parseResult.parserStatus === "failed" ? "PARSER_FAILED" : undefined,
        },
      };

      return {
        file,
        parseResult,
        processTimeMs: 0, // Set by caller
        success: true,
      };
    } catch (error) {
      const relPath = toPosix(path.relative(this.options.repoRoot, filePath));

      return {
        file: {
          id: `file:${relPath}`,
          path: relPath,
          language: "unknown",
          role: "unknown",
          hash: "",
          sizeBytes: 0,
          lineCount: 0,
          parser: {
            status: "failed",
            errorCode: "PROCESS_ERROR",
          },
        },
        parseResult: {
          symbols: [],
          relations: [],
          diagnostics: [],
          parserStatus: "failed",
          parserAdapter: "ctg-text-v0",
        },
        processTimeMs: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Static method to process a batch (for worker threads)
   * @param files - Files to process
   * @param repoRoot - Repository root
   * @returns Processing results
   */
  static processBatch(
    files: Array<{ path: string; content: string; fileId: string }>,
    repoRoot: string
  ): FileProcessorResult[] {
    const results: FileProcessorResult[] = [];

    for (const fileInfo of files) {
      const startTime = Date.now();
      const language = detectLanguage(fileInfo.path);
      const relPath = toPosix(path.relative(repoRoot, fileInfo.path));
      const role = detectRole(relPath);
      const hash = sha256(fileInfo.content);

      let parseResult: ParseResult;

      if (language === "ts" || language === "tsx") {
        parseResult = parseTypeScriptFile(fileInfo.path, repoRoot, fileInfo.fileId);
      } else if (language === "js" || language === "jsx") {
        parseResult = parseJavaScriptFile(fileInfo.path, repoRoot, fileInfo.fileId);
      } else if (language === "py") {
        parseResult = parsePythonFile(fileInfo.path, repoRoot, fileInfo.fileId);
      } else if (language === "rb") {
        parseResult = parseRubyFile(fileInfo.path, repoRoot, fileInfo.fileId);
      } else if (language === "go" || language === "rs" || language === "java" || language === "php") {
        parseResult = parseRegexLanguageFile(fileInfo.path, repoRoot, fileInfo.fileId, language);
      } else {
        parseResult = {
          symbols: [],
          relations: [],
          diagnostics: [],
          parserStatus: "skipped",
          parserAdapter: "ctg-text-v0",
        };
      }

      const file: RepoFile = {
        id: fileInfo.fileId,
        path: relPath,
        language,
        role,
        hash,
        sizeBytes: Buffer.byteLength(fileInfo.content),
        lineCount: fileInfo.content.split(/\r?\n/).length,
        moduleId: `module:${relPath}`,
        parser: {
          status: parseResult.parserStatus,
          adapter: parseResult.parserAdapter,
          errorCode: parseResult.parserStatus === "failed" ? "PARSER_FAILED" : undefined,
        },
      };

      results.push({
        file,
        parseResult,
        processTimeMs: Date.now() - startTime,
        success: true,
      });
    }

    return results;
  }

  /**
   * Process files in streaming mode for large repos
   * Yields results in chunks to avoid memory issues
   * @param filePaths - Absolute paths to files
   * @param onProgress - Optional progress callback
   * @returns AsyncGenerator yielding chunks of results
   */
  async *processFilesStreaming(
    filePaths: string[],
    onProgress?: (progress: ProcessingProgressEvent) => void
  ): AsyncGenerator<FileProcessorResult[], void, unknown> {
    if (filePaths.length === 0) {
      return;
    }

    this.processingStartTime = Date.now();
    this.processedCount = 0;

    const chunkSize = this.options.chunkSize ?? 500;
    const totalFiles = filePaths.length;
    const totalChunks = Math.ceil(totalFiles / chunkSize);
    const batchSize = this.getOptimizedBatchSize(totalFiles);
    const useLazySymbols: boolean = this.isLargeRepo(totalFiles) && (this.options.lazySymbols ?? true);

    // Emit discovery phase
    this.emitProgress("discovery", 0, 0, totalFiles, onProgress);

    // Process in chunks
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const chunkStart = chunkIndex * chunkSize;
      const chunkEnd = Math.min(chunkStart + chunkSize, totalFiles);
      const chunkFiles = filePaths.slice(chunkStart, chunkEnd);

      const chunkResults: FileProcessorResult[] = [];

      // Process chunk in batches
      const batches = this.createBatchesOptimized(chunkFiles, batchSize);
      const batchCount = batches.length;

      for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
        const batch = batches[batchIndex];
        const batchResults = this.processBatchWithLazySymbols(batch, useLazySymbols);

        chunkResults.push(...batchResults);
        this.processedCount += batch.length;

        // Emit progress
        const currentBatch = chunkIndex * Math.ceil(chunkSize / batchSize) + batchIndex + 1;
        const totalBatches = totalChunks * Math.ceil(chunkSize / batchSize);
        this.emitProgress("batch-processing", currentBatch, totalBatches, this.processedCount, onProgress);
      }

      // Yield chunk results
      yield chunkResults;

      // Force garbage collection hint for large repos
      if (this.isLargeRepo(totalFiles) && global.gc) {
        global.gc();
      }
    }

    // Emit completion
    this.emitProgress("complete", 0, 0, totalFiles, onProgress);
  }

  /**
   * Create batches with optimized size
   * @param filePaths - File paths to batch
   * @param batchSize - Batch size to use
   * @returns Array of file path batches
   */
  private createBatchesOptimized(filePaths: string[], batchSize: number): string[][] {
    const batches: string[][] = [];

    for (let i = 0; i < filePaths.length; i += batchSize) {
      batches.push(filePaths.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * Process a batch with optional lazy symbol loading
   * @param filePaths - File paths in batch
   * @param useLazySymbols - Whether to use lazy symbol loading
   * @returns Processing results
   */
  private processBatchWithLazySymbols(filePaths: string[], useLazySymbols: boolean): FileProcessorResult[] {
    const results: FileProcessorResult[] = [];

    for (const filePath of filePaths) {
      const startTime = Date.now();
      const result = this.processFileWithLazySymbols(filePath, useLazySymbols);
      result.processTimeMs = Date.now() - startTime;
      results.push(result);

      this.emit("file-processed", result);
    }

    return results;
  }

  /**
   * Process a single file with optional lazy symbol loading
   * @param filePath - Absolute path to file
   * @param useLazySymbols - Whether to defer symbol extraction
   * @returns Processing result
   */
  private processFileWithLazySymbols(filePath: string, useLazySymbols: boolean): FileProcessorResult {
    try {
      const relPath = toPosix(path.relative(this.options.repoRoot, filePath));
      const content = readFileSync(filePath, "utf8");
      const fileId = `file:${relPath}`;

      const language = detectLanguage(filePath);
      const role = detectRole(relPath);
      const hash = sha256(content);

      // For lazy symbol loading, only extract basic metadata
      if (useLazySymbols && (language === "ts" || language === "tsx" || language === "js" || language === "jsx")) {
        // Store lazy loader function
        const lazyLoader = () => {
          if (language === "ts" || language === "tsx") {
            return parseTypeScriptFile(filePath, this.options.repoRoot, fileId);
          } else {
            return parseJavaScriptFile(filePath, this.options.repoRoot, fileId);
          }
        };

        this.lazySymbolCache.set(fileId, lazyLoader);

        const file: RepoFile = {
          id: fileId,
          path: relPath,
          language,
          role,
          hash,
          sizeBytes: Buffer.byteLength(content),
          lineCount: content.split(/\r?\n/).length,
          moduleId: `module:${relPath}`,
          parser: {
            status: "parsed",
            adapter: "ctg-lazy-v0",
          },
        };

        // Return minimal parse result (relations from imports can be extracted cheaply)
        const minimalParseResult: ParseResult = {
          symbols: [], // Will be loaded lazily when needed
          relations: this.extractImportsQuickly(content, relPath, fileId),
          diagnostics: [],
          parserStatus: "parsed",
          parserAdapter: "ctg-lazy-v0",
        };

        return {
          file,
          parseResult: minimalParseResult,
          processTimeMs: 0,
          success: true,
          symbolsLazyLoaded: true,
        };
      }

      // Normal processing when not using lazy loading
      let parseResult: ParseResult;

      if (language === "ts" || language === "tsx") {
        parseResult = parseTypeScriptFile(filePath, this.options.repoRoot, fileId);
      } else if (language === "js" || language === "jsx") {
        parseResult = parseJavaScriptFile(filePath, this.options.repoRoot, fileId);
      } else if (language === "py") {
        parseResult = parsePythonFile(filePath, this.options.repoRoot, fileId);
      } else if (language === "rb") {
        parseResult = parseRubyFile(filePath, this.options.repoRoot, fileId);
      } else if (language === "go" || language === "rs" || language === "java" || language === "php") {
        parseResult = parseRegexLanguageFile(filePath, this.options.repoRoot, fileId, language as RegexLanguage);
      } else {
        parseResult = {
          symbols: [],
          relations: [],
          diagnostics: [],
          parserStatus: "skipped",
          parserAdapter: "ctg-text-v0",
        };
      }

      const file: RepoFile = {
        id: fileId,
        path: relPath,
        language,
        role,
        hash,
        sizeBytes: Buffer.byteLength(content),
        lineCount: content.split(/\r?\n/).length,
        moduleId: `module:${relPath}`,
        parser: {
          status: parseResult.parserStatus,
          adapter: parseResult.parserAdapter,
          errorCode: parseResult.parserStatus === "failed" ? "PARSER_FAILED" : undefined,
        },
      };

      return {
        file,
        parseResult,
        processTimeMs: 0,
        success: true,
        symbolsLazyLoaded: false,
      };
    } catch (error) {
      const relPath = toPosix(path.relative(this.options.repoRoot, filePath));

      return {
        file: {
          id: `file:${relPath}`,
          path: relPath,
          language: "unknown",
          role: "unknown",
          hash: "",
          sizeBytes: 0,
          lineCount: 0,
          parser: {
            status: "failed",
            errorCode: "PROCESS_ERROR",
          },
        },
        parseResult: {
          symbols: [],
          relations: [],
          diagnostics: [],
          parserStatus: "failed",
          parserAdapter: "ctg-text-v0",
        },
        processTimeMs: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Quickly extract import relations without full parsing
   * Uses regex-based extraction for speed
   * @param content - File content
   * @param relPath - Relative file path
   * @param fileId - File ID
   * @returns Minimal relations array
   */
  private extractImportsQuickly(content: string, relPath: string, fileId: string): ParseResult["relations"] {
    const relations: ParseResult["relations"] = [];

    // Quick regex-based import extraction
    const importPatterns = [
      /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
      /import\s+['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];

    let importIndex = 0;
    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        importIndex++;
        const moduleSpecifier = match[1];
        const lineNumber = content.substring(0, match.index).split("\n").length;

        relations.push({
          id: `relation:${relPath}:quick-import:${importIndex}`,
          from: fileId,
          to: moduleSpecifier,
          kind: "imports",
          confidence: 0.9,
          evidence: [{
            id: `ev-quick-import-${importIndex}`,
            path: relPath,
            startLine: lineNumber,
            endLine: lineNumber,
            kind: "text",
          }],
        });
      }
    }

    return relations;
  }

  /**
   * Load symbols lazily for a file
   * @param fileId - File ID to load symbols for
   * @returns Parse result with full symbols
   */
  loadSymbolsLazily(fileId: string): ParseResult | undefined {
    const lazyLoader = this.lazySymbolCache.get(fileId);
    if (!lazyLoader) {
      return undefined;
    }

    const result = lazyLoader();
    this.lazySymbolCache.delete(fileId); // Clear after loading
    return result;
  }

  /**
   * Check if a file has lazy-loaded symbols
   * @param fileId - File ID to check
   * @returns True if symbols are lazily loaded
   */
  hasLazySymbols(fileId: string): boolean {
    return this.lazySymbolCache.has(fileId);
  }

  /**
   * Emit progress event
   * @param phase - Current phase
   * @param batchNumber - Current batch number
   * @param totalBatches - Total batches
   * @param processedFiles - Files processed so far
   * @param onProgress - Optional progress callback
   */
  private emitProgress(
    phase: ProcessingProgressEvent["phase"],
    batchNumber: number,
    totalBatches: number,
    processedFiles: number,
    onProgress?: (progress: ProcessingProgressEvent) => void
  ): void {
    const elapsedMs = Date.now() - this.processingStartTime;
    const totalFiles = processedFiles; // Use processed count for now
    const filesPerSecond = elapsedMs > 0 ? processedFiles / (elapsedMs / 1000) : 0;

    const progress: ProcessingProgressEvent = {
      phase,
      totalFiles,
      processedFiles,
      batchNumber,
      totalBatches,
      elapsedMs,
      estimatedRemainingMs: filesPerSecond > 0 ? Math.ceil((totalFiles - processedFiles) / filesPerSecond * 1000) : 0,
      filesPerSecond,
    };

    this.emit("progress", progress);

    if (onProgress) {
      onProgress(progress);
    }

    // Log progress if verbose mode
    if (this.options.verbose) {
      console.log(JSON.stringify({
        phase,
        processedFiles,
        totalFiles,
        batchNumber,
        totalBatches,
        elapsedMs,
        filesPerSecond: Math.round(filesPerSecond),
      }));
    }
  }

  /**
   * Process files and build graph in memory-efficient way
   * @param filePaths - Absolute paths to files
   * @param graphBuilder - Callback to add results to graph
   * @param onProgress - Optional progress callback
   * @returns Total processing time in ms
   */
  async processAndBuildGraph(
    filePaths: string[],
    graphBuilder: (results: FileProcessorResult[]) => void,
    onProgress?: (progress: ProcessingProgressEvent) => void
  ): Promise<number> {
    const startTime = Date.now();

    for await (const chunkResults of this.processFilesStreaming(filePaths, onProgress)) {
      // Emit graph-building phase progress
      this.emitProgress("graph-building", 0, 0, this.processedCount, onProgress);

      // Add results to graph (caller handles graph construction)
      graphBuilder(chunkResults);
    }

    return Date.now() - startTime;
  }

  /**
   * Get processor statistics with large repo info
   */
  getStats(): {
    workerCount: number;
    batchSize: number;
    useWorkers: boolean;
    lazySymbolCacheSize: number;
    isLargeRepo: boolean;
  } {
    return {
      workerCount: this.workers.length,
      batchSize: this.options.batchSize!,
      useWorkers: this.options.useWorkers!,
      lazySymbolCacheSize: this.lazySymbolCache.size,
      isLargeRepo: this.options.chunkSize !== undefined,
    };
  }

  /**
   * Clear lazy symbol cache to free memory
   */
  clearLazySymbolCache(): void {
    this.lazySymbolCache.clear();
  }

  /**
   * Terminate all workers
   */
  terminate(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.workerBusy = [];
    this.clearLazySymbolCache();
    this.processedCount = 0;
  }
}
