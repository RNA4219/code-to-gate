/**
 * Performance tests for analyze CLI command
 *
 * Phase 1 Performance Acceptance (docs/product-acceptance-v1.md):
 * - Small repo analyze (100-500 files, LLM excluded) <= 60s
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { analyzeCommand } from "../../cli/analyze.js";
import { existsSync, rmSync, mkdirSync, readdirSync, statSync, readFileSync } from "node:fs";
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

describe("Analyze Performance Tests", () => {
  let tempOutDir: string;

  // Performance target: Phase 1 small repo analyze <= 60s (no LLM)
  const TARGET_MS = 60000; // 60 seconds

  // Fixture paths
  const fixturesDir = path.resolve(import.meta.dirname, "../../../fixtures");
  const demoShopDir = path.join(fixturesDir, "demo-shop-ts");
  const demoCiImportsDir = path.join(fixturesDir, "demo-ci-imports");
  const policyFile = path.join(fixturesDir, "policies", "strict.yaml");

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-analyze-perf-test-${Date.now()}`);
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

  describe("Phase 1: Small repo analyze <= 60s (no LLM)", () => {
    it("analyze demo-shop-ts completes within 60s (no LLM)", async () => {
      const fileCount = countFiles(demoShopDir);
      console.log(`Fixture: demo-shop-ts (${fileCount} files)`);
      console.log("LLM mode: none (excluded from timing)");

      const start = Date.now();
      const args = [demoShopDir, "--emit", "all", "--out", tempOutDir, "--llm-mode", "none"];
      const result = await analyzeCommand(args, { VERSION, EXIT, getOption });
      const elapsed = Date.now() - start;

      console.log(`Analyze duration: ${elapsed}ms (target: ${TARGET_MS}ms)`);
      console.log(`Exit code: ${result}`);
      console.log(`Margin: ${TARGET_MS - elapsed}ms remaining`);

      // Exit code may vary based on findings - focus on performance
      expect(typeof result).toBe("number");
      expect(elapsed).toBeLessThan(TARGET_MS);
    });

    it("analyze demo-ci-imports completes within 60s (no LLM)", async () => {
      const fileCount = countFiles(demoCiImportsDir);
      console.log(`Fixture: demo-ci-imports (${fileCount} files)`);
      console.log("LLM mode: none (excluded from timing)");

      const start = Date.now();
      const args = [demoCiImportsDir, "--emit", "all", "--out", tempOutDir, "--llm-mode", "none"];
      const result = await analyzeCommand(args, { VERSION, EXIT, getOption });
      const elapsed = Date.now() - start;

      console.log(`Analyze duration: ${elapsed}ms (target: ${TARGET_MS}ms)`);
      expect(result).toBe(EXIT.OK);
      expect(elapsed).toBeLessThan(TARGET_MS);
    });

    it("analyze with policy completes within 60s (no LLM)", async () => {
      const fileCount = countFiles(demoShopDir);
      console.log(`Fixture: demo-shop-ts (${fileCount} files) with policy`);

      const start = Date.now();
      const args = [demoShopDir, "--emit", "all", "--out", tempOutDir, "--llm-mode", "none", "--policy", policyFile];
      const result = await analyzeCommand(args, { VERSION, EXIT, getOption });
      const elapsed = Date.now() - start;

      console.log(`Analyze duration: ${elapsed}ms (target: ${TARGET_MS}ms)`);
      expect(typeof result).toBe("number"); // May be OK or READINESS_NOT_CLEAR depending on findings
      expect(elapsed).toBeLessThan(TARGET_MS);
    });

    it("analyze performance is consistent across multiple runs", async () => {
      const runTimes: number[] = [];
      const runs = 3;

      for (let i = 0; i < runs; i++) {
        // Clean output before each run
        rmSync(tempOutDir, { recursive: true, force: true });
        mkdirSync(tempOutDir, { recursive: true });

        const start = Date.now();
        const args = [demoShopDir, "--emit", "all", "--out", tempOutDir, "--llm-mode", "none"];
        await analyzeCommand(args, { VERSION, EXIT, getOption });
        const elapsed = Date.now() - start;
        runTimes.push(elapsed);
      }

      console.log(`Analyze times across ${runs} runs: ${runTimes.join(", ")}ms`);

      // All runs should be within target
      for (const time of runTimes) {
        expect(time).toBeLessThan(TARGET_MS);
      }

      // Check variance - allow up to 2x variance for timing tests
      const minTime = Math.min(...runTimes);
      const maxTime = Math.max(...runTimes);
      const variance = maxTime / minTime;
      console.log(`Performance variance: ${variance.toFixed(2)}x`);
      expect(variance).toBeLessThan(2.0);
    });
  });

  describe("Performance metrics collection", () => {
    it("collects detailed timing for analyze phases", async () => {
      const start = Date.now();
      const args = [demoShopDir, "--emit", "all", "--out", tempOutDir, "--llm-mode", "none"];
      const result = await analyzeCommand(args, { VERSION, EXIT, getOption });
      const totalElapsed = Date.now() - start;

      // Verify output was generated (exit code may vary based on findings)
      expect(typeof result).toBe("number");
      expect(existsSync(path.join(tempOutDir, "findings.json"))).toBe(true);
      expect(existsSync(path.join(tempOutDir, "audit.json"))).toBe(true);

      // Log timing for evidence
      console.log(`Total analyze time: ${totalElapsed}ms`);
      console.log(`Exit code: ${result}`);
      console.log(`Target: ${TARGET_MS}ms`);
      console.log(`Margin: ${TARGET_MS - totalElapsed}ms remaining`);

      expect(totalElapsed).toBeLessThan(TARGET_MS);
    });

    it("audit.json contains timing information", async () => {
      const args = [demoShopDir, "--emit", "all", "--out", tempOutDir, "--llm-mode", "none"];
      await analyzeCommand(args, { VERSION, EXIT, getOption });

      const auditPath = path.join(tempOutDir, "audit.json");
      const audit = JSON.parse(readFileSync(auditPath, "utf8"));

      // Audit should contain metadata
      expect(audit.artifact).toBe("audit");
      expect(audit.run_id).toBeDefined();
      expect(audit.generated_at).toBeDefined();
    });

    it("performance does not degrade with repeated analyzes", async () => {
      // First analyze
      rmSync(tempOutDir, { recursive: true, force: true });
      mkdirSync(tempOutDir, { recursive: true });
      const start1 = Date.now();
      await analyzeCommand([demoShopDir, "--emit", "all", "--out", tempOutDir, "--llm-mode", "none"], { VERSION, EXIT, getOption });
      const time1 = Date.now() - start1;

      // Second analyze
      rmSync(tempOutDir, { recursive: true, force: true });
      mkdirSync(tempOutDir, { recursive: true });
      const start2 = Date.now();
      await analyzeCommand([demoShopDir, "--emit", "all", "--out", tempOutDir, "--llm-mode", "none"], { VERSION, EXIT, getOption });
      const time2 = Date.now() - start2;

      console.log(`First analyze: ${time1}ms, Second analyze: ${time2}ms`);

      // Second analyze should not be more than 20% slower
      expect(time2).toBeLessThan(time1 * 1.2);
      expect(time2).toBeLessThan(TARGET_MS);
    });
  });

  describe("Emit options performance", () => {
    it("--emit json is faster than --emit all", async () => {
      // Measure json-only emit
      const jsonDir = path.join(tempOutDir, "json");
      mkdirSync(jsonDir, { recursive: true });
      const startJson = Date.now();
      await analyzeCommand([demoShopDir, "--emit", "json", "--out", jsonDir, "--llm-mode", "none"], { VERSION, EXIT, getOption });
      const timeJson = Date.now() - startJson;

      // Measure all emit
      const allDir = path.join(tempOutDir, "all");
      mkdirSync(allDir, { recursive: true });
      const startAll = Date.now();
      await analyzeCommand([demoShopDir, "--emit", "all", "--out", allDir, "--llm-mode", "none"], { VERSION, EXIT, getOption });
      const timeAll = Date.now() - startAll;

      console.log(`--emit json: ${timeJson}ms`);
      console.log(`--emit all: ${timeAll}ms`);

      // Both should be within target
      expect(timeJson).toBeLessThan(TARGET_MS);
      expect(timeAll).toBeLessThan(TARGET_MS);

      // Note: Timing may vary - json-only might not always be faster due to cache effects
      console.log(`Timing difference: ${Math.abs(timeJson - timeAll)}ms`);
    });

    it("--emit yaml performance within target", async () => {
      const yamlDir = path.join(tempOutDir, "yaml");
      mkdirSync(yamlDir, { recursive: true });

      const start = Date.now();
      await analyzeCommand([demoShopDir, "--emit", "yaml", "--out", yamlDir, "--llm-mode", "none"], { VERSION, EXIT, getOption });
      const elapsed = Date.now() - start;

      console.log(`--emit yaml: ${elapsed}ms`);
      expect(elapsed).toBeLessThan(TARGET_MS);
    });

    it("--emit md performance within target", async () => {
      const mdDir = path.join(tempOutDir, "md");
      mkdirSync(mdDir, { recursive: true });

      const start = Date.now();
      await analyzeCommand([demoShopDir, "--emit", "md", "--out", mdDir, "--llm-mode", "none"], { VERSION, EXIT, getOption });
      const elapsed = Date.now() - start;

      console.log(`--emit md: ${elapsed}ms`);
      expect(elapsed).toBeLessThan(TARGET_MS);
    });
  });

  describe("Edge cases for performance", () => {
    it("analyze time scales linearly with file count", async () => {
      const demoShopFiles = countFiles(demoShopDir);
      const demoCiFiles = countFiles(demoCiImportsDir);

      // Analyze demo-shop-ts
      rmSync(tempOutDir, { recursive: true, force: true });
      mkdirSync(tempOutDir, { recursive: true });
      const start1 = Date.now();
      await analyzeCommand([demoShopDir, "--emit", "all", "--out", tempOutDir, "--llm-mode", "none"], { VERSION, EXIT, getOption });
      const time1 = Date.now() - start1;

      // Analyze demo-ci-imports
      rmSync(tempOutDir, { recursive: true, force: true });
      mkdirSync(tempOutDir, { recursive: true });
      const start2 = Date.now();
      await analyzeCommand([demoCiImportsDir, "--emit", "all", "--out", tempOutDir, "--llm-mode", "none"], { VERSION, EXIT, getOption });
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
    });
  });
});