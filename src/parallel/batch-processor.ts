/**
 * Batch Processor - Static batch processing utilities
 * Used by FileProcessor for parallel processing
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { sha256, toPosix } from "../core/path-utils.js";
import { detectLanguage, detectRole } from "../core/file-utils.js";
import { parseTypeScriptFile, type ParseResult } from "../adapters/ts-adapter.js";
import { parseJavaScriptFile } from "../adapters/js-adapter.js";
import { parsePythonFile } from "../adapters/py-adapter.js";
import { parseRubyFile } from "../adapters/rb-adapter.js";
import { parseRegexLanguageFile, type RegexLanguage } from "../adapters/regex-language-adapter.js";
import type { RepoFile } from "../types/artifacts.js";
import type { FileProcessorResult } from "./file-processor-types.js";

/**
 * Process a batch of files (for worker threads)
 * @param files - Files to process
 * @param repoRoot - Repository root
 * @returns Processing results
 */
export function processBatch(
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
 * Create batches from file paths
 * @param filePaths - File paths to batch
 * @param batchSize - Batch size
 * @returns Array of file path batches
 */
export function createBatches(filePaths: string[], batchSize: number): string[][] {
  const batches: string[][] = [];

  for (let i = 0; i < filePaths.length; i += batchSize) {
    batches.push(filePaths.slice(i, i + batchSize));
  }

  return batches;
}

/**
 * Get optimized batch size based on file count
 * @param fileCount - Number of files
 * @param maxWorkers - Maximum workers
 * @param defaultBatchSize - Default batch size
 * @returns Optimized batch size
 */
export function getOptimizedBatchSize(
  fileCount: number,
  maxWorkers: number,
  defaultBatchSize: number
): number {
  if (fileCount >= 5000) {
    return Math.min(200, Math.ceil(fileCount / maxWorkers / 2));
  }
  return defaultBatchSize;
}

/**
 * Check if processing is a large repo
 * @param fileCount - Number of files
 * @returns True if large repo mode should be used
 */
export function isLargeRepo(fileCount: number): boolean {
  return fileCount >= 5000;
}

/**
 * Quickly extract import relations without full parsing
 * Uses regex-based extraction for speed
 * @param content - File content
 * @param relPath - Relative file path
 * @param fileId - File ID
 * @returns Minimal relations array
 */
export function extractImportsQuickly(
  content: string,
  relPath: string,
  fileId: string
): ParseResult["relations"] {
  const relations: ParseResult["relations"] = [];

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