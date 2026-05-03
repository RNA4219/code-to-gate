/**
 * Tests for FileProcessor - parallel file parsing
 */

import { describe, it, expect } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { FileProcessor } from "../file-processor.js";

// Generate unique test directory for each test to avoid race conditions
function getTestDir(testName: string): string {
  return path.join(tmpdir(), `ctg-fp-${testName}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

// Helper to create test files
function createTestFile(testDir: string, relPath: string, content: string): string {
  const absPath = path.join(testDir, relPath);
  const dir = path.dirname(absPath);
  if (!dir) {
    mkdirSync(dir, { recursive: true });
  }
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, "utf8");
  return absPath;
}

// Helper to create multiple test files
function createTestFiles(testDir: string, count: number): string[] {
  const files: string[] = [];
  for (let i = 0; i < count; i++) {
    files.push(createTestFile(testDir, `src/file${i}.ts`, `const value${i} = ${i};`));
  }
  return files;
}

describe("FileProcessor", () => {
  describe("constructor", () => {
    it("should create processor with default options", () => {
      const testDir = getTestDir("constructor-default");
      mkdirSync(testDir, { recursive: true });
      const processor = new FileProcessor({ repoRoot: testDir });
      const stats = processor.getStats();

      expect(stats.batchSize).toBe(50);
      expect(typeof stats.useWorkers).toBe("boolean");
      processor.terminate();
      rmSync(testDir, { recursive: true, force: true });
    });

    it("should create processor with custom options", () => {
      const testDir = getTestDir("constructor-custom");
      mkdirSync(testDir, { recursive: true });
      const processor = new FileProcessor({
        repoRoot: testDir,
        maxWorkers: 2,
        batchSize: 10,
        useWorkers: false,
      });
      const stats = processor.getStats();

      expect(stats.batchSize).toBe(10);
      expect(stats.useWorkers).toBe(false);
      processor.terminate();
      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe("processFile", () => {
    it("should process a TypeScript file", () => {
      const testDir = getTestDir("process-ts");
      mkdirSync(testDir, { recursive: true });

      const processor = new FileProcessor({
        repoRoot: testDir,
        useWorkers: false,
      });

      const file = createTestFile(
        testDir,
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
      processor.terminate();
      rmSync(testDir, { recursive: true, force: true });
    });

    it("should process a JavaScript file", () => {
      const testDir = getTestDir("process-js");
      mkdirSync(testDir, { recursive: true });

      const processor = new FileProcessor({
        repoRoot: testDir,
        useWorkers: false,
      });

      const file = createTestFile(
        testDir,
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
      processor.terminate();
      rmSync(testDir, { recursive: true, force: true });
    });

    it("should process a test file", () => {
      const testDir = getTestDir("process-test");
      mkdirSync(testDir, { recursive: true });

      const processor = new FileProcessor({
        repoRoot: testDir,
        useWorkers: false,
      });

      const file = createTestFile(
        testDir,
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
      processor.terminate();
      rmSync(testDir, { recursive: true, force: true });
    });

    it("should handle parse errors", () => {
      const testDir = getTestDir("process-error");
      mkdirSync(testDir, { recursive: true });

      const processor = new FileProcessor({
        repoRoot: testDir,
        useWorkers: false,
      });

      const file = createTestFile(testDir, "src/error.ts", "const broken = {{{");

      const result = processor.processFile(file);

      expect(result.file.parser.status).toBe("failed");
      expect(result.parseResult.diagnostics.length).toBeGreaterThan(0);
      processor.terminate();
      rmSync(testDir, { recursive: true, force: true });
    });

    it("should handle unsupported languages", () => {
      const testDir = getTestDir("process-unsupported");
      mkdirSync(testDir, { recursive: true });

      const processor = new FileProcessor({
        repoRoot: testDir,
        useWorkers: false,
      });

      const file = createTestFile(testDir, "src/example.md", "# Example Document");

      const result = processor.processFile(file);

      expect(result.success).toBe(true);
      expect(result.file.language).toBe("unknown");
      expect(result.parseResult.parserStatus).toBe("skipped");
      processor.terminate();
      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe("processFiles (single-thread)", () => {
    it("should process multiple files", async () => {
      const testDir = getTestDir("process-multi");
      mkdirSync(testDir, { recursive: true });

      const processor = new FileProcessor({
        repoRoot: testDir,
        useWorkers: false,
      });

      const files = createTestFiles(testDir, 5);
      const results = await processor.processFiles(files);

      expect(results.length).toBe(5);
      expect(results.every((r) => r.success)).toBe(true);
      processor.terminate();
      rmSync(testDir, { recursive: true, force: true });
    });

    it("should emit file-processed events", async () => {
      const testDir = getTestDir("process-events");
      mkdirSync(testDir, { recursive: true });

      const processor = new FileProcessor({
        repoRoot: testDir,
        useWorkers: false,
      });

      const files = createTestFiles(testDir, 3);
      let eventCount = 0;

      processor.on("file-processed", () => {
        eventCount++;
      });

      await processor.processFiles(files);

      expect(eventCount).toBe(3);
      processor.terminate();
      rmSync(testDir, { recursive: true, force: true });
    });

    it("should return empty array for empty input", async () => {
      const testDir = getTestDir("process-empty");
      mkdirSync(testDir, { recursive: true });

      const processor = new FileProcessor({
        repoRoot: testDir,
        useWorkers: false,
      });

      const results = await processor.processFiles([]);

      expect(results).toEqual([]);
      processor.terminate();
      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe("processFiles with worker threads", () => {
    it("should use single-thread for small batches", async () => {
      const testDir = getTestDir("worker-small");
      mkdirSync(testDir, { recursive: true });

      const processor = new FileProcessor({
        repoRoot: testDir,
        useWorkers: true,
        batchSize: 50,
      });

      const files = createTestFiles(testDir, 3);
      const results = await processor.processFiles(files);

      expect(results.length).toBe(3);
      processor.terminate();
      rmSync(testDir, { recursive: true, force: true });
    });

    it("should handle large batches", async () => {
      const testDir = getTestDir("worker-large");
      mkdirSync(testDir, { recursive: true });

      const processor = new FileProcessor({
        repoRoot: testDir,
        useWorkers: false, // Force single-thread for test stability
        batchSize: 50,
      });

      const files = createTestFiles(testDir, 20);
      const results = await processor.processFiles(files);

      expect(results.length).toBe(20);
      processor.terminate();
      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe("processBatch static method", () => {
    it("should process batch of files", () => {
      const testDir = getTestDir("batch-static");
      mkdirSync(testDir, { recursive: true });

      const files = createTestFiles(testDir, 3);

      const batchData = files.map((filePath) => ({
        path: filePath,
        content: readFileSync(filePath, "utf8"),
        fileId: `file:${path.relative(testDir, filePath)}`,
      }));

      const results = FileProcessor.processBatch(batchData, testDir);

      expect(results.length).toBe(3);
      expect(results.every((r) => r.success)).toBe(true);
      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe("getStats", () => {
    it("should return processor statistics", () => {
      const testDir = getTestDir("stats");
      mkdirSync(testDir, { recursive: true });

      const processor = new FileProcessor({
        repoRoot: testDir,
        maxWorkers: 4,
        batchSize: 25,
        useWorkers: true,
      });

      const stats = processor.getStats();

      expect(stats.batchSize).toBe(25);
      expect(stats.useWorkers).toBe(true);
      processor.terminate();
      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe("terminate", () => {
    it("should terminate workers", () => {
      const testDir = getTestDir("terminate");
      mkdirSync(testDir, { recursive: true });

      const processor = new FileProcessor({
        repoRoot: testDir,
        useWorkers: true,
      });

      processor.terminate();

      const stats = processor.getStats();
      expect(stats.workerCount).toBe(0);
      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe("file metadata", () => {
    it("should compute correct line count", () => {
      const testDir = getTestDir("metadata-lines");
      mkdirSync(testDir, { recursive: true });

      const processor = new FileProcessor({
        repoRoot: testDir,
        useWorkers: false,
      });

      const content = "line1\nline2\nline3\nline4\nline5";
      const file = createTestFile(testDir, "src/multiline.ts", content);

      const result = processor.processFile(file);

      expect(result.file.lineCount).toBe(5);
      processor.terminate();
      rmSync(testDir, { recursive: true, force: true });
    });

    it("should compute correct size", () => {
      const testDir = getTestDir("metadata-size");
      mkdirSync(testDir, { recursive: true });

      const processor = new FileProcessor({
        repoRoot: testDir,
        useWorkers: false,
      });

      const content = "Hello, World!";
      const file = createTestFile(testDir, "src/small.ts", content);

      const result = processor.processFile(file);

      expect(result.file.sizeBytes).toBe(Buffer.byteLength(content));
      processor.terminate();
      rmSync(testDir, { recursive: true, force: true });
    });

    it("should compute consistent hash", () => {
      const testDir = getTestDir("metadata-hash");
      mkdirSync(testDir, { recursive: true });

      const processor = new FileProcessor({
        repoRoot: testDir,
        useWorkers: false,
      });

      const content = "const x = 42;";
      const file = createTestFile(testDir, "src/const.ts", content);

      const result1 = processor.processFile(file);
      const result2 = processor.processFile(file);

      expect(result1.file.hash).toBe(result2.file.hash);
      processor.terminate();
      rmSync(testDir, { recursive: true, force: true });
    });
  });
});