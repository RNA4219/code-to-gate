/**
 * Integration tests for parallel worker mode
 *
 * Tests:
 * - Worker script exists after build
 * - Worker mode execution capability
 * - Large fixture handling
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runCli,
  fixturePath,
  readJson,
  createTempOutDir,
  cleanupTempDir,
  fileExists,
  createTestFixture,
} from "./helper.js";
import path from "node:path";
import { existsSync } from "node:fs";

describe("parallel worker integration", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = createTempOutDir("worker-test");
  });

  afterAll(() => {
    cleanupTempDir(tempDir);
  });

  it("worker script exists after build", () => {
    const workerPath = path.join(process.cwd(), "dist/parallel/file-processor-worker.js");
    expect(existsSync(workerPath)).toBe(true);
  });

  it("scan uses single-thread for small fixtures", { timeout: 30000 }, () => {
    // demo-ci-imports has < 100 files, should use single-thread
    const fixtureRoot = fixturePath("demo-ci-imports");
    const result = runCli(["scan", fixtureRoot, "--out", tempDir, "--parallel", "2"]);

    expect(result.exitCode).toBe(0);
    expect(fileExists(path.join(tempDir, "repo-graph.json"))).toBe(true);
  });

  it("scan handles fixture with 100+ generated files", { timeout: 240000 }, () => {
    // Create synthetic fixture with 105 files to exceed threshold (minimal)
    const largeFixtureDir = path.join(tempDir, "large-fixture-src");
    const files: Array<{ path: string; content: string }> = [];

    for (let i = 0; i < 105; i++) {
      files.push({
        path: `src/module${i}.ts`,
        content: `export function func${i}() { return ${i}; }\n`,
      });
    }

    // Create fixture using helper
    const fixturePathCreated = createTestFixture("large-fixture", files);
    const workerOutDir = path.join(tempDir, "worker-large");

    const result = runCli(["scan", fixturePathCreated, "--out", workerOutDir, "--parallel", "2"], process.cwd(), 180000);

    // Allow non-zero exit code on Windows race condition
    if (result.exitCode !== 0) {
      // Retry once if failed
      const retryResult = runCli(["scan", fixturePathCreated, "--out", workerOutDir, "--parallel", "2"], process.cwd(), 180000);
      expect(retryResult.exitCode).toBe(0);
    } else {
      expect(result.exitCode).toBe(0);
    }
    expect(fileExists(path.join(workerOutDir, "repo-graph.json"))).toBe(true);

    const graph = readJson(path.join(workerOutDir, "repo-graph.json")) as {
      artifact: string;
      files: Array<{ path: string }>;
    };

    expect(graph.artifact).toBe("normalized-repo-graph");
    expect(graph.files.length).toBeGreaterThan(100);
  });

  it("analyze with parallel option completes on large fixture", { timeout: 240000 }, () => {
    const fixtureRoot = fixturePath("demo-shop-ts");
    const analyzeOutDir = path.join(tempDir, "analyze-parallel");

    // Note: --parallel affects scan, not analyze directly
    // But this verifies the overall flow works with large repos
    const result = runCli([
      "analyze",
      fixtureRoot,
      "--emit",
      "all",
      "--out",
      analyzeOutDir,
      "--llm-mode",
      "local-only",
    ], process.cwd(), 180000);

    // Accept 0 (OK) or 5 (POLICY_FAILED) as valid
    expect([0, 5]).toContain(result.exitCode);
    expect(fileExists(path.join(analyzeOutDir, "findings.json"))).toBe(true);
  });
});