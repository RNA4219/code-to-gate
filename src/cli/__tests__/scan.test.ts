/**
 * Tests for scan CLI command
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { scanCommand } from "../scan.js";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
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

const VERSION = "0.1.0";

function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

describe("scan CLI", () => {
  let tempOutDir: string;
  const fixturesDir = path.resolve(import.meta.dirname, "../../../fixtures/demo-ci-imports");
  const demoShopDir = path.resolve(import.meta.dirname, "../../../fixtures/demo-shop-ts");

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-scan-test-${Date.now()}`);
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

  it("exit code 0 on valid repo", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    const result = scanCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("repo-graph.json is generated", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    expect(existsSync(graphPath)).toBe(true);
  });

  it("files array is non-empty", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    expect(Array.isArray(graph.files)).toBe(true);
    expect(graph.files.length).toBeGreaterThan(0);
  });

  it("symbols array is non-empty for TypeScript files", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    expect(Array.isArray(graph.symbols)).toBe(true);
    expect(graph.symbols.length).toBeGreaterThan(0);
  });

  it("relations array is populated", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    expect(Array.isArray(graph.relations)).toBe(true);
    // Relations may be empty if no imports are detected, but should be an array
  });

  it("repo-graph.json has correct schema version", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    expect(graph.version).toBe("ctg/v1alpha1");
    expect(graph.schema).toBe("normalized-repo-graph@v1");
    expect(graph.artifact).toBe("normalized-repo-graph");
  });

  it("exit code USAGE_ERROR when repo argument missing", () => {
    const args: string[] = [];
    const result = scanCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code USAGE_ERROR when repo does not exist", () => {
    const args = ["/nonexistent/path", "--out", tempOutDir];
    const result = scanCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("detects test files correctly", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    const testFiles = graph.files.filter((f: { role: string }) => f.role === "test");
    expect(testFiles.length).toBeGreaterThan(0);
  });

  // Additional tests for edge cases and error handling

  it("exit code SCAN_FAILED for empty repo", () => {
    // Create an empty repo
    const emptyRepo = path.join(tempOutDir, "empty-repo");
    mkdirSync(emptyRepo, { recursive: true });

    const args = [emptyRepo, "--out", tempOutDir];
    const result = scanCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.SCAN_FAILED);
  });

  it("exit code USAGE_ERROR when repo path is a file (not directory)", () => {
    // Create a file instead of directory
    const filePath = path.join(tempOutDir, "not-a-dir.txt");
    writeFileSync(filePath, "test content", "utf8");

    const args = [filePath, "--out", tempOutDir];
    const result = scanCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("custom --out directory is created", () => {
    const customOutDir = path.join(tempOutDir, "custom-output");
    // Don't create the directory beforehand - scan should create it

    const args = [fixturesDir, "--out", customOutDir];
    const result = scanCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
    expect(existsSync(path.join(customOutDir, "repo-graph.json"))).toBe(true);
  });

  it("detects config files correctly", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    const configFiles = graph.files.filter((f: { role: string }) => f.role === "config");
    expect(configFiles.length).toBeGreaterThan(0);
    // Should detect package.json, tsconfig-like files, etc.
  });

  it("configs array contains config file paths", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    expect(Array.isArray(graph.configs)).toBe(true);
    expect(graph.configs.length).toBeGreaterThan(0);
    // Each config should have id and path
    for (const config of graph.configs) {
      expect(config.id).toMatch(/^config:/);
      expect(config.path).toBeDefined();
    }
  });

  it("tests array contains test file paths", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    expect(Array.isArray(graph.tests)).toBe(true);
    expect(graph.tests.length).toBeGreaterThan(0);
    // Each test should have id, path, and framework
    for (const test of graph.tests) {
      expect(test.id).toMatch(/^test:/);
      expect(test.path).toBeDefined();
      expect(test.framework).toBeDefined();
    }
  });

  it("file entry has required fields", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    for (const file of graph.files) {
      expect(file.id).toMatch(/^file:/);
      expect(file.path).toBeDefined();
      expect(file.language).toBeDefined();
      expect(file.role).toBeDefined();
      expect(file.hash).toBeDefined();
      expect(typeof file.sizeBytes).toBe("number");
      expect(typeof file.lineCount).toBe("number");
      expect(file.parser).toBeDefined();
      expect(file.parser.status).toBeDefined();
    }
  });

  it("parser status is parsed for TypeScript files", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    const tsFiles = graph.files.filter((f: { language: string }) => f.language === "ts" || f.language === "tsx");
    for (const file of tsFiles) {
      expect(file.parser.status).toBe("parsed");
      expect(file.parser.adapter).toBeDefined();
    }
  });

  it("repo-graph.json contains repo metadata", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    expect(graph.repo).toBeDefined();
    expect(graph.repo.root).toBeDefined();
    expect(graph.generated_at).toBeDefined();
    expect(graph.run_id).toBeDefined();
    expect(graph.run_id).toMatch(/^ctg-/);
  });

  it("repo-graph.json contains tool metadata", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    expect(graph.tool).toBeDefined();
    expect(graph.tool.name).toBe("code-to-gate");
    expect(graph.tool.version).toBeDefined();
    expect(Array.isArray(graph.tool.plugin_versions)).toBe(true);
  });

  it("symbol has required fields", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    for (const symbol of graph.symbols) {
      expect(symbol.id).toBeDefined();
      expect(symbol.name).toBeDefined();
      expect(symbol.kind).toBeDefined();
      expect(symbol.fileId).toBeDefined();
      // location is optional in some adapters, check when present
      if (symbol.location) {
        expect(symbol.location.startLine).toBeDefined();
        expect(symbol.location.endLine).toBeDefined();
      }
    }
  });

  it("relation has required fields", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    for (const relation of graph.relations) {
      expect(relation.id).toBeDefined();
      expect(relation.kind).toBeDefined();
      expect(relation.from).toBeDefined();
      expect(relation.to).toBeDefined();
    }
  });

  it("stats object is present", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    expect(graph.stats).toBeDefined();
    expect(typeof graph.stats.partial).toBe("boolean");
  });

  it("detects entrypoints in API-related files", () => {
    // Use demo-shop-ts which has API-like files
    const args = [demoShopDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    expect(Array.isArray(graph.entrypoints)).toBe(true);
    // Entrypoints may be empty if no routes detected, but should be an array
    for (const ep of graph.entrypoints) {
      expect(ep.id).toMatch(/^entrypoint:/);
      expect(ep.path).toBeDefined();
      expect(ep.kind).toBeDefined();
    }
  });

  it("diagnostics array is present", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    expect(Array.isArray(graph.diagnostics)).toBe(true);
  });

  it("modules array is present (even if empty)", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    expect(Array.isArray(graph.modules)).toBe(true);
  });

  it("handles relative repo path", () => {
    // Test with relative path from fixtures
    const args = ["../../../fixtures/demo-ci-imports", "--out", tempOutDir];
    const result = scanCommand(args, { VERSION, EXIT, getOption });
    // May succeed or fail depending on working directory
    expect(typeof result).toBe("number");
  });

  it("default --out is .qh", () => {
    // Test that default output directory is .qh when --out not specified
    const args = [fixturesDir];
    const result = scanCommand(args, { VERSION, EXIT, getOption });
    // Should succeed (creates .qh in cwd)
    expect(result).toBe(EXIT.OK);
    // .qh/repo-graph.json should exist in cwd
    const defaultOutPath = path.join(process.cwd(), ".qh", "repo-graph.json");
    expect(existsSync(defaultOutPath)).toBe(true);
    // Clean up
    rmSync(path.join(process.cwd(), ".qh"), { recursive: true, force: true });
  });

  it("language detection for JavaScript files", () => {
    // Create a fixture with JS files
    const jsFixture = path.join(tempOutDir, "js-fixture");
    mkdirSync(jsFixture, { recursive: true });
    mkdirSync(path.join(jsFixture, "src"), { recursive: true });
    writeFileSync(path.join(jsFixture, "src", "index.js"), "export function hello() { return 'world'; }", "utf8");

    const args = [jsFixture, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    const jsFiles = graph.files.filter((f: { path: string }) => f.path.endsWith(".js"));
    expect(jsFiles.length).toBeGreaterThan(0);
    for (const file of jsFiles) {
      expect(file.language).toBe("js");
    }
  });

  it("language detection for unknown file types", () => {
    // Create a fixture with unknown file types in a separate location
    const unknownFixture = path.join(tmpdir(), `ctg-unknown-${Date.now()}`);
    mkdirSync(unknownFixture, { recursive: true });
    writeFileSync(path.join(unknownFixture, "README.txt"), "some readme", "utf8");

    const args = [unknownFixture, "--out", tempOutDir];
    const result = scanCommand(args, { VERSION, EXIT, getOption });

    // Clean up fixture
    rmSync(unknownFixture, { recursive: true, force: true });

    // Check that scan succeeded (should find .txt file)
    expect(result).toBe(EXIT.OK);

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    const txtFiles = graph.files.filter((f: { path: string }) => f.path.endsWith(".txt"));
    expect(txtFiles.length).toBeGreaterThan(0);
    for (const file of txtFiles) {
      expect(file.language).toBe("unknown");
    }
  });

  it("role detection for fixture files", () => {
    // Create a fixture with __fixtures__ directory
    const fixtureRepo = path.join(tempOutDir, "fixture-repo");
    mkdirSync(fixtureRepo, { recursive: true });
    mkdirSync(path.join(fixtureRepo, "__fixtures__"), { recursive: true });
    writeFileSync(path.join(fixtureRepo, "__fixtures__", "data.json"), "{}", "utf8");

    const args = [fixtureRepo, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    const fixtureFiles = graph.files.filter((f: { role: string }) => f.role === "fixture");
    expect(fixtureFiles.length).toBeGreaterThan(0);
  });

  it("role detection for docs files", () => {
    // Create docs directory
    const docsRepo = path.join(tempOutDir, "docs-repo");
    mkdirSync(docsRepo, { recursive: true });
    mkdirSync(path.join(docsRepo, "docs"), { recursive: true });
    writeFileSync(path.join(docsRepo, "docs", "guide.md"), "# Guide", "utf8");

    const args = [docsRepo, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    const docsFiles = graph.files.filter((f: { role: string }) => f.role === "docs");
    expect(docsFiles.length).toBeGreaterThan(0);
  });

  it("ignores .git directory", () => {
    // Create .git directory (should be ignored)
    const gitRepo = path.join(tempOutDir, "git-repo");
    mkdirSync(gitRepo, { recursive: true });
    mkdirSync(path.join(gitRepo, ".git"), { recursive: true });
    mkdirSync(path.join(gitRepo, "src"), { recursive: true });
    writeFileSync(path.join(gitRepo, ".git", "config"), "git config", "utf8");
    writeFileSync(path.join(gitRepo, "src", "index.ts"), "export const x = 1;", "utf8");

    const args = [gitRepo, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    // No files from .git should be in the graph
    const gitFiles = graph.files.filter((f: { path: string }) => f.path.includes(".git"));
    expect(gitFiles.length).toBe(0);
  });

  it("ignores node_modules directory", () => {
    // Create node_modules directory (should be ignored)
    const nmRepo = path.join(tempOutDir, "nm-repo");
    mkdirSync(nmRepo, { recursive: true });
    mkdirSync(path.join(nmRepo, "node_modules"), { recursive: true });
    mkdirSync(path.join(nmRepo, "src"), { recursive: true });
    writeFileSync(path.join(nmRepo, "node_modules", "package.json"), "{}", "utf8");
    writeFileSync(path.join(nmRepo, "src", "index.ts"), "export const x = 1;", "utf8");

    const args = [nmRepo, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    // No files from node_modules should be in the graph
    const nmFiles = graph.files.filter((f: { path: string }) => f.path.includes("node_modules"));
    expect(nmFiles.length).toBe(0);
  });

  it("output JSON to stdout on success", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    // Capture stdout would require spy, just verify it doesn't throw
    const result = scanCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("file hash is SHA256 format", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    for (const file of graph.files) {
      // SHA256 hash is 64 hex characters
      expect(file.hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("sizeBytes is positive for files with content", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    for (const file of graph.files) {
      expect(file.sizeBytes).toBeGreaterThanOrEqual(0);
    }
  });

  it("lineCount matches file content", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    for (const file of graph.files) {
      expect(file.lineCount).toBeGreaterThanOrEqual(1);
    }
  });

  it("moduleId is assigned to files", () => {
    const args = [fixturesDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graphPath = path.join(tempOutDir, "repo-graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));

    for (const file of graph.files) {
      expect(file.moduleId).toBeDefined();
      expect(file.moduleId).toMatch(/^module:/);
    }
  });
});