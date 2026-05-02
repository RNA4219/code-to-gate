/**
 * Sample Plugin Execution Tests
 * Verifies Phase 2 Plugin SDK acceptance criteria: "Plugin 作成・実行動作"
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";

const PROJECT_ROOT = process.cwd();
const PLUGINS_DIR = path.join(PROJECT_ROOT, "plugins");
const EXAMPLE_PLUGIN_DIR = path.join(PLUGINS_DIR, "example-custom-rule");
const TEMP_DIR = path.join(PROJECT_ROOT, ".test-temp", "sample-plugin-tests");

// Sample plugin input matching ctg.plugin-input/v1 schema
const SAMPLE_INPUT = {
  version: "ctg.plugin-input/v1",
  repo_graph: {
    version: "ctg/v1",
    generated_at: new Date().toISOString(),
    run_id: "sample-plugin-test",
    repo: { root: "/test/repo" },
    artifact: "normalized-repo-graph",
    schema: "normalized-repo-graph@v1",
    files: [
      {
        id: "f1",
        path: "src/api.ts",
        language: "ts",
        role: "source",
        hash: "abc123",
        sizeBytes: 1000,
        lineCount: 50,
        parser: { status: "parsed" },
      },
      {
        id: "f2",
        path: "src/config.ts",
        language: "ts",
        role: "source",
        hash: "def456",
        sizeBytes: 500,
        lineCount: 25,
        parser: { status: "parsed" },
      },
    ],
    symbols: [],
    relations: [],
    tests: [],
    configs: [],
    entrypoints: [],
    diagnostics: [],
    stats: { partial: false },
  },
  metadata: {
    run_id: "sample-plugin-test-001",
    repo_root: "/test/repo",
    work_dir: TEMP_DIR,
  },
};

describe("Sample Plugin Execution Tests", () => {
  beforeAll(async () => {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    // Ensure plugin dist exists
    const distDir = path.join(EXAMPLE_PLUGIN_DIR, "dist");
    await fs.mkdir(distDir, { recursive: true });
    await fs.copyFile(
      path.join(EXAMPLE_PLUGIN_DIR, "src", "index.js"),
      path.join(distDir, "index.js")
    );
  });

  afterAll(async () => {
    try {
      await fs.rm(TEMP_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("example-custom-rule plugin", () => {
    it("should have valid plugin-manifest.yaml", async () => {
      const manifestPath = path.join(EXAMPLE_PLUGIN_DIR, "plugin-manifest.yaml");
      const manifestContent = await fs.readFile(manifestPath, "utf-8");

      // Verify manifest structure
      expect(manifestContent).toContain("apiVersion: ctg/v1alpha1");
      expect(manifestContent).toContain("kind: rule-plugin");
      expect(manifestContent).toContain("name: example-custom-rule");
      expect(manifestContent).toContain("entry:");
      expect(manifestContent).toContain("capabilities:");
    });

    it("should have executable entry point", async () => {
      const distPath = path.join(EXAMPLE_PLUGIN_DIR, "dist", "index.js");
      const exists = await fs
        .access(distPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("should execute and produce valid output", async () => {
      const inputJson = JSON.stringify(SAMPLE_INPUT);
      const distPath = path.join(EXAMPLE_PLUGIN_DIR, "dist", "index.js");

      // Execute plugin with sample input
      const result = execSync(`node "${distPath}"`, {
        input: inputJson,
        encoding: "utf-8",
        timeout: 30000,
      });

      const output = JSON.parse(result);

      // Verify output structure
      expect(output.version).toBe("ctg.plugin-output/v1");
      expect(output.findings).toBeDefined();
      expect(Array.isArray(output.findings)).toBe(true);
      expect(output.diagnostics).toBeDefined();
      expect(Array.isArray(output.diagnostics)).toBe(true);
    });

    it("should produce findings with correct schema", async () => {
      const inputJson = JSON.stringify(SAMPLE_INPUT);
      const distPath = path.join(EXAMPLE_PLUGIN_DIR, "dist", "index.js");

      const result = execSync(`node "${distPath}"`, {
        input: inputJson,
        encoding: "utf-8",
        timeout: 30000,
      });

      const output = JSON.parse(result);

      // If findings exist, verify schema
      for (const finding of output.findings || []) {
        expect(finding.id).toBeDefined();
        expect(finding.ruleId).toBeDefined();
        expect(finding.category).toBeDefined();
        expect(finding.severity).toBeDefined();
        expect(finding.confidence).toBeDefined();
        expect(finding.title).toBeDefined();
        expect(finding.summary).toBeDefined();
        expect(finding.evidence).toBeDefined();
        expect(Array.isArray(finding.evidence)).toBe(true);
      }
    });

    it("should include scan-complete diagnostic", async () => {
      const inputJson = JSON.stringify(SAMPLE_INPUT);
      const distPath = path.join(EXAMPLE_PLUGIN_DIR, "dist", "index.js");

      const result = execSync(`node "${distPath}"`, {
        input: inputJson,
        encoding: "utf-8",
        timeout: 30000,
      });

      const output = JSON.parse(result);

      const scanComplete = output.diagnostics?.find(
        (d: any) => d.code === "SCAN_COMPLETE"
      );
      expect(scanComplete).toBeDefined();
      expect(scanComplete.severity).toBe("info");
    });
  });

  describe("example-language-python plugin", () => {
    const pythonPluginDir = path.join(PLUGINS_DIR, "example-language-python");

    beforeAll(async () => {
      const distDir = path.join(pythonPluginDir, "dist");
      await fs.mkdir(distDir, { recursive: true });
      await fs.copyFile(
        path.join(pythonPluginDir, "src", "index.js"),
        path.join(distDir, "index.js")
      );
    });

    it("should have valid plugin-manifest.yaml", async () => {
      const manifestPath = path.join(pythonPluginDir, "plugin-manifest.yaml");
      const manifestContent = await fs.readFile(manifestPath, "utf-8");

      expect(manifestContent).toContain("apiVersion: ctg/v1alpha1");
      expect(manifestContent).toContain("kind: language-plugin");
      expect(manifestContent).toContain("name: example-language-python");
    });

    it("should execute and produce valid output", async () => {
      const inputJson = JSON.stringify(SAMPLE_INPUT);
      const distPath = path.join(pythonPluginDir, "dist", "index.js");

      const result = execSync(`node "${distPath}"`, {
        input: inputJson,
        encoding: "utf-8",
        timeout: 30000,
      });

      const output = JSON.parse(result);
      expect(output.version).toBe("ctg.plugin-output/v1");
      expect(output.diagnostics).toBeDefined();
    });
  });

  describe("Plugin SDK documentation", () => {
    it("should have plugin-development.md", async () => {
      const docPath = path.join(PROJECT_ROOT, "docs", "plugin-development.md");
      const exists = await fs
        .access(docPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("should have plugin-examples.md", async () => {
      const docPath = path.join(PROJECT_ROOT, "docs", "plugin-examples.md");
      const exists = await fs
        .access(docPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("should have plugin-security-contract.md", async () => {
      const docPath = path.join(
        PROJECT_ROOT,
        "docs",
        "plugin-security-contract.md"
      );
      const exists = await fs
        .access(docPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("should have plugin-sandbox.md", async () => {
      const docPath = path.join(PROJECT_ROOT, "docs", "plugin-sandbox.md");
      const exists = await fs
        .access(docPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });
  });
});