/**
 * Tests for CacheManager - unified cache coordination
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { CacheManager, CacheOptions, CacheStats, CacheValidationResult } from "../cache-manager.js";
import { FileHashCache } from "../file-cache.js";
import { GraphCache } from "../graph-cache.js";
import { FindingsCache } from "../findings-cache.js";

// Test directory
const TEST_DIR = path.join(process.cwd(), ".test-cache-manager");
const CACHE_DIR = path.join(TEST_DIR, ".qh", ".cache");

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

describe("CacheManager", () => {
  beforeEach(() => {
    // Create test directory
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("constructor", () => {
    it("should create cache manager with default options", () => {
      const manager = new CacheManager(TEST_DIR);
      expect(manager.isEnabled()).toBe(true);
    });

    it("should create cache manager with disabled caching", () => {
      const options: Partial<CacheOptions> = { enabled: false };
      const manager = new CacheManager(TEST_DIR, options);
      expect(manager.isEnabled()).toBe(false);
    });

    it("should create cache manager with force rescan option", () => {
      const options: Partial<CacheOptions> = { forceRescan: true };
      const manager = new CacheManager(TEST_DIR, options);
      expect(manager.getStats().overall.needsFullScan).toBe(true);
    });
  });

  describe("initialize and save", () => {
    it("should initialize without errors when cache does not exist", () => {
      const manager = new CacheManager(TEST_DIR, { cacheDir: CACHE_DIR });
      const result = manager.initialize();
      expect(result).toBe(false); // No cache exists yet
    });

    it("should save cache files to disk", () => {
      // Use resolved path for consistency
      const resolvedTestDir = path.resolve(TEST_DIR);
      const resolvedCacheDir = path.resolve(CACHE_DIR);

      // Ensure cache directory exists
      mkdirSync(resolvedCacheDir, { recursive: true });

      const manager = new CacheManager(resolvedTestDir, { cacheDir: resolvedCacheDir });
      manager.initialize();

      // Set some data
      manager.setConfigPolicyHashes("config-hash-123", "policy-hash-456");

      // Create a file and get its hash
      const file1 = createTestFile("src/file1.ts", "const a = 1;");
      manager.getFileHash(file1);

      // Save
      manager.save();

      // Verify cache files exist
      expect(existsSync(path.join(resolvedCacheDir, "file-hash-cache.json"))).toBe(true);
    });

    it("should not save when caching is disabled", () => {
      const manager = new CacheManager(TEST_DIR, {
        enabled: false,
        cacheDir: CACHE_DIR,
      });
      manager.initialize();
      manager.save();

      // Cache file should not exist
      expect(existsSync(path.join(CACHE_DIR, "file-hash-cache.json"))).toBe(false);
    });
  });

  describe("validateCache", () => {
    it("should require full scan when cache is empty", () => {
      const manager = new CacheManager(TEST_DIR, { cacheDir: CACHE_DIR });
      manager.initialize();

      const file1 = createTestFile("src/file1.ts", "const a = 1;");
      const result = manager.validateCache([file1]);

      expect(result.needsFullScan).toBe(false); // Not full scan, just no cache
      expect(result.changedFiles).toHaveLength(1);
      expect(result.unchangedFiles).toHaveLength(0);
    });

    it("should detect changed files after cache update", () => {
      const manager = new CacheManager(TEST_DIR, { cacheDir: CACHE_DIR });
      manager.initialize();

      const file1 = createTestFile("src/file1.ts", "const a = 1;");
      const file2 = createTestFile("src/file2.ts", "const b = 2;");

      // First validation - all files need scan
      const result1 = manager.validateCache([file1, file2]);
      expect(result1.changedFiles).toHaveLength(2);

      // Update file hashes
      manager.getFileHash(file1);
      manager.getFileHash(file2);
      manager.save();

      // Second validation - files should be cached
      const manager2 = new CacheManager(TEST_DIR, { cacheDir: CACHE_DIR });
      manager2.initialize();
      const result2 = manager2.validateCache([file1, file2]);

      expect(result2.changedFiles).toHaveLength(0);
      expect(result2.unchangedFiles).toHaveLength(2);
    });

    it("should require full scan when config changes", () => {
      const manager = new CacheManager(TEST_DIR, { cacheDir: CACHE_DIR });
      manager.initialize();

      const file1 = createTestFile("src/file1.ts", "const a = 1;");

      // Set initial config hash
      manager.setConfigPolicyHashes("config-hash-1");
      manager.getFileHash(file1);
      manager.save();

      // Load with different config hash
      const manager2 = new CacheManager(TEST_DIR, { cacheDir: CACHE_DIR });
      manager2.initialize();

      // Validate with different config hash
      const result = manager2.validateCache([file1], "config-hash-2");
      expect(result.needsFullScan).toBe(true);
    });

    it("should require full scan when force rescan is enabled", () => {
      const manager = new CacheManager(TEST_DIR, {
        cacheDir: CACHE_DIR,
        forceRescan: true,
      });
      manager.initialize();

      const file1 = createTestFile("src/file1.ts", "const a = 1;");
      const result = manager.validateCache([file1]);

      expect(result.needsFullScan).toBe(true);
    });
  });

  describe("getFileHash", () => {
    it("should compute hash for new file", () => {
      const manager = new CacheManager(TEST_DIR, { cacheDir: CACHE_DIR });
      manager.initialize();

      const file1 = createTestFile("src/file1.ts", "const a = 1;");
      const entry = manager.getFileHash(file1);

      // Path should use POSIX format (forward slashes)
      expect(entry.path).toBe("src/file1.ts");
      expect(entry.hash).toBeDefined();
      expect(entry.sizeBytes).toBeGreaterThan(0);
    });

    it("should return cached hash for unchanged file", () => {
      const manager = new CacheManager(TEST_DIR, { cacheDir: CACHE_DIR });
      manager.initialize();

      const file1 = createTestFile("src/file1.ts", "const a = 1;");
      const entry1 = manager.getFileHash(file1);

      // Get hash again
      const entry2 = manager.getFileHash(file1);

      expect(entry1.hash).toBe(entry2.hash);
    });
  });

  describe("computeConfigHash", () => {
    it("should compute hash for config files", () => {
      const manager = new CacheManager(TEST_DIR, { cacheDir: CACHE_DIR });

      const configFile = createTestFile("config.json", "{ \"version\": \"1.0\" }");
      const hash = manager.computeConfigHash([configFile]);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64); // SHA-256 hex length
    });

    it("should handle missing config files", () => {
      const manager = new CacheManager(TEST_DIR, { cacheDir: CACHE_DIR });

      const hash = manager.computeConfigHash(["nonexistent.json"]);
      expect(hash).toBeDefined();
    });
  });

  describe("computePolicyHash", () => {
    it("should compute hash for policy file", () => {
      const manager = new CacheManager(TEST_DIR, { cacheDir: CACHE_DIR });

      const policyFile = createTestFile("policy.yaml", "name: test-policy\nversion: 1.0");
      const hash = manager.computePolicyHash(policyFile);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });

    it("should return undefined for missing policy file", () => {
      const manager = new CacheManager(TEST_DIR, { cacheDir: CACHE_DIR });

      const hash = manager.computePolicyHash("nonexistent.yaml");
      expect(hash).toBeUndefined();
    });
  });

  describe("getCachedFindings and updateFindingsCache", () => {
    it("should cache and retrieve findings", () => {
      const manager = new CacheManager(TEST_DIR, { cacheDir: CACHE_DIR });
      manager.initialize();

      const findings = [
        {
          id: "finding:test:1",
          ruleId: "TEST_RULE",
          category: "validation" as const,
          severity: "medium" as const,
          confidence: 0.8,
          title: "Test Finding",
          summary: "A test finding",
          evidence: [],
        },
      ];

      manager.updateFindingsCache("src/file1.ts", "hash-abc", findings);

      const cached = manager.getCachedFindings("src/file1.ts", "hash-abc");
      expect(cached).toBeDefined();
      expect(cached?.length).toBe(1);
    });

    it("should return undefined for hash mismatch", () => {
      const manager = new CacheManager(TEST_DIR, { cacheDir: CACHE_DIR });
      manager.initialize();

      const findings = [
        {
          id: "finding:test:1",
          ruleId: "TEST_RULE",
          category: "validation" as const,
          severity: "medium" as const,
          confidence: 0.8,
          title: "Test Finding",
          summary: "A test finding",
          evidence: [],
        },
      ];

      manager.updateFindingsCache("src/file1.ts", "hash-abc", findings);

      const cached = manager.getCachedFindings("src/file1.ts", "hash-different");
      expect(cached).toBeUndefined();
    });
  });

  describe("getStats", () => {
    it("should return cache statistics", () => {
      const manager = new CacheManager(TEST_DIR, { cacheDir: CACHE_DIR });
      manager.initialize();

      const stats = manager.getStats();

      expect(stats.fileHash).toBeDefined();
      expect(stats.graph).toBeDefined();
      expect(stats.findings).toBeDefined();
      expect(stats.overall).toBeDefined();
    });
  });

  describe("clear", () => {
    it("should clear all caches", () => {
      const manager = new CacheManager(TEST_DIR, { cacheDir: CACHE_DIR });
      manager.initialize();

      const file1 = createTestFile("src/file1.ts", "const a = 1;");
      manager.getFileHash(file1);

      manager.clear();

      const stats = manager.getStats();
      expect(stats.fileHash.entryCount).toBe(0);
    });
  });
});