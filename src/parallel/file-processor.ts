/**
 * Parallel File Processor - parses files using worker threads
 *
 * Performance requirement (Phase 2):
 * - Medium repo (500-2000 files) scan <= 45s
 *
 * Strategy:
 * - Use Node.js worker_threads for parallel parsing
 * - Batch files by language for efficient parsing
 * - Fallback to single-thread if workers unavailable
 */

import { Worker, isMainThread } from "node:worker_threads";
import { readFileSync } from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";

import { sha256, toPosix } from "../core/path-utils.js";
import { detectLanguage, detectRole } from "../core/file-utils.js";
import { parseTypeScriptFile, type ParseResult } from "../adapters/ts-adapter.js";
import { parseJavaScriptFile } from "../adapters/js-adapter.js";
import type { RepoFile } from "../types/artifacts.js";

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
      ...options,
    };
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
   * Get processor statistics
   */
  getStats(): { workerCount: number; batchSize: number; useWorkers: boolean } {
    return {
      workerCount: this.workers.length,
      batchSize: this.options.batchSize!,
      useWorkers: this.options.useWorkers!,
    };
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
  }
}