/**
 * Performance tests for scan CLI command
 *
 * Phase 1 Performance Acceptance (docs/product-acceptance-v1.md):
 * - Small repo scan (100-500 files, TS/JS) <= 30s
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { scanCommand } from "../../cli/scan.js";
import { existsSync, rmSync, mkdirSync, readdirSync, statSync } from "node:fs";
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

const VERSION = "0.2.0-alpha.1";

function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

/**
 * Count files in a fixture directory (excluding node_modules and .git)
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
    // If directory doesn't exist or can't be read, return 0
  }
  return count;
}

describe("Scan Performance Tests", () => {
  let tempOutDir: string;

  // Performance target: Phase 1 small repo scan <= 30s
  const TARGET_MS = 30000; // 30 seconds

  // Fixture paths
  const fixturesDir = path.resolve(import.meta.dirname, "../../../fixtures");
  const demoShopDir = path.join(fixturesDir, "demo-shop-ts");
  const demoCiImportsDir = path.join(fixturesDir, "demo-ci-imports");

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-scan-perf-test-${Date.now()}`);
    mkdirSync(tempOutDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean output directory before each test
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
    mkdirSync(tempOutDir, { recursive: true });
  });

  describe("Phase 1: Small repo scan <= 30s", () => {
    it("scan demo-shop-ts completes within 30s", () => {
      // Count files to verify it's a small repo (100-500 files target)
      const fileCount = countFiles(demoShopDir);
      console.log(`Fixture: demo-shop-ts (${fileCount} files)`);

      const start = Date.now();
      const args = [demoShopDir, "--out", tempOutDir];
      const result = scanCommand(args, { VERSION, EXIT, getOption });
      const elapsed = Date.now() - start;

      console.log(`Scan duration: ${elapsed}ms (target: ${TARGET_MS}ms)`);
      expect(result).toBe(EXIT.OK);
      expect(elapsed).toBeLessThan(TARGET_MS);
    });

    it("scan demo-ci-imports completes within 30s", () => {
      const fileCount = countFiles(demoCiImportsDir);
      console.log(`Fixture: demo-ci-imports (${fileCount} files)`);

      const start = Date.now();
      const args = [demoCiImportsDir, "--out", tempOutDir];
      const result = scanCommand(args, { VERSION, EXIT, getOption });
      const elapsed = Date.now() - start;

      console.log(`Scan duration: ${elapsed}ms (target: ${TARGET_MS}ms)`);
      expect(result).toBe(EXIT.OK);
      expect(elapsed).toBeLessThan(TARGET_MS);
    });

    it("scan performance is consistent across multiple runs", () => {
      // Run scan multiple times to check consistency
      const runTimes: number[] = [];
      const runs = 3;

      for (let i = 0; i < runs; i++) {
        // Clean output before each run
        rmSync(tempOutDir, { recursive: true, force: true });
        mkdirSync(tempOutDir, { recursive: true });

        const start = Date.now();
        const args = [demoShopDir, "--out", tempOutDir];
        scanCommand(args, { VERSION, EXIT, getOption });
        const elapsed = Date.now() - start;
        runTimes.push(elapsed);
      }

      console.log(`Scan times across ${runs} runs: ${runTimes.join(", ")}ms`);

      // All runs should be within target
      for (const time of runTimes) {
        expect(time).toBeLessThan(TARGET_MS);
      }

      // Check variance - max should not be more than 50% higher than min
      const minTime = Math.min(...runTimes);
      const maxTime = Math.max(...runTimes);
      const variance = maxTime / minTime;
      console.log(`Performance variance: ${variance.toFixed(2)}x`);
      expect(variance).toBeLessThan(1.5);
    });
  });

  describe("Performance metrics collection", () => {
    it("collects detailed timing for scan phases", () => {
      // This test collects timing for different phases of scan
      const start = Date.now();
      const args = [demoShopDir, "--out", tempOutDir];
      const result = scanCommand(args, { VERSION, EXIT, getOption });
      const totalElapsed = Date.now() - start;

      // Verify output was generated
      expect(result).toBe(EXIT.OK);
      expect(existsSync(path.join(tempOutDir, "repo-graph.json"))).toBe(true);

      // Log timing for evidence
      console.log(`Total scan time: ${totalElapsed}ms`);
      console.log(`Target: ${TARGET_MS}ms`);
      console.log(`Margin: ${TARGET_MS - totalElapsed}ms remaining`);

      // Pass/fail based on target
      expect(totalElapsed).toBeLessThan(TARGET_MS);
    });

    it("performance does not degrade with repeated scans", () => {
      // First scan
      rmSync(tempOutDir, { recursive: true, force: true });
      mkdirSync(tempOutDir, { recursive: true });
      const start1 = Date.now();
      scanCommand([demoShopDir, "--out", tempOutDir], { VERSION, EXIT, getOption });
      const time1 = Date.now() - start1;

      // Second scan (should not be significantly slower)
      rmSync(tempOutDir, { recursive: true, force: true });
      mkdirSync(tempOutDir, { recursive: true });
      const start2 = Date.now();
      scanCommand([demoShopDir, "--out", tempOutDir], { VERSION, EXIT, getOption });
      const time2 = Date.now() - start2;

      console.log(`First scan: ${time1}ms, Second scan: ${time2}ms`);

      // Second scan should not be more than 20% slower
      expect(time2).toBeLessThan(time1 * 1.2);
      expect(time2).toBeLessThan(TARGET_MS);
    });
  });

  describe("Edge cases for performance", () => {
    it("scan time scales linearly with file count", () => {
      // Compare scan times between fixtures of different sizes
      const demoShopFiles = countFiles(demoShopDir);
      const demoCiFiles = countFiles(demoCiImportsDir);

      // Scan demo-shop-ts
      rmSync(tempOutDir, { recursive: true, force: true });
      mkdirSync(tempOutDir, { recursive: true });
      const start1 = Date.now();
      scanCommand([demoShopDir, "--out", tempOutDir], { VERSION, EXIT, getOption });
      const time1 = Date.now() - start1;

      // Scan demo-ci-imports
      rmSync(tempOutDir, { recursive: true, force: true });
      mkdirSync(tempOutDir, { recursive: true });
      const start2 = Date.now();
      scanCommand([demoCiImportsDir, "--out", tempOutDir], { VERSION, EXIT, getOption });
      const time2 = Date.now() - start2;

      console.log(`demo-shop-ts: ${demoShopFiles} files, ${time1}ms`);
      console.log(`demo-ci-imports: ${demoCiFiles} files, ${time2}ms`);

      // Calculate per-file time
      const perFileTime1 = time1 / demoShopFiles;
      const perFileTime2 = time2 / demoCiFiles;
      console.log(`Per-file time: ${perFileTime1.toFixed(2)}ms vs ${perFileTime2.toFixed(2)}ms`);

      // Both should be within target
      expect(time1).toBeLessThan(TARGET_MS);
      expect(time2).toBeLessThan(TARGET_MS);

      // Per-file time should be roughly similar (within 3x)
      const ratio = perFileTime1 / perFileTime2;
      expect(ratio).toBeGreaterThan(0.33);
      expect(ratio).toBeLessThan(3);
    });
  });
});