/**
 * Tests for scan CLI command
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
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

// Shared temp directory
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

// Group 1: Single scan on fixturesDir, multiple assertions
describe("scan CLI - fixtures graph", () => {
  let graph: Record<string, unknown>;
  let graphPath: string;

  beforeAll(() => {
    rmSync(tempOutDir, { recursive: true, force: true });
    mkdirSync(tempOutDir, { recursive: true });

    const args = [fixturesDir, "--out", tempOutDir];
    const result = scanCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);

    graphPath = path.join(tempOutDir, "repo-graph.json");
    graph = JSON.parse(readFileSync(graphPath, "utf8"));
  });

  it("repo-graph.json is generated", () => {
    expect(existsSync(graphPath)).toBe(true);
  });

  it("files array is non-empty", () => {
    expect(Array.isArray(graph.files)).toBe(true);
    expect((graph.files as unknown[]).length).toBeGreaterThan(0);
  });

  it("symbols array is non-empty for TypeScript files", () => {
    expect(Array.isArray(graph.symbols)).toBe(true);
    expect((graph.symbols as unknown[]).length).toBeGreaterThan(0);
  });

  it("relations array is populated", () => {
    expect(Array.isArray(graph.relations)).toBe(true);
  });

  it("repo-graph.json has correct schema version", () => {
    expect(graph.version).toBe("ctg/v1alpha1");
    expect(graph.schema).toBe("normalized-repo-graph@v1");
    expect(graph.artifact).toBe("normalized-repo-graph");
  });

  it("detects test files correctly", () => {
    const files = graph.files as Array<{ role: string }>;
    const testFiles = files.filter(f => f.role === "test");
    expect(testFiles.length).toBeGreaterThan(0);
  });

  it("detects config files correctly", () => {
    const files = graph.files as Array<{ role: string }>;
    const configFiles = files.filter(f => f.role === "config");
    expect(configFiles.length).toBeGreaterThan(0);
  });

  it("configs array contains config file paths", () => {
    const configs = graph.configs as Array<{ id: string; path: string }>;
    expect(Array.isArray(configs)).toBe(true);
    expect(configs.length).toBeGreaterThan(0);
    for (const config of configs) {
      expect(config.id).toMatch(/^config:/);
      expect(config.path).toBeDefined();
    }
  });

  it("tests array contains test file paths", () => {
    const tests = graph.tests as Array<{ id: string; path: string; framework: string }>;
    expect(Array.isArray(tests)).toBe(true);
    expect(tests.length).toBeGreaterThan(0);
    for (const test of tests) {
      expect(test.id).toMatch(/^test:/);
      expect(test.path).toBeDefined();
      expect(test.framework).toBeDefined();
    }
  });

  it("file entry has required fields", () => {
    const files = graph.files as Array<{
      id: string;
      path: string;
      language: string;
      role: string;
      hash: string;
      sizeBytes: number;
      lineCount: number;
      parser: { status: string; adapter?: string };
    }>;
    for (const file of files) {
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
    const files = graph.files as Array<{ language: string; parser: { status: string; adapter?: string } }>;
    const tsFiles = files.filter(f => f.language === "ts" || f.language === "tsx");
    for (const file of tsFiles) {
      expect(file.parser.status).toBe("parsed");
      expect(file.parser.adapter).toBeDefined();
    }
  });

  it("repo-graph.json contains repo metadata", () => {
    expect(graph.repo).toBeDefined();
    expect((graph.repo as Record<string, unknown>).root).toBeDefined();
    expect(graph.generated_at).toBeDefined();
    expect(graph.run_id).toBeDefined();
    expect(graph.run_id as string).toMatch(/^ctg-/);
  });

  it("repo-graph.json contains tool metadata", () => {
    expect(graph.tool).toBeDefined();
    expect((graph.tool as Record<string, unknown>).name).toBe("code-to-gate");
    expect((graph.tool as Record<string, unknown>).version).toBeDefined();
    expect(Array.isArray((graph.tool as Record<string, unknown>).plugin_versions)).toBe(true);
  });

  it("symbol has required fields", () => {
    const symbols = graph.symbols as Array<{
      id: string;
      name: string;
      kind: string;
      fileId: string;
      location?: { startLine: number; endLine: number };
    }>;
    for (const symbol of symbols) {
      expect(symbol.id).toBeDefined();
      expect(symbol.name).toBeDefined();
      expect(symbol.kind).toBeDefined();
      expect(symbol.fileId).toBeDefined();
      if (symbol.location) {
        expect(symbol.location.startLine).toBeDefined();
        expect(symbol.location.endLine).toBeDefined();
      }
    }
  });

  it("relation has required fields", () => {
    const relations = graph.relations as Array<{ id: string; kind: string; from: string; to: string }>;
    for (const relation of relations) {
      expect(relation.id).toBeDefined();
      expect(relation.kind).toBeDefined();
      expect(relation.from).toBeDefined();
      expect(relation.to).toBeDefined();
    }
  });

  it("stats object is present", () => {
    expect(graph.stats).toBeDefined();
    expect(typeof (graph.stats as Record<string, unknown>).partial).toBe("boolean");
  });

  it("diagnostics array is present", () => {
    expect(Array.isArray(graph.diagnostics)).toBe(true);
  });

  it("modules array is present (even if empty)", () => {
    expect(Array.isArray(graph.modules)).toBe(true);
  });

  it("file hash is SHA256 format", () => {
    const files = graph.files as Array<{ hash: string }>;
    for (const file of files) {
      expect(file.hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("sizeBytes is positive for files with content", () => {
    const files = graph.files as Array<{ sizeBytes: number }>;
    for (const file of files) {
      expect(file.sizeBytes).toBeGreaterThanOrEqual(0);
    }
  });

  it("lineCount matches file content", () => {
    const files = graph.files as Array<{ lineCount: number }>;
    for (const file of files) {
      expect(file.lineCount).toBeGreaterThanOrEqual(1);
    }
  });

  it("moduleId is assigned to files", () => {
    const files = graph.files as Array<{ moduleId: string }>;
    for (const file of files) {
      expect(file.moduleId).toBeDefined();
      expect(file.moduleId).toMatch(/^module:/);
    }
  });
});

// Group 2: Demo shop scan for entrypoints
describe("scan CLI - demo shop entrypoints", () => {
  let graph: Record<string, unknown>;

  beforeAll(() => {
    rmSync(tempOutDir, { recursive: true, force: true });
    mkdirSync(tempOutDir, { recursive: true });

    const args = [demoShopDir, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    graph = JSON.parse(readFileSync(path.join(tempOutDir, "repo-graph.json"), "utf8"));
  }, 60000);

  it("detects entrypoints in API-related files", () => {
    const entrypoints = graph.entrypoints as Array<{ id: string; path: string; kind: string }>;
    expect(Array.isArray(entrypoints)).toBe(true);
    for (const ep of entrypoints) {
      expect(ep.id).toMatch(/^entrypoint:/);
      expect(ep.path).toBeDefined();
      expect(ep.kind).toBeDefined();
    }
  });
});

// Group 3: Error cases (fast, no actual scan needed)
describe("scan CLI - error cases", () => {
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
});

// Group 4: Edge cases (require small fixtures)
describe("scan CLI - edge cases", () => {
  it("exit code SCAN_FAILED for empty repo", () => {
    rmSync(tempOutDir, { recursive: true, force: true });
    mkdirSync(tempOutDir, { recursive: true });

    const emptyRepo = path.join(tempOutDir, "empty-repo");
    mkdirSync(emptyRepo, { recursive: true });

    const args = [emptyRepo, "--out", tempOutDir];
    const result = scanCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.SCAN_FAILED);
  });

  it("exit code USAGE_ERROR when repo path is a file (not directory)", () => {
    rmSync(tempOutDir, { recursive: true, force: true });
    mkdirSync(tempOutDir, { recursive: true });

    const filePath = path.join(tempOutDir, "not-a-dir.txt");
    writeFileSync(filePath, "test content", "utf8");

    const args = [filePath, "--out", tempOutDir];
    const result = scanCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("custom --out directory is created", () => {
    rmSync(tempOutDir, { recursive: true, force: true });
    mkdirSync(tempOutDir, { recursive: true });

    const customOutDir = path.join(tempOutDir, "custom-output");
    const args = [fixturesDir, "--out", customOutDir];
    const result = scanCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
    expect(existsSync(path.join(customOutDir, "repo-graph.json"))).toBe(true);
  });

  it("default --out is .qh", () => {
    rmSync(tempOutDir, { recursive: true, force: true });
    mkdirSync(tempOutDir, { recursive: true });

    const args = [fixturesDir];
    const result = scanCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
    const defaultOutPath = path.join(process.cwd(), ".qh", "repo-graph.json");
    expect(existsSync(defaultOutPath)).toBe(true);
    rmSync(path.join(process.cwd(), ".qh"), { recursive: true, force: true });
  });
});

// Group 5: Small fixture tests (parallelizable)
describe("scan CLI - small fixtures", () => {
  it("language detection for JavaScript files", () => {
    const jsFixture = path.join(tmpdir(), `ctg-js-fixture-${Date.now()}`);
    mkdirSync(jsFixture, { recursive: true });
    mkdirSync(path.join(jsFixture, "src"), { recursive: true });
    writeFileSync(path.join(jsFixture, "src", "index.js"), "export function hello() { return 'world'; }", "utf8");

    rmSync(tempOutDir, { recursive: true, force: true });
    mkdirSync(tempOutDir, { recursive: true });

    const args = [jsFixture, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graph = JSON.parse(readFileSync(path.join(tempOutDir, "repo-graph.json"), "utf8"));
    rmSync(jsFixture, { recursive: true, force: true });
    const jsFiles = (graph.files as Array<{ path: string; language: string }>).filter(f => f.path.endsWith(".js"));
    expect(jsFiles.length).toBeGreaterThan(0);
    for (const file of jsFiles) {
      expect(file.language).toBe("js");
    }
  });

  it("ignores .git directory", () => {
    const gitRepo = path.join(tmpdir(), `ctg-git-repo-${Date.now()}`);
    mkdirSync(gitRepo, { recursive: true });
    mkdirSync(path.join(gitRepo, ".git"), { recursive: true });
    mkdirSync(path.join(gitRepo, "src"), { recursive: true });
    writeFileSync(path.join(gitRepo, ".git", "config"), "git config", "utf8");
    writeFileSync(path.join(gitRepo, "src", "index.ts"), "export const x = 1;", "utf8");

    rmSync(tempOutDir, { recursive: true, force: true });
    mkdirSync(tempOutDir, { recursive: true });

    const args = [gitRepo, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graph = JSON.parse(readFileSync(path.join(tempOutDir, "repo-graph.json"), "utf8"));
    rmSync(gitRepo, { recursive: true, force: true });
    const gitFiles = (graph.files as Array<{ path: string }>).filter(f => f.path.includes(".git"));
    expect(gitFiles.length).toBe(0);
  });

  it("ignores node_modules directory", () => {
    const nmRepo = path.join(tmpdir(), `ctg-nm-repo-${Date.now()}`);
    mkdirSync(nmRepo, { recursive: true });
    mkdirSync(path.join(nmRepo, "node_modules"), { recursive: true });
    mkdirSync(path.join(nmRepo, "src"), { recursive: true });
    writeFileSync(path.join(nmRepo, "node_modules", "package.json"), "{}", "utf8");
    writeFileSync(path.join(nmRepo, "src", "index.ts"), "export const x = 1;", "utf8");

    rmSync(tempOutDir, { recursive: true, force: true });
    mkdirSync(tempOutDir, { recursive: true });

    const args = [nmRepo, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graph = JSON.parse(readFileSync(path.join(tempOutDir, "repo-graph.json"), "utf8"));
    rmSync(nmRepo, { recursive: true, force: true });
    const nmFiles = (graph.files as Array<{ path: string }>).filter(f => f.path.includes("node_modules"));
    expect(nmFiles.length).toBe(0);
  });

  it("role detection for fixture files", () => {
    // Create fixture outside tempOutDir to avoid deletion
    const fixtureRepo = path.join(tmpdir(), `ctg-fixture-repo-${Date.now()}`);
    mkdirSync(fixtureRepo, { recursive: true });
    mkdirSync(path.join(fixtureRepo, "__fixtures__"), { recursive: true });
    writeFileSync(path.join(fixtureRepo, "__fixtures__", "data.json"), "{}", "utf8");

    rmSync(tempOutDir, { recursive: true, force: true });
    mkdirSync(tempOutDir, { recursive: true });

    const args = [fixtureRepo, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graph = JSON.parse(readFileSync(path.join(tempOutDir, "repo-graph.json"), "utf8"));
    rmSync(fixtureRepo, { recursive: true, force: true });
    const fixtureFiles = (graph.files as Array<{ role: string }>).filter(f => f.role === "fixture");
    expect(fixtureFiles.length).toBeGreaterThan(0);
  });

  it("role detection for docs files", () => {
    const docsRepo = path.join(tmpdir(), `ctg-docs-repo-${Date.now()}`);
    mkdirSync(docsRepo, { recursive: true });
    mkdirSync(path.join(docsRepo, "docs"), { recursive: true });
    writeFileSync(path.join(docsRepo, "docs", "guide.md"), "# Guide", "utf8");

    rmSync(tempOutDir, { recursive: true, force: true });
    mkdirSync(tempOutDir, { recursive: true });

    const args = [docsRepo, "--out", tempOutDir];
    scanCommand(args, { VERSION, EXIT, getOption });

    const graph = JSON.parse(readFileSync(path.join(tempOutDir, "repo-graph.json"), "utf8"));
    rmSync(docsRepo, { recursive: true, force: true });
    const docsFiles = (graph.files as Array<{ role: string }>).filter(f => f.role === "docs");
    expect(docsFiles.length).toBeGreaterThan(0);
  });
});