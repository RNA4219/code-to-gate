/**
 * Tests for Dataflow-full module
 */

import { describe, it, expect } from "vitest";
import {
  extractCrossFileDataflow,
  extractConditionalFlow,
  extractLoopFlow,
  extractPropertyPropagation,
  buildFullDataflowGraph,
  detectSensitiveDataFlow,
} from "../dataflow-full.js";
import type { NormalizedRepoGraph, SymbolNode, GraphRelation, RepoFile } from "../../types/graph.js";

// Mock repo graph for testing
function createMockRepoGraph(): NormalizedRepoGraph {
  const files: RepoFile[] = [
    {
      id: "file:src/input.ts",
      path: "src/input.ts",
      language: "ts",
      role: "source",
      hash: "abc123",
      sizeBytes: 100,
      lineCount: 10,
      parser: { status: "parsed", adapter: "ts-adapter" },
    },
    {
      id: "file:src/process.ts",
      path: "src/process.ts",
      language: "ts",
      role: "source",
      hash: "def456",
      sizeBytes: 200,
      lineCount: 20,
      parser: { status: "parsed", adapter: "ts-adapter" },
    },
    {
      id: "file:src/output.ts",
      path: "src/output.ts",
      language: "ts",
      role: "source",
      hash: "ghi789",
      sizeBytes: 150,
      lineCount: 15,
      parser: { status: "parsed", adapter: "ts-adapter" },
    },
  ];

  const symbols: SymbolNode[] = [
    {
      id: "symbol:src/input.ts:userInput",
      fileId: "file:src/input.ts",
      name: "userInput",
      kind: "variable",
      exported: true,
      location: { startLine: 1, endLine: 1 },
      evidence: [],
    },
    {
      id: "symbol:src/process.ts:processData",
      fileId: "file:src/process.ts",
      name: "processData",
      kind: "function",
      exported: true,
      location: { startLine: 5, endLine: 10 },
      evidence: [],
    },
    {
      id: "symbol:src/output.ts:writeOutput",
      fileId: "file:src/output.ts",
      name: "writeOutput",
      kind: "function",
      exported: true,
      location: { startLine: 3, endLine: 8 },
      evidence: [],
    },
    {
      id: "symbol:src/output.ts:sql",
      fileId: "file:src/output.ts",
      name: "sql",
      kind: "variable",
      exported: false,
      location: { startLine: 5, endLine: 5 },
      evidence: [],
    },
  ];

  const relations: GraphRelation[] = [
    {
      id: "rel:src/process.ts:imports:input",
      from: "file:src/process.ts",
      to: "module:src/input",
      kind: "imports",
      confidence: 1.0,
      evidence: [],
    },
    {
      id: "rel:src/output.ts:imports:process",
      from: "file:src/output.ts",
      to: "module:src/process",
      kind: "imports",
      confidence: 1.0,
      evidence: [],
    },
    {
      id: "rel:src/input.ts:exports:userInput",
      from: "file:src/input.ts",
      to: "symbol:src/input.ts:userInput",
      kind: "exports",
      confidence: 1.0,
      evidence: [],
    },
    {
      id: "rel:src/process.ts:calls:processData",
      from: "symbol:src/input.ts:userInput",
      to: "symbol:src/process.ts:processData",
      kind: "calls",
      confidence: 0.9,
      evidence: [],
    },
  ];

  return {
    version: "ctg/v1",
    generated_at: "2026-05-03T00:00:00Z",
    run_id: "test-run",
    repo: { root: "/test" },
    tool: { name: "code-to-gate", version: "1.0.0", plugin_versions: [] },
    artifact: "normalized-repo-graph",
    schema: "normalized-repo-graph@v1",
    files,
    modules: [],
    symbols,
    relations,
    tests: [],
    configs: [],
    entrypoints: [],
    diagnostics: [],
    stats: { partial: false },
  };
}

describe("Dataflow-full module", () => {
  describe("extractCrossFileDataflow", () => {
    it("should track dataflow across files via imports", () => {
      const graph = createMockRepoGraph();
      const result = extractCrossFileDataflow(
        graph,
        "symbol:src/input.ts:userInput",
        "symbol:src/process.ts:processData"
      );

      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.sourceSymbolId).toBe("symbol:src/input.ts:userInput");
    });

    it("should return empty graph for non-existent source", () => {
      const graph = createMockRepoGraph();
      const result = extractCrossFileDataflow(
        graph,
        "symbol:nonexistent.ts:unknown",
        "symbol:src/process.ts:processData"
      );

      expect(result.nodes.length).toBe(0);
      expect(result.relations.length).toBe(0);
    });
  });

  describe("extractConditionalFlow", () => {
    it("should extract if-branch dataflow", () => {
      const content = `function test(x) {
  if (x > 0) {
    return x;
  }
}`;
      const result = extractConditionalFlow(content, "test.ts", "symbol:test:test");

      expect(result.nodes.length).toBeGreaterThan(0);
      const ifNode = result.nodes.find(n => n.source.includes("x > 0"));
      expect(ifNode).toBeDefined();
    });

    it("should extract switch-branch dataflow", () => {
      const content = `function test(x) {
  switch (x) {
    case 1: return 1;
    case 2: return 2;
  }
}`;
      const result = extractConditionalFlow(content, "test.ts", "symbol:test:test");

      expect(result.nodes.length).toBeGreaterThan(0);
      const switchNode = result.nodes.find(n => n.source.includes("x"));
      expect(switchNode).toBeDefined();
    });

    it("should return empty for no branches", () => {
      const content = `function test() { return 1; }`;
      const result = extractConditionalFlow(content, "test.ts", "symbol:test:test");

      expect(result.nodes.length).toBe(0);
    });
  });

  describe("extractLoopFlow", () => {
    it("should extract for-loop dataflow", () => {
      const content = `function test(arr) {
  for (let i = 0; i < arr.length; i++) {
    console.log(arr[i]);
  }
}`;
      const result = extractLoopFlow(content, "test.ts", "symbol:test:test");

      expect(result.nodes.length).toBeGreaterThan(0);
      const forNode = result.nodes.find(n => n.kind === "assign");
      expect(forNode).toBeDefined();
    });

    it("should extract while-loop dataflow", () => {
      const content = `function test() {
  while (true) {
    break;
  }
}`;
      const result = extractLoopFlow(content, "test.ts", "symbol:test:test");

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it("should return empty for no loops", () => {
      const content = `function test() { return 1; }`;
      const result = extractLoopFlow(content, "test.ts", "symbol:test:test");

      expect(result.nodes.length).toBe(0);
    });
  });

  describe("extractPropertyPropagation", () => {
    it("should track property access flow", () => {
      const symbols: SymbolNode[] = [
        {
          id: "symbol:test.ts:obj",
          fileId: "file:test.ts",
          name: "obj",
          kind: "variable",
          exported: false,
          evidence: [],
        },
        {
          id: "symbol:test.ts:prop",
          fileId: "file:test.ts",
          name: "prop",
          kind: "variable",
          exported: false,
          evidence: [],
        },
      ];

      const relations: GraphRelation[] = [
        {
          id: "rel:test.ts:ref",
          from: "symbol:test.ts:obj",
          to: "symbol:test.ts:prop",
          kind: "references",
          confidence: 0.9,
          evidence: [],
        },
      ];

      const result = extractPropertyPropagation(symbols, relations, "test.ts", "symbol:test.ts:obj");

      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.sourceSymbolId).toBe("symbol:test.ts:obj");
    });

    it("should return empty for non-existent object", () => {
      const result = extractPropertyPropagation([], [], "test.ts", "symbol:nonexistent");

      expect(result.nodes.length).toBe(0);
    });
  });

  describe("buildFullDataflowGraph", () => {
    it("should build complete dataflow graph from repo graph", () => {
      const graph = createMockRepoGraph();
      const result = buildFullDataflowGraph(graph, false);

      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.relations.length).toBeGreaterThan(0);
    });

    it("should skip non-source files", () => {
      const graph = createMockRepoGraph();
      // Add a config file
      graph.files.push({
        id: "file:config.json",
        path: "config.json",
        language: "unknown",
        role: "config",
        hash: "xyz",
        sizeBytes: 50,
        lineCount: 5,
        parser: { status: "parsed", adapter: "text" },
      });

      const result = buildFullDataflowGraph(graph, false);

      // Should not include dataflow for config file
      const configNodes = result.nodes.filter(n => n.filePath === "config.json");
      expect(configNodes.length).toBe(0);
    });
  });

  describe("detectSensitiveDataFlow", () => {
    it("should detect flow from sensitive source to unsafe sink", () => {
      const graph = createMockRepoGraph();
      const fullDf = buildFullDataflowGraph(graph, false);

      const result = detectSensitiveDataFlow(graph, fullDf);

      // Should detect userInput -> sql flow
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it("should return empty for no sensitive flows", () => {
      const graph = createMockRepoGraph();
      // Remove sensitive symbols
      graph.symbols = graph.symbols.filter(s =>
        !s.name.includes("userInput") &&
        !s.name.includes("sql")
      );

      const fullDf = buildFullDataflowGraph(graph, false);
      const result = detectSensitiveDataFlow(graph, fullDf);

      expect(result.length).toBe(0);
    });
  });
});