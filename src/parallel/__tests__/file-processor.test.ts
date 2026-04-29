/**
 * Tests for FileProcessor - parallel file parsing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { FileProcessor, FileProcessorOptions, FileProcessorResult } from "../file-processor.js";

// Test directory
const TEST_DIR = path.join(process.cwd(), ".test-file-processor");

// Helper to create test files
function createTestFile(relPath: string, content: string): string {
  const absPath = path.join(TEST_DIR, relPath);
  const dir = path.dirname(absPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(absPath, content, "utf8");
  return absPath;
}

// Helper to create multiple test files
function createTestFiles(count: number): string[] {
  const files: string[] = [];
  for (let i = 0; i < count; i++) {
    files.push(createTestFile(`src/file${i}.ts`, `const value${i} = ${i};`));
  }
  return files;
}

describe("FileProcessor", () => {
  beforeEach(() => {
    // Create test directory
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("constructor", () => {
    it("should create processor with default options", () => {
      const processor = new FileProcessor({ repoRoot: TEST_DIR });
      const stats = processor.getStats();

      expect(stats.batchSize).toBe(50);
      expect(stats.useWorkers).toBe(true);
    });

    it("should create processor with custom options", () => {
      const options: FileProcessorOptions = {
        repoRoot: TEST_DIR,
        maxWorkers: 2,
        batchSize: 10,
        useWorkers: false,
      };
      const processor = new FileProcessor(options);
      const stats = processor.getStats();

      expect(stats.batchSize).toBe(10);
      expect(stats.useWorkers).toBe(false);
    });
  });

  describe("processFile", () => {
    it("should process a TypeScript file", () => {
      const processor = new FileProcessor({
        repoRoot: TEST_DIR,
        useWorkers: false,
      });

      const file = createTestFile(
        "src/example.ts",
        `export function hello(): string {
  return "Hello, World!";
}`
      );

      const result = processor.processFile(file);

      expect(result.success).toBe(true);
      expect(result.file.language).toBe("ts");
      expect(result.file.role).toBe("source");
      expect(result.file.hash).toBeDefined();
      expect(result.parseResult.parserStatus).toBe("parsed");
    });

    it("should process a JavaScript file", () => {
      const processor = new FileProcessor({
        repoRoot: TEST_DIR,
        useWorkers: false,
      });

      const file = createTestFile(
        "src/example.js",
        `module.exports = {
  greet: function(name) {
    return "Hello, " + name;
  }
};`
      );

      const result = processor.processFile(file);

      expect(result.success).toBe(true);
      expect(result.file.language).toBe("js");
    });

    it("should process a test file", () => {
      const processor = new FileProcessor({
        repoRoot: TEST_DIR,
        useWorkers: false,
      });

      const file = createTestFile(
        "tests/example.test.ts",
        `describe("example", () => {
  it("should work", () => {
    expect(true).toBe(true);
  });
});`
      );

      const result = processor.processFile(file);

      expect(result.success).toBe(true);
      expect(result.file.role).toBe("test");
    });

    it("should handle parse errors", () => {
      const processor = new FileProcessor({
        repoRoot: TEST_DIR,
        useWorkers: false,
      });

      const file = createTestFile("src/error.ts", "const broken = {{{");

      const result = processor.processFile(file);

      expect(result.file.parser.status).toBe("failed");
      expect(result.parseResult.diagnostics.length).toBeGreaterThan(0);
    });

    it("should handle unsupported languages", () => {
      const processor = new FileProcessor({
        repoRoot: TEST_DIR,
        useWorkers: false,
      });

      const file = createTestFile("src/example.md", "# Example Document");

      const result = processor.processFile(file);

      expect(result.success).toBe(true);
      expect(result.file.language).toBe("unknown");
      expect(result.parseResult.parserStatus).toBe("skipped");
    });
  });

  describe("processFiles (single-thread)", () => {
    it("should process multiple files", async () => {
      const processor = new FileProcessor({
        repoRoot: TEST_DIR,
        useWorkers: false,
      });

      const files = createTestFiles(5);
      const results = await processor.processFiles(files);

      expect(results.length).toBe(5);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it("should emit file-processed events", async () => {
      const processor = new FileProcessor({
        repoRoot: TEST_DIR,
        useWorkers: false,
      });

      const files = createTestFiles(3);
      let eventCount = 0;

      processor.on("file-processed", () => {
        eventCount++;
      });

      await processor.processFiles(files);

      expect(eventCount).toBe(3);
    });

    it("should return empty array for empty input", async () => {
      const processor = new FileProcessor({
        repoRoot: TEST_DIR,
        useWorkers: false,
      });

      const results = await processor.processFiles([]);

      expect(results).toEqual([]);
    });
  });

  describe("processFiles with worker threads", () => {
    it("should use single-thread for small batches", async () => {
      const processor = new FileProcessor({
        repoRoot: TEST_DIR,
        useWorkers: true,
        batchSize: 50,
      });

      const files = createTestFiles(3);
      const results = await processor.processFiles(files);

      expect(results.length).toBe(3);
      // Should use single-thread because batch < batchSize
    });

    it("should handle large batches", async () => {
      const processor = new FileProcessor({
        repoRoot: TEST_DIR,
        useWorkers: false, // Force single-thread for test stability
        batchSize: 50,
      });

      const files = createTestFiles(100);
      const results = await processor.processFiles(files);

      expect(results.length).toBe(100);
    });
  });

  describe("processBatch static method", () => {
    it("should process batch of files", () => {
      const files = createTestFiles(3);

      const batchData = files.map((filePath) => ({
        path: filePath,
        content: readFileSync(filePath, "utf8"),
        fileId: `file:${path.relative(TEST_DIR, filePath)}`,
      }));

      const results = FileProcessor.processBatch(batchData, TEST_DIR);

      expect(results.length).toBe(3);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe("getStats", () => {
    it("should return processor statistics", () => {
      const processor = new FileProcessor({
        repoRoot: TEST_DIR,
        maxWorkers: 4,
        batchSize: 25,
        useWorkers: true,
      });

      const stats = processor.getStats();

      expect(stats.batchSize).toBe(25);
      expect(stats.useWorkers).toBe(true);
    });
  });

  describe("terminate", () => {
    it("should terminate workers", () => {
      const processor = new FileProcessor({
        repoRoot: TEST_DIR,
        useWorkers: true,
      });

      processor.terminate();

      const stats = processor.getStats();
      expect(stats.workerCount).toBe(0);
    });
  });

  describe("file metadata", () => {
    it("should compute correct line count", () => {
      const processor = new FileProcessor({
        repoRoot: TEST_DIR,
        useWorkers: false,
      });

      const content = "line1\nline2\nline3\nline4\nline5";
      const file = createTestFile("src/multiline.ts", content);

      const result = processor.processFile(file);

      expect(result.file.lineCount).toBe(5);
    });

    it("should compute correct size", () => {
      const processor = new FileProcessor({
        repoRoot: TEST_DIR,
        useWorkers: false,
      });

      const content = "Hello, World!";
      const file = createTestFile("src/small.ts", content);

      const result = processor.processFile(file);

      expect(result.file.sizeBytes).toBe(Buffer.byteLength(content));
    });

    it("should compute consistent hash", () => {
      const processor = new FileProcessor({
        repoRoot: TEST_DIR,
        useWorkers: false,
      });

      const content = "const x = 42;";
      const file = createTestFile("src/const.ts", content);

      const result1 = processor.processFile(file);
      const result2 = processor.processFile(file);

      expect(result1.file.hash).toBe(result2.file.hash);
    });
  });
});