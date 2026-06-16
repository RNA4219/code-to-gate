import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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

function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

vi.mock("../../adapters/tree-sitter-initializer.js", () => ({
  initializeTreeSitterGrammars: vi.fn(async () => ({
    requested: true,
    parserInitialized: false,
    available: { python: false, ruby: false, go: false, rust: false },
    languages: [
      { language: "python", available: false, adapterId: "ctg-py-tree-sitter-v0", error: "forced failure" },
      { language: "ruby", available: false, adapterId: "ctg-rb-tree-sitter-v0", error: "forced failure" },
      { language: "go", available: false, adapterId: "ctg-go-tree-sitter-v0", error: "forced failure" },
      { language: "rust", available: false, adapterId: "ctg-rs-tree-sitter-v0", error: "forced failure" },
    ],
    failures: [
      { language: "python", code: "TREE_SITTER_INIT_FAILED", message: "forced failure" },
      { language: "ruby", code: "TREE_SITTER_INIT_FAILED", message: "forced failure" },
      { language: "go", code: "TREE_SITTER_INIT_FAILED", message: "forced failure" },
      { language: "rust", code: "TREE_SITTER_INIT_FAILED", message: "forced failure" },
    ],
    totalTimeMs: 1,
  })),
}));

describe("scan CLI Tree-sitter fallback diagnostics", () => {
  const fixtureDir = path.resolve(import.meta.dirname, "../../../fixtures/demo-tree-sitter");
  const tempDir = path.join(tmpdir(), `ctg-tree-sitter-failure-${Date.now()}`);

  beforeAll(() => mkdirSync(tempDir, { recursive: true }));

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("continues with regex fallback and records initialization diagnostics", async () => {
    const { scanCommand } = await import("../scan.js");
    const outDir = path.join(tempDir, "fallback");

    const result = await scanCommand([fixtureDir, "--out", outDir, "--tree-sitter"], {
      VERSION: "test",
      EXIT,
      getOption,
    });

    expect(result).toBe(EXIT.OK);
    const graph = JSON.parse(readFileSync(path.join(outDir, "repo-graph.json"), "utf8"));
    expect(graph.files.find((file: { path: string }) => file.path === "main.go").parser.adapter).toBe("go-regex-v0");
    expect(graph.diagnostics.filter((d: { code: string }) => d.code === "TREE_SITTER_INIT_FAILED")).toHaveLength(4);
  });
});
