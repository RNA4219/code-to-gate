import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { scanCommand } from "../scan.js";

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

describe("scan CLI Tree-sitter opt-in", () => {
  const fixtureDir = path.resolve(import.meta.dirname, "../../../fixtures/demo-tree-sitter");
  const tempDir = path.join(tmpdir(), `ctg-tree-sitter-opt-in-${Date.now()}`);

  beforeAll(() => mkdirSync(tempDir, { recursive: true }));

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not initialize Tree-sitter without --tree-sitter", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const outDir = path.join(tempDir, "default");

    const result = await scanCommand([fixtureDir, "--out", outDir, "--verbose"], {
      VERSION: "test",
      EXIT,
      getOption,
    });

    expect(result).toBe(EXIT.OK);
    expect(log.mock.calls.flat().join("\n")).not.toContain('"phase":"tree-sitter-init"');
    const graph = JSON.parse(readFileSync(path.join(outDir, "repo-graph.json"), "utf8"));
    expect(adapterFor(graph, "main.py")).toBe("py-regex-v0");
    expect(adapterFor(graph, "main.rb")).toBe("rb-regex-v0");
    expect(adapterFor(graph, "main.go")).toBe("go-regex-v0");
    expect(adapterFor(graph, "main.rs")).toBe("rs-regex-v0");
    log.mockRestore();
  });

  it("uses Tree-sitter parsers with --tree-sitter", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const outDir = path.join(tempDir, "explicit");

    const result = await scanCommand(
      [fixtureDir, "--out", outDir, "--verbose", "--tree-sitter"],
      { VERSION: "test", EXIT, getOption },
    );

    expect(result).toBe(EXIT.OK);
    expect(log.mock.calls.flat().join("\n")).toContain('"phase":"tree-sitter-init"');
    const graph = JSON.parse(readFileSync(path.join(outDir, "repo-graph.json"), "utf8"));
    expect(adapterFor(graph, "main.py")).toBe("py-tree-sitter-wasm");
    expect(adapterFor(graph, "main.rb")).toBe("rb-tree-sitter-wasm");
    expect(adapterFor(graph, "main.go")).toBe("go-tree-sitter-wasm");
    expect(adapterFor(graph, "main.rs")).toBe("rs-tree-sitter-wasm");
    expect(graph.diagnostics.some((d: { code: string }) => d.code === "TREE_SITTER_INIT_FAILED")).toBe(false);
    log.mockRestore();
  });
});

function adapterFor(graph: { files: Array<{ path: string; parser: { adapter?: string } }> }, filePath: string): string | undefined {
  return graph.files.find((file) => file.path === filePath)?.parser.adapter;
}
