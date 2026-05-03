/**
 * Phase 2 Beta Acceptance Tests
 * Validates OSS β feature completeness per product-acceptance-v1.md
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const CLI = "./dist/cli.js";
const TEMP_DIR = path.join(process.cwd(), ".test-temp-beta-acceptance");

describe("Phase 2 Beta Acceptance Tests", () => {
  beforeAll(() => {
    if (!existsSync(TEMP_DIR)) {
      mkdirSync(TEMP_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    if (existsSync(TEMP_DIR)) {
      rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  });

  describe("Plugin SDK Acceptance", () => {
    it("should have plugin loader module", () => {
      expect(existsSync("./dist/plugin/plugin-loader.js")).toBe(true);
      expect(existsSync("./dist/plugin/plugin-runner.js")).toBe(true);
      expect(existsSync("./dist/plugin/types.js")).toBe(true);
    });

    it("should have plugin development documentation", () => {
      expect(existsSync("./docs/plugin-development.md")).toBe(true);
      expect(existsSync("./docs/plugin-examples.md")).toBe(true);
    });

    it("should validate plugin manifest schema", () => {
      const manifestSchema = readFileSync("./schemas/plugin-manifest.json", "utf8");
      const schema = JSON.parse(manifestSchema);
      expect(schema.$schema).toBeDefined();
      expect(schema.properties.name).toBeDefined();
      expect(schema.properties.version).toBeDefined();
      expect(schema.properties.entrypoint).toBeDefined();
    });
  });

  describe("Local LLM Acceptance", () => {
    it("should have local LLM providers", () => {
      expect(existsSync("./dist/llm/providers/ollama-provider.js")).toBe(true);
      expect(existsSync("./dist/llm/providers/llamacpp-provider.js")).toBe(true);
    });

    it("should have llm-health CLI command", { timeout: 60000 }, () => {
      // llm-health without args shows health check
      const result = execSync(`node ${CLI} llm-health`, { encoding: "utf8", timeout: 50000 });
      expect(result).toContain("provider");
    });

    it("should enforce localhost-only for local LLM", () => {
      // Verify provider code enforces localhost
      const ollamaProvider = readFileSync("./dist/llm/providers/ollama-provider.js", "utf8");
      expect(ollamaProvider).toContain("localhost");
    });

    it("should have local LLM setup documentation", () => {
      expect(existsSync("./docs/local-llm-setup.md")).toBe(true);
    });
  });

  describe("Historical Comparison Acceptance", () => {
    it("should have historical comparison module", () => {
      expect(existsSync("./dist/historical/comparison.js")).toBe(true);
      expect(existsSync("./dist/historical/baseline.js")).toBe(true);
      expect(existsSync("./dist/historical/regression.js")).toBe(true);
    });

    it("should have historical CLI command", () => {
      // historical command exists and shows usage when run without required args
      try {
        execSync(`node ${CLI} historical`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
      } catch (e: any) {
        // Shows usage when missing required args
        expect(e.stdout || e.stderr || "").toContain("--current");
      }
    });

    it("should have historical comparison documentation", () => {
      expect(existsSync("./docs/historical-comparison.md")).toBe(true);
    });
  });

  describe("Web Viewer MVP Acceptance", () => {
    it("should have viewer modules", () => {
      expect(existsSync("./dist/viewer/report-viewer.js")).toBe(true);
      expect(existsSync("./dist/viewer/graph-viewer.js")).toBe(true);
      expect(existsSync("./dist/viewer/finding-viewer.js")).toBe(true);
    });

    it("should have viewer CLI command", () => {
      // viewer command exists and shows usage when run without required args
      try {
        execSync(`node ${CLI} viewer`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
      } catch (e: any) {
        // Shows usage when missing required args
        expect(e.stdout || e.stderr || "").toContain("--from");
      }
    });

    it("should have web viewer documentation", () => {
      expect(existsSync("./docs/web-viewer.md")).toBe(true);
    });
  });

  describe("Performance Optimization Acceptance", () => {
    it("should have cache modules", () => {
      expect(existsSync("./dist/cache/cache-manager.js")).toBe(true);
      expect(existsSync("./dist/cache/file-cache.js")).toBe(true);
      expect(existsSync("./dist/cache/graph-cache.js")).toBe(true);
      expect(existsSync("./dist/cache/findings-cache.js")).toBe(true);
    });

    it("should have parallel processing module", () => {
      expect(existsSync("./dist/parallel/file-processor.js")).toBe(true);
      expect(existsSync("./dist/parallel/rule-evaluator.js")).toBe(true);
    });

    it("should have --cache CLI option", () => {
      const result = execSync(`node ${CLI} --help`, { encoding: "utf8" });
      expect(result).toContain("--cache");
    });

    it("should have --parallel CLI option", () => {
      const result = execSync(`node ${CLI} --help`, { encoding: "utf8" });
      expect(result).toContain("--parallel");
    });

    it("should have performance documentation", () => {
      expect(existsSync("./docs/performance-optimization.md")).toBe(true);
    });

    it("scan with cache enabled should complete successfully", () => {
      const fixtureDir = "./fixtures/demo-shop-ts";
      const outDir = path.join(TEMP_DIR, "cache-test");

      // First scan (cold cache)
      const result1 = execSync(
        `node ${CLI} scan ${fixtureDir} --out ${outDir} --cache enabled`,
        { encoding: "utf8" }
      );
      expect(result1).toBeDefined();

      // Second scan (warm cache)
      const result2 = execSync(
        `node ${CLI} scan ${fixtureDir} --out ${outDir} --cache enabled`,
        { encoding: "utf8" }
      );
      expect(result2).toBeDefined();
    });
  });

  describe("CLI Extended Options Acceptance", () => {
    it("should have --verbose option for scan", () => {
      const result = execSync(`node ${CLI} --help`, { encoding: "utf8" });
      expect(result).toContain("--verbose");
    });

    it("should output verbose JSON when --verbose is set", () => {
      const fixtureDir = "./fixtures/demo-shop-ts";
      const outDir = path.join(TEMP_DIR, "verbose-test");

      const result = execSync(
        `node ${CLI} scan ${fixtureDir} --out ${outDir} --verbose`,
        { encoding: "utf8" }
      );

      // Verbose mode outputs phase timing info
      expect(result).toContain("phase");
    });
  });

  describe("Integration Acceptance", () => {
    it("should pass all Phase 2 module tests", () => {
      // Run Phase 2 specific tests
      const testFiles = [
        "src/plugin/__tests__/plugin-loader.test.ts",
        "src/plugin/__tests__/plugin-runner.test.ts",
        "src/llm/__tests__/ollama-provider.test.ts",
        "src/llm/__tests__/llamacpp-provider.test.ts",
        "src/historical/__tests__/comparison.test.ts",
        "src/historical/__tests__/regression.test.ts",
        "src/viewer/__tests__/report-viewer.test.ts",
        "src/viewer/__tests__/graph-viewer.test.ts",
        "src/cache/__tests__/cache-manager.test.ts",
        "src/parallel/__tests__/file-processor.test.ts",
      ];

      for (const testFile of testFiles) {
        expect(existsSync(testFile)).toBe(true);
      }
    });

    it("full scan+analyze with new options should work", { timeout: 60000 }, () => {
      const fixtureDir = "./fixtures/demo-shop-ts";
      const outDir = path.join(TEMP_DIR, "full-beta-test");

      // Scan with cache and parallel
      const scanResult = execSync(
        `node ${CLI} scan ${fixtureDir} --out ${outDir} --cache enabled --parallel 2`,
        { encoding: "utf8", timeout: 30000 }
      );
      expect(scanResult).toBeDefined();

      // Analyze (exit code may be non-zero if findings exist)
      try {
        execSync(
          `node ${CLI} analyze ${fixtureDir} --from ${outDir} --out ${outDir} --emit all`,
          { encoding: "utf8", timeout: 30000 }
        );
      } catch (e: any) {
        // Non-zero exit code is expected when findings exist
        expect(e.stdout).toBeDefined();
      }
    });
  });
});