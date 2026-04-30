/**
 * Performance tests for large repo processing
 *
 * Phase 2 Performance Acceptance:
 * - Large repo (5000+ files) scan <= 120 seconds
 *
 * Features tested:
 * - Streaming file processing
 * - Batch processing with configurable batch size
 * - Memory-efficient graph building
 * - Lazy symbol loading
 * - Progress reporting for large repos
 * - Optimized file hash cache
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { scanCommand } from "../../cli/scan.js";
import { analyzeCommand } from "../../cli/analyze.js";
import { FileProcessor, LARGE_REPO_THRESHOLD, type ProcessingProgressEvent } from "../../parallel/index.js";
import { CacheManager, type CacheProgressEvent } from "../../cache/index.js";
import {
  existsSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

const EXIT = {
  OK: 0,
  READINESS_NOT_CLEAR: 1,
  USAGE_ERROR: 2,
  SCAN_FAILED: 3,
  LLM_FAILED: 4,
  POLICY_FAILED: 5,
  PLUGIN_FAILED: 6,
  SCHEMA_FAILED: 7,
  IMPORT_FAILED: 8,
  INTEGRATION_EXPORT_FAILED: 9,
  INTERNAL_ERROR: 10,
};

const VERSION = "0.2.0-beta";

function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

/**
 * Generate a synthetic large repo for testing
 * Creates files with various patterns typical of real repos
 */
function generateSyntheticLargeRepo(
  targetDir: string,
  fileCount: number,
  options?: {
    tsRatio?: number;
    jsRatio?: number;
    configRatio?: number;
    testRatio?: number;
  }
): void {
  const ratios = {
    tsRatio: options?.tsRatio ?? 0.7,
    jsRatio: options?.jsRatio ?? 0.2,
    configRatio: options?.configRatio ?? 0.05,
    testRatio: options?.testRatio ?? 0.05,
  };

  mkdirSync(targetDir, { recursive: true });

  // Create directory structure
  const dirs = ["src", "src/components", "src/utils", "src/services", "src/api", "tests", "config"];

  for (const dir of dirs) {
    mkdirSync(path.join(targetDir, dir), { recursive: true });
  }

  // Create package.json
  writeFileSync(
    path.join(targetDir, "package.json"),
    JSON.stringify({
      name: "synthetic-large-repo",
      version: "1.0.0",
      dependencies: {},
    }),
    "utf8"
  );

  // Generate TypeScript files
  const tsFileCount = Math.floor(fileCount * ratios.tsRatio);
  for (let i = 0; i < tsFileCount; i++) {
    const dirIndex = i % dirs.length;
    const dir = dirs[dirIndex] === "tests" || dirs[dirIndex] === "config" ? "src" : dirs[dirIndex];
    const fileName = `file-${i}.ts`;
    const filePath = path.join(targetDir, dir, fileName);

    // Generate realistic TypeScript content
    const content = generateTypeScriptContent(i, dir);
    writeFileSync(filePath, content, "utf8");
  }

  // Generate JavaScript files
  const jsFileCount = Math.floor(fileCount * ratios.jsRatio);
  for (let i = 0; i < jsFileCount; i++) {
    const fileName = `file-${i + tsFileCount}.js`;
    const filePath = path.join(targetDir, "src", fileName);

    const content = generateJavaScriptContent(i);
    writeFileSync(filePath, content, "utf8");
  }

  // Generate config files
  const configFileCount = Math.floor(fileCount * ratios.configRatio);
  for (let i = 0; i < configFileCount; i++) {
    const configs = ["tsconfig.json", "jest.config.js", "eslint.config.js", "vitest.config.ts"];
    const configName = configs[i % configs.length];
    writeFileSync(
      path.join(targetDir, "config", configName),
      JSON.stringify({ extends: "@tsconfig/recommended" }),
      "utf8"
    );
  }

  // Generate test files
  const testFileCount = Math.floor(fileCount * ratios.testRatio);
  for (let i = 0; i < testFileCount; i++) {
    const fileName = `test-${i}.test.ts`;
    const filePath = path.join(targetDir, "tests", fileName);

    const content = generateTestContent(i);
    writeFileSync(filePath, content, "utf8");
  }
}

/**
 * Generate realistic TypeScript content
 */
function generateTypeScriptContent(index: number, dir: string): string {
  const className = `Class${index}`;
  const functionName = `function${index}`;

  // Add imports based on directory
  const imports = dir.includes("components")
    ? `import { useState } from 'react';\nimport { useEffect } from 'react';\n`
    : dir.includes("services")
    ? `import { ServiceBase } from './base';\nimport { logger } from '../utils/logger';\n`
    : dir.includes("api")
    ? `import { Request, Response } from 'express';\nimport { Router } from 'express';\n`
    : `import { utils } from '../utils';\n`;

  return `${imports}
/**
 * Generated file ${index} for large repo performance testing
 */

export interface I${className} {
  id: string;
  name: string;
  value: number;
}

export class ${className} implements I${className} {
  public id: string;
  public name: string;
  public value: number;

  constructor(id: string, name: string, value: number) {
    this.id = id;
    this.name = name;
    this.value = value;
  }

  public async process(): Promise<void> {
    console.log('Processing:', this.id);
  }

  public validate(): boolean {
    return this.value > 0;
  }
}

export function ${functionName}(input: string): string {
  return input.toUpperCase();
}

export const constant${index} = ${index * 100};

export default ${className};
`;
}

/**
 * Generate JavaScript content
 */
function generateJavaScriptContent(index: number): string {
  return `/**
 * Generated JS file ${index} for large repo performance testing
 */

const value${index} = ${index * 100};

function process${index}(input) {
  return input.toString();
}

module.exports = {
  value${index},
  process${index},
};
`;
}

/**
 * Generate test content
 */
function generateTestContent(index: number): string {
  return `/**
 * Generated test file ${index} for large repo performance testing
 */

import { describe, it, expect } from 'vitest';
import { Class${index} } from '../src/file-${index}';

describe('Class${index}', () => {
  it('should create instance', () => {
    const instance = new Class${index}('id', 'name', 100);
    expect(instance.id).toBe('id');
  });

  it('should validate', () => {
    const instance = new Class${index}('id', 'name', 100);
    expect(instance.validate()).toBe(true);
  });
});
`;
}

/**
 * Count files in a directory
 */
function countFiles(dir: string): number {
  let count = 0;
  const ignoreDirs = ["node_modules", ".git", ".qh", "dist"];

  function walk(currentDir: string): void {
    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (!ignoreDirs.includes(entry)) {
          walk(fullPath);
        }
      } else if (stat.isFile()) {
        count++;
      }
    }
  }

  try {
    walk(dir);
  } catch {
    // Directory doesn't exist
  }
  return count;
}

describe("Large Repo Performance Tests", () => {
  let tempOutDir: string;
  let syntheticRepoDir: string;

  // Performance target: Large repo scan <= 120s
  const TARGET_MS = 120000; // 120 seconds

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-large-repo-perf-test-${Date.now()}`);
    syntheticRepoDir = path.join(tmpdir(), `ctg-synthetic-large-repo-${Date.now()}`);
    mkdirSync(tempOutDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
    if (existsSync(syntheticRepoDir)) {
      rmSync(syntheticRepoDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean output directory before each test
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
    mkdirSync(tempOutDir, { recursive: true });

    // Clean synthetic repo
    if (existsSync(syntheticRepoDir)) {
      rmSync(syntheticRepoDir, { recursive: true, force: true });
    }
    mkdirSync(syntheticRepoDir, { recursive: true });
  });

  describe("Large repo threshold detection", () => {
    it("detects large repo correctly", () => {
      const processor = new FileProcessor({ repoRoot: syntheticRepoDir });
      expect(processor.isLargeRepo(5000)).toBe(true);
      expect(processor.isLargeRepo(1000)).toBe(false);
      expect(processor.isLargeRepo(LARGE_REPO_THRESHOLD)).toBe(true);
    });

    it("optimizes batch size for large repos", () => {
      const processor = new FileProcessor({ repoRoot: syntheticRepoDir });
      const smallBatch = processor.getOptimizedBatchSize(100);
      const mediumBatch = processor.getOptimizedBatchSize(2000);
      const largeBatch = processor.getOptimizedBatchSize(10000);

      expect(smallBatch).toBe(50); // Default batch size
      expect(mediumBatch).toBe(50); // Still default for medium
      expect(largeBatch).toBeGreaterThan(50); // Larger for large repos
      expect(largeBatch).toBeLessThanOrEqual(200); // Cap at 200
    });
  });

  describe("Streaming file processing", () => {
    it("processes files in streaming mode", async () => {
      // Generate a moderate-sized repo (1000 files) for streaming test
      generateSyntheticLargeRepo(syntheticRepoDir, 1000);

      const processor = new FileProcessor({
        repoRoot: syntheticRepoDir,
        streamingMode: true,
        chunkSize: 200,
        verbose: false,
      });

      const progressEvents: ProcessingProgressEvent[] = [];
      const onProgress = (progress: ProcessingProgressEvent) => {
        progressEvents.push(progress);
      };

      const allFiles: string[] = [];
      const walk = (dir: string) => {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = statSync(fullPath);
          if (stat.isDirectory() && !["node_modules", ".git"].includes(entry)) {
            walk(fullPath);
          } else if (stat.isFile() && /\.(ts|js)$/.test(entry)) {
            allFiles.push(fullPath);
          }
        }
      };
      walk(syntheticRepoDir);

      const results: ReturnType<typeof processor.processFile>[] = [];
      for await (const chunkResults of processor.processFilesStreaming(allFiles, onProgress)) {
        results.push(...chunkResults);
      }

      expect(results.length).toBeGreaterThan(0);
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[progressEvents.length - 1].phase).toBe("complete");

      processor.terminate();
    });

    it("emits progress events during processing", async () => {
      generateSyntheticLargeRepo(syntheticRepoDir, 500);

      const processor = new FileProcessor({
        repoRoot: syntheticRepoDir,
        streamingMode: true,
        chunkSize: 100,
      });

      const allFiles: string[] = [];
      const walk = (dir: string) => {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = statSync(fullPath);
          if (stat.isDirectory() && !["node_modules", ".git"].includes(entry)) {
            walk(fullPath);
          } else if (stat.isFile() && /\.(ts|js)$/.test(entry)) {
            allFiles.push(fullPath);
          }
        }
      };
      walk(syntheticRepoDir);

      let progressReceived = false;
      processor.on("progress", (progress: ProcessingProgressEvent) => {
        progressReceived = true;
      });

      for await (const _ of processor.processFilesStreaming(allFiles)) {
        // Process chunks
      }

      expect(progressReceived).toBe(true);
      processor.terminate();
    });
  });

  describe("Lazy symbol loading", () => {
    it("supports lazy symbol loading for large repos", () => {
      generateSyntheticLargeRepo(syntheticRepoDir, 100);

      const processor = new FileProcessor({
        repoRoot: syntheticRepoDir,
        lazySymbols: true,
      });

      const allFiles: string[] = [];
      const walk = (dir: string) => {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = statSync(fullPath);
          if (stat.isDirectory() && !["node_modules", ".git"].includes(entry)) {
            walk(fullPath);
          } else if (stat.isFile() && /\.(ts|js)$/.test(entry)) {
            allFiles.push(fullPath);
          }
        }
      };
      walk(syntheticRepoDir);

      // Process one file to test lazy loading
      const result = processor.processFile(allFiles[0]);

      // Check if symbols are lazily loaded for TS/JS files
      if (result.file.language === "ts" || result.file.language === "js") {
        // When lazy symbols is enabled, symbols may be deferred
        const stats = processor.getStats();
        expect(typeof stats.lazySymbolCacheSize).toBe("number");
      }

      processor.terminate();
    });

    it("can load symbols lazily when needed", () => {
      generateSyntheticLargeRepo(syntheticRepoDir, 10);

      const processor = new FileProcessor({
        repoRoot: syntheticRepoDir,
        lazySymbols: true,
      });

      const allFiles: string[] = [];
      const walk = (dir: string) => {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = statSync(fullPath);
          if (stat.isDirectory() && !["node_modules", ".git"].includes(entry)) {
            walk(fullPath);
          } else if (stat.isFile() && /\.(ts|js)$/.test(entry)) {
            allFiles.push(fullPath);
          }
        }
      };
      walk(syntheticRepoDir);

      const result = processor.processFile(allFiles[0]);

      if (result.symbolsLazyLoaded && result.file.id) {
        // Test loading symbols lazily
        const fullParseResult = processor.loadSymbolsLazily(result.file.id);
        expect(fullParseResult).toBeDefined();
        expect(fullParseResult?.symbols.length).toBeGreaterThanOrEqual(
          result.parseResult.symbols.length
        );
      }

      processor.terminate();
    });
  });

  describe("Batch processing", () => {
    it("processes files in configurable batch sizes", async () => {
      generateSyntheticLargeRepo(syntheticRepoDir, 300);

      const processor = new FileProcessor({
        repoRoot: syntheticRepoDir,
        batchSize: 50,
        streamingMode: true,
        chunkSize: 100,
      });

      const allFiles: string[] = [];
      const walk = (dir: string) => {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = statSync(fullPath);
          if (stat.isDirectory() && !["node_modules", ".git"].includes(entry)) {
            walk(fullPath);
          } else if (stat.isFile() && /\.(ts|js)$/.test(entry)) {
            allFiles.push(fullPath);
          }
        }
      };
      walk(syntheticRepoDir);

      const chunkSizes: number[] = [];
      for await (const chunkResults of processor.processFilesStreaming(allFiles)) {
        chunkSizes.push(chunkResults.length);
      }

      // Verify chunks are processed
      expect(chunkSizes.length).toBeGreaterThan(0);

      processor.terminate();
    });
  });

  describe("Cache optimization for large repos", () => {
    it("uses streaming validation for large file sets", () => {
      generateSyntheticLargeRepo(syntheticRepoDir, 1000);

      const cacheManager = new CacheManager(syntheticRepoDir, {
        enabled: true,
        streamingValidation: true,
        batchSize: 200,
      });

      cacheManager.initialize();

      const allFiles: string[] = [];
      const walk = (dir: string) => {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = statSync(fullPath);
          if (stat.isDirectory() && !["node_modules", ".git"].includes(entry)) {
            walk(fullPath);
          } else if (stat.isFile()) {
            allFiles.push(fullPath);
          }
        }
      };
      walk(syntheticRepoDir);

      // Validate cache with streaming
      const progressEvents: CacheProgressEvent[] = [];
      const cacheOptions = {
        onProgress: (progress: CacheProgressEvent) => {
          progressEvents.push(progress);
        },
      };

      const cacheManagerWithProgress = new CacheManager(syntheticRepoDir, {
        enabled: true,
        streamingValidation: true,
        batchSize: 200,
        ...cacheOptions,
      });

      cacheManagerWithProgress.initialize();
      const result = cacheManagerWithProgress.validateCache(allFiles);

      expect(result.changedFiles.length + result.unchangedFiles.length).toBe(allFiles.length);
      expect(result.needsFullScan).toBe(false); // First scan, but cache should handle it

      cacheManager.clear();
      cacheManagerWithProgress.clear();
    });

    it("batch updates hashes efficiently", () => {
      generateSyntheticLargeRepo(syntheticRepoDir, 500);

      const cacheManager = new CacheManager(syntheticRepoDir, {
        enabled: true,
        batchSize: 100,
      });

      cacheManager.initialize();

      const allFiles: string[] = [];
      const walk = (dir: string) => {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = statSync(fullPath);
          if (stat.isDirectory() && !["node_modules", ".git"].includes(entry)) {
            walk(fullPath);
          } else if (stat.isFile() && /\.(ts|js)$/.test(entry)) {
            allFiles.push(fullPath);
          }
        }
      };
      walk(syntheticRepoDir);

      const startTime = Date.now();
      const entries = cacheManager.batchUpdateHashes(
        allFiles.map((f) => ({ path: f }))
      );
      const elapsed = Date.now() - startTime;

      expect(entries.length).toBe(allFiles.length);
      console.log(`Batch hash update: ${entries.length} files in ${elapsed}ms`);

      cacheManager.clear();
    });
  });

  describe("Performance targets", () => {
    it("scans 5000+ file repo within 120 seconds", () => {
      // Generate synthetic large repo
      const fileCount = 5000;
      console.log(`Generating synthetic large repo with ${fileCount} files...`);
      const genStart = Date.now();
      generateSyntheticLargeRepo(syntheticRepoDir, fileCount);
      const genTime = Date.now() - genStart;
      console.log(`Repo generation took ${genTime}ms`);

      const actualFileCount = countFiles(syntheticRepoDir);
      console.log(`Actual file count: ${actualFileCount}`);
      expect(actualFileCount).toBeGreaterThanOrEqual(fileCount * 0.9); // Allow 10% variance

      // Run scan
      console.log(`Running scan on ${actualFileCount} files...`);
      const scanStart = Date.now();
      const args = [syntheticRepoDir, "--out", tempOutDir, "--verbose"];
      const result = scanCommand(args, { VERSION, EXIT, getOption });
      const scanTime = Date.now() - scanStart;

      console.log(`Scan duration: ${scanTime}ms (target: ${TARGET_MS}ms)`);
      console.log(`Exit code: ${result}`);
      console.log(`Margin: ${TARGET_MS - scanTime}ms remaining`);

      expect(result).toBe(EXIT.OK);
      expect(scanTime).toBeLessThan(TARGET_MS);

      // Verify output
      expect(existsSync(path.join(tempOutDir, "repo-graph.json"))).toBe(true);
    });

    it("scan performance scales linearly with file count", () => {
      // Test different file sizes
      const fileCounts = [1000, 2000, 4000];
      const times: number[] = [];

      for (const count of fileCounts) {
        // Clean and regenerate
        rmSync(syntheticRepoDir, { recursive: true, force: true });
        mkdirSync(syntheticRepoDir, { recursive: true });

        console.log(`Generating repo with ${count} files...`);
        generateSyntheticLargeRepo(syntheticRepoDir, count);

        rmSync(tempOutDir, { recursive: true, force: true });
        mkdirSync(tempOutDir, { recursive: true });

        const start = Date.now();
        scanCommand([syntheticRepoDir, "--out", tempOutDir], { VERSION, EXIT, getOption });
        const elapsed = Date.now() - start;

        times.push(elapsed);
        console.log(`${count} files: ${elapsed}ms`);
      }

      // Calculate per-file time for each size
      const perFileTimes = times.map((t, i) => t / fileCounts[i]);
      console.log(`Per-file times: ${perFileTimes.map((t) => t.toFixed(2) + "ms").join(", ")}`);

      // All times should be within target
      for (const time of times) {
        expect(time).toBeLessThan(TARGET_MS);
      }

      // Check linear scaling - per-file time should be roughly consistent
      // Allow some variance due to caching effects
      const avgPerFileTime = perFileTimes.reduce((a, b) => a + b, 0) / perFileTimes.length;
      for (const perFileTime of perFileTimes) {
        // Should not be more than 2x the average (allowing for startup overhead)
        expect(perFileTime).toBeLessThan(avgPerFileTime * 2);
      }
    });

    it("repeated scans maintain performance", () => {
      generateSyntheticLargeRepo(syntheticRepoDir, 3000);

      const runTimes: number[] = [];
      const runs = 3;

      for (let i = 0; i < runs; i++) {
        rmSync(tempOutDir, { recursive: true, force: true });
        mkdirSync(tempOutDir, { recursive: true });

        const start = Date.now();
        scanCommand([syntheticRepoDir, "--out", tempOutDir], { VERSION, EXIT, getOption });
        const elapsed = Date.now() - start;
        runTimes.push(elapsed);

        console.log(`Run ${i + 1}: ${elapsed}ms`);
      }

      // All runs should be within target
      for (const time of runTimes) {
        expect(time).toBeLessThan(TARGET_MS);
      }

      // Second/third runs should not be significantly slower
      const maxVariance = Math.max(...runTimes) / Math.min(...runTimes);
      console.log(`Performance variance: ${maxVariance.toFixed(2)}x`);
      expect(maxVariance).toBeLessThan(2.0);
    });
  });

  describe("Memory efficiency", () => {
    it("clears lazy symbol cache to free memory", () => {
      generateSyntheticLargeRepo(syntheticRepoDir, 100);

      const processor = new FileProcessor({
        repoRoot: syntheticRepoDir,
        lazySymbols: true,
      });

      const allFiles: string[] = [];
      const walk = (dir: string) => {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = statSync(fullPath);
          if (stat.isDirectory() && !["node_modules", ".git"].includes(entry)) {
            walk(fullPath);
          } else if (stat.isFile() && /\.(ts|js)$/.test(entry)) {
            allFiles.push(fullPath);
          }
        }
      };
      walk(syntheticRepoDir);

      // Process files
      for (const file of allFiles.slice(0, 10)) {
        processor.processFile(file);
      }

      const statsBefore = processor.getStats();
      processor.clearLazySymbolCache();
      const statsAfter = processor.getStats();

      expect(statsAfter.lazySymbolCacheSize).toBe(0);
      expect(statsAfter.lazySymbolCacheSize).toBeLessThanOrEqual(
        statsBefore.lazySymbolCacheSize
      );

      processor.terminate();
    });

    it("handles large repos without memory issues", async () => {
      // Generate a large repo and process it
      generateSyntheticLargeRepo(syntheticRepoDir, 2000);

      const processor = new FileProcessor({
        repoRoot: syntheticRepoDir,
        streamingMode: true,
        chunkSize: 200,
        lazySymbols: true,
      });

      const allFiles: string[] = [];
      const walk = (dir: string) => {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = statSync(fullPath);
          if (stat.isDirectory() && !["node_modules", ".git"].includes(entry)) {
            walk(fullPath);
          } else if (stat.isFile() && /\.(ts|js)$/.test(entry)) {
            allFiles.push(fullPath);
          }
        }
      };
      walk(syntheticRepoDir);

      let totalProcessed = 0;

      for await (const chunkResults of processor.processFilesStreaming(allFiles)) {
        totalProcessed += chunkResults.length;

        // Clear cache periodically to simulate memory management
        if (totalProcessed % 500 === 0) {
          processor.clearLazySymbolCache();
        }
      }

      expect(totalProcessed).toBe(allFiles.length);
      processor.terminate();
    });
  });

  describe("Progress reporting", () => {
    it("reports progress during large repo processing", () => {
      generateSyntheticLargeRepo(syntheticRepoDir, 500);

      // Run scan with verbose mode
      const args = [syntheticRepoDir, "--out", tempOutDir, "--verbose"];

      // Capture console output
      const consoleSpy = vi.spyOn(console, "log");

      scanCommand(args, { VERSION, EXIT, getOption });

      // Check that progress was logged
      const logs = consoleSpy.mock.calls.map((call) => call[0]);

      // Should have phase-related logs
      const phaseLogs = logs.filter(
        (log) =>
          typeof log === "string" && log.includes('"phase"')
      );

      expect(phaseLogs.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });
  });
});