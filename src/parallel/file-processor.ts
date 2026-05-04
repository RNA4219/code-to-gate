/**
 * Parallel File Processor - parses files using worker threads
 *
 * Performance requirement (Phase 2):
 * - Medium repo (500-2000 files) scan <= 45s
 * - Large repo (5000+ files) scan <= 120s
 */

import { Worker, isMainThread } from "node:worker_threads";
import { readFileSync } from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";

import { sha256, toPosix } from "../core/path-utils.js";
import { detectLanguage, detectRole } from "../core/file-utils.js";
import { parseTypeScriptFile, type ParseResult } from "../adapters/ts-adapter.js";
import { parseJavaScriptFile } from "../adapters/js-adapter.js";
import { parsePythonFile } from "../adapters/py-adapter.js";
import { parseRubyFile } from "../adapters/rb-adapter.js";
import { parseRegexLanguageFile, type RegexLanguage } from "../adapters/regex-language-adapter.js";
import { parsePythonFileSync, isTreeSitterAvailable as isPyTreeSitterAvailable } from "../adapters/py-tree-sitter-adapter.js";
import { parseRubyFileSync, isRubyTreeSitterAvailable as isRbTreeSitterAvailable } from "../adapters/rb-tree-sitter-adapter.js";
import { parseGoFileSync, isGoTreeSitterAvailable } from "../adapters/go-tree-sitter-adapter.js";
import { parseRustFileSync, isRustTreeSitterAvailable } from "../adapters/rs-tree-sitter-adapter.js";
import type { RepoFile } from "../types/artifacts.js";

import {
  LARGE_REPO_THRESHOLD,
  type FileProcessorOptions,
  type FileProcessorResult,
  type ProcessingProgressEvent,
  type ProcessBatchMessage,
  type ProcessBatchResultMessage,
} from "./file-processor-types.js";

import {
  processBatch,
  createBatches,
  getOptimizedBatchSize,
  extractImportsQuickly,
} from "./batch-processor.js";

// Re-export types for external use
export {
  LARGE_REPO_THRESHOLD,
  FileProcessorOptions,
  FileProcessorResult,
  ProcessingProgressEvent,
};

/**
 * Parallel file processor implementation
 */
export class FileProcessor extends EventEmitter {
  private options: FileProcessorOptions;
  private workers: Worker[] = [];
  private workerBusy: boolean[] = [];
  private lazySymbolCache: Map<string, () => ParseResult> = new Map();
  private processingStartTime: number = 0;
  private processedCount: number = 0;

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

  private canUseWorkers(): boolean {
    try {
      return isMainThread;
    } catch {
      return false;
    }
  }

  isLargeRepo(fileCount: number): boolean {
    return fileCount >= LARGE_REPO_THRESHOLD;
  }

  getOptimizedBatchSize(fileCount: number): number {
    return getOptimizedBatchSize(fileCount, this.options.maxWorkers!, this.options.batchSize!);
  }

  async processFiles(filePaths: string[]): Promise<FileProcessorResult[]> {
    if (filePaths.length === 0) return [];

    if (filePaths.length < this.options.batchSize! || !this.options.useWorkers) {
      return this.processFilesSingleThread(filePaths);
    }

    return this.processFilesWithWorkers(filePaths);
  }

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

  private async processFilesWithWorkers(filePaths: string[]): Promise<FileProcessorResult[]> {
    const results: FileProcessorResult[] = [];
    const batches = createBatches(filePaths, this.options.batchSize!);

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

    let _batchIndex = 0;
    const pendingBatches = [...batches];

    while (pendingBatches.length > 0) {
      const availableWorker = this.workerBusy.findIndex((busy) => !busy);

      if (availableWorker === -1) {
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
      _batchIndex++;
    }

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

    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.workerBusy = [];

    return results;
  }

  private getWorkerPath(): string {
    return path.join(__dirname, "file-processor-worker.js");
  }

  processFile(filePath: string): FileProcessorResult {
    try {
      const relPath = toPosix(path.relative(this.options.repoRoot, filePath));
      const content = readFileSync(filePath, "utf8");
      const fileId = `file:${relPath}`;

      const language = detectLanguage(filePath);
      const role = detectRole(relPath);
      const hash = sha256(content);

      let parseResult: ParseResult;

      if (language === "ts" || language === "tsx") {
        parseResult = parseTypeScriptFile(filePath, this.options.repoRoot, fileId);
      } else if (language === "js" || language === "jsx") {
        parseResult = parseJavaScriptFile(filePath, this.options.repoRoot, fileId);
      } else if (language === "py") {
        // Use tree-sitter if requested and available
        if (this.options.useTreeSitter && this.options.treeSitterAvailable && isPyTreeSitterAvailable()) {
          parseResult = parsePythonFileSync(content, relPath);
        } else {
          parseResult = parsePythonFile(filePath, this.options.repoRoot, fileId);
        }
      } else if (language === "rb") {
        // Use tree-sitter if requested and available
        if (this.options.useTreeSitter && this.options.treeSitterAvailable && isRbTreeSitterAvailable()) {
          parseResult = parseRubyFileSync(content, relPath);
        } else {
          parseResult = parseRubyFile(filePath, this.options.repoRoot, fileId);
        }
      } else if (language === "go") {
        // Use tree-sitter if requested and available
        if (this.options.useTreeSitter && this.options.treeSitterAvailable && isGoTreeSitterAvailable()) {
          parseResult = parseGoFileSync(content, relPath);
        } else {
          parseResult = parseRegexLanguageFile(filePath, this.options.repoRoot, fileId, "go");
        }
      } else if (language === "rs") {
        // Use tree-sitter if requested and available
        if (this.options.useTreeSitter && this.options.treeSitterAvailable && isRustTreeSitterAvailable()) {
          parseResult = parseRustFileSync(content, relPath);
        } else {
          parseResult = parseRegexLanguageFile(filePath, this.options.repoRoot, fileId, "rs");
        }
      } else if (language === "java" || language === "php") {
        parseResult = parseRegexLanguageFile(filePath, this.options.repoRoot, fileId, language);
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

      return { file, parseResult, processTimeMs: 0, success: true };
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
          parser: { status: "failed", errorCode: "PROCESS_ERROR" },
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

  static processBatch = processBatch;

  async *processFilesStreaming(
    filePaths: string[],
    onProgress?: (progress: ProcessingProgressEvent) => void
  ): AsyncGenerator<FileProcessorResult[], void, unknown> {
    if (filePaths.length === 0) return;

    this.processingStartTime = Date.now();
    this.processedCount = 0;

    const chunkSize = this.options.chunkSize ?? 500;
    const totalFiles = filePaths.length;
    const totalChunks = Math.ceil(totalFiles / chunkSize);
    const batchSize = this.getOptimizedBatchSize(totalFiles);
    const useLazySymbols = this.isLargeRepo(totalFiles) && (this.options.lazySymbols ?? true);

    this.emitProgress("discovery", 0, 0, totalFiles, onProgress);

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const chunkStart = chunkIndex * chunkSize;
      const chunkEnd = Math.min(chunkStart + chunkSize, totalFiles);
      const chunkFiles = filePaths.slice(chunkStart, chunkEnd);

      const chunkResults: FileProcessorResult[] = [];
      const batches = createBatches(chunkFiles, batchSize);

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batchResults = this.processBatchWithLazySymbols(batches[batchIndex], useLazySymbols);
        chunkResults.push(...batchResults);
        this.processedCount += batches[batchIndex].length;

        const currentBatch = chunkIndex * Math.ceil(chunkSize / batchSize) + batchIndex + 1;
        const totalBatches = totalChunks * Math.ceil(chunkSize / batchSize);
        this.emitProgress("batch-processing", currentBatch, totalBatches, this.processedCount, onProgress);
      }

      yield chunkResults;

      if (this.isLargeRepo(totalFiles) && global.gc) {
        global.gc();
      }
    }

    this.emitProgress("complete", 0, 0, totalFiles, onProgress);
  }

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

  private processFileWithLazySymbols(filePath: string, useLazySymbols: boolean): FileProcessorResult {
    try {
      const relPath = toPosix(path.relative(this.options.repoRoot, filePath));
      const content = readFileSync(filePath, "utf8");
      const fileId = `file:${relPath}`;

      const language = detectLanguage(filePath);
      const role = detectRole(relPath);
      const hash = sha256(content);

      if (useLazySymbols && (language === "ts" || language === "tsx" || language === "js" || language === "jsx")) {
        const lazyLoader = () => {
          if (language === "ts" || language === "tsx") {
            return parseTypeScriptFile(filePath, this.options.repoRoot, fileId);
          }
          return parseJavaScriptFile(filePath, this.options.repoRoot, fileId);
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
          parser: { status: "parsed", adapter: "ctg-lazy-v0" },
        };

        const minimalParseResult: ParseResult = {
          symbols: [],
          relations: extractImportsQuickly(content, relPath, fileId),
          diagnostics: [],
          parserStatus: "parsed",
          parserAdapter: "ctg-lazy-v0",
        };

        return { file, parseResult: minimalParseResult, processTimeMs: 0, success: true, symbolsLazyLoaded: true };
      }

      let parseResult: ParseResult;

      if (language === "ts" || language === "tsx") {
        parseResult = parseTypeScriptFile(filePath, this.options.repoRoot, fileId);
      } else if (language === "js" || language === "jsx") {
        parseResult = parseJavaScriptFile(filePath, this.options.repoRoot, fileId);
      } else if (language === "py") {
        // Use tree-sitter if requested and available
        if (this.options.useTreeSitter && this.options.treeSitterAvailable && isPyTreeSitterAvailable()) {
          parseResult = parsePythonFileSync(content, relPath);
        } else {
          parseResult = parsePythonFile(filePath, this.options.repoRoot, fileId);
        }
      } else if (language === "rb") {
        // Use tree-sitter if requested and available
        if (this.options.useTreeSitter && this.options.treeSitterAvailable && isRbTreeSitterAvailable()) {
          parseResult = parseRubyFileSync(content, relPath);
        } else {
          parseResult = parseRubyFile(filePath, this.options.repoRoot, fileId);
        }
      } else if (language === "go") {
        // Use tree-sitter if requested and available
        if (this.options.useTreeSitter && this.options.treeSitterAvailable && isGoTreeSitterAvailable()) {
          parseResult = parseGoFileSync(content, relPath);
        } else {
          parseResult = parseRegexLanguageFile(filePath, this.options.repoRoot, fileId, "go");
        }
      } else if (language === "rs") {
        // Use tree-sitter if requested and available
        if (this.options.useTreeSitter && this.options.treeSitterAvailable && isRustTreeSitterAvailable()) {
          parseResult = parseRustFileSync(content, relPath);
        } else {
          parseResult = parseRegexLanguageFile(filePath, this.options.repoRoot, fileId, "rs");
        }
      } else if (language === "java" || language === "php") {
        parseResult = parseRegexLanguageFile(filePath, this.options.repoRoot, fileId, language as RegexLanguage);
      } else {
        parseResult = { symbols: [], relations: [], diagnostics: [], parserStatus: "skipped", parserAdapter: "ctg-text-v0" };
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

      return { file, parseResult, processTimeMs: 0, success: true, symbolsLazyLoaded: false };
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
          parser: { status: "failed", errorCode: "PROCESS_ERROR" },
        },
        parseResult: { symbols: [], relations: [], diagnostics: [], parserStatus: "failed", parserAdapter: "ctg-text-v0" },
        processTimeMs: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  loadSymbolsLazily(fileId: string): ParseResult | undefined {
    const lazyLoader = this.lazySymbolCache.get(fileId);
    if (!lazyLoader) return undefined;

    const result = lazyLoader();
    this.lazySymbolCache.delete(fileId);
    return result;
  }

  hasLazySymbols(fileId: string): boolean {
    return this.lazySymbolCache.has(fileId);
  }

  clearLazySymbolCache(): void {
    this.lazySymbolCache.clear();
  }

  terminate(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.workerBusy = [];
    this.lazySymbolCache.clear();
  }

  getStats(): {
    workerCount: number;
    lazySymbolCacheSize: number;
    batchSize: number;
    useWorkers: boolean;
    maxWorkers: number;
    streamingMode: boolean;
    chunkSize: number;
  } {
    return {
      workerCount: this.workers.length,
      lazySymbolCacheSize: this.lazySymbolCache.size,
      batchSize: this.options.batchSize!,
      useWorkers: this.options.useWorkers!,
      maxWorkers: this.options.maxWorkers!,
      streamingMode: this.options.streamingMode!,
      chunkSize: this.options.chunkSize!,
    };
  }

  private emitProgress(
    phase: ProcessingProgressEvent["phase"],
    batchNumber: number,
    totalBatches: number,
    processedFiles: number,
    onProgress?: (progress: ProcessingProgressEvent) => void
  ): void {
    const elapsedMs = Date.now() - this.processingStartTime;
    const filesPerSecond = processedFiles > 0 ? (processedFiles / elapsedMs) * 1000 : 0;
    const estimatedRemainingMs = filesPerSecond > 0 ? ((totalBatches * this.options.batchSize! - processedFiles) / filesPerSecond) * 1000 : 0;

    const progress: ProcessingProgressEvent = {
      phase,
      totalFiles: totalBatches * this.options.batchSize!,
      processedFiles,
      batchNumber,
      totalBatches,
      elapsedMs,
      estimatedRemainingMs,
      filesPerSecond,
    };

    this.emit("progress", progress);
    if (onProgress) {
      onProgress(progress);
    }
  }
}