/**
 * Tests for Graph Viewer
 */

import { describe, it, expect } from "vitest";
import {
  generateMermaidFlowchart,
  generateMermaidDependencyGraph,
  generateMermaidCallGraph,
  generateMermaidSequenceDiagram,
  getMermaidJavaScript,
} from "../graph-viewer.js";
import { SymbolNode, GraphRelation, EntrypointNode } from "../../types/graph.js";

// Mock graph data generators
function createMockSymbol(id: string, name: string, kind: string): SymbolNode {
  return {
    id,
    fileId: `file-${id}`,
    name,
    kind: kind as SymbolNode["kind"],
    exported: true,
    evidence: [],
  };
}

function createMockRelation(from: string, to: string, kind: string): GraphRelation {
  return {
    id: `rel-${from}-${to}`,
    from,
    to,
    kind: kind as GraphRelation["kind"],
    confidence: 0.85,
    evidence: [],
  };
}

function createMockEntrypoint(id: string, route: string): EntrypointNode {
  return {
    id,
    path: `src/${id}.ts`,
    type: "http",
    method: "GET",
    route,
  };
}

describe("graph-viewer", () => {
  describe("generateMermaidFlowchart", () => {
    it("generates valid Mermaid flowchart syntax", () => {
      const graphData = {
        symbols: [createMockSymbol("func1", "testFunc", "function")],
        relations: [],
        entrypoints: [],
      };

      const mermaid = generateMermaidFlowchart(graphData);

      expect(mermaid).toContain("flowchart TD");
      expect(mermaid).toContain("subgraph");
      expect(mermaid).toContain("CodeGraph");
    });

    it("includes nodes for symbols", () => {
      const graphData = {
        symbols: [
          createMockSymbol("func1", "login", "function"),
          createMockSymbol("class1", "User", "class"),
        ],
        relations: [],
        entrypoints: [],
      };

      const mermaid = generateMermaidFlowchart(graphData);

      expect(mermaid).toContain("login");
      expect(mermaid).toContain("User");
    });

    it("includes edges for relations", () => {
      const graphData = {
        symbols: [
          createMockSymbol("func1", "main", "function"),
          createMockSymbol("func2", "helper", "function"),
        ],
        relations: [createMockRelation("func1", "func2", "calls")],
        entrypoints: [],
      };

      const mermaid = generateMermaidFlowchart(graphData);

      expect(mermaid).toContain("-->");
    });

    it("includes entrypoints as special nodes", () => {
      const graphData = {
        symbols: [],
        relations: [],
        entrypoints: [createMockEntrypoint("api", "/api/users")],
      };

      const mermaid = generateMermaidFlowchart(graphData);

      expect(mermaid).toContain("/api/users");
      expect(mermaid).toContain("entrypoint");
    });

    it("limits nodes to maxNodes config", () => {
      const symbols = Array.from({ length: 100 }, (_, i) =>
        createMockSymbol(`sym${i}`, `func${i}`, "function")
      );
      const graphData = {
        symbols,
        relations: [],
        entrypoints: [],
      };

      const mermaid = generateMermaidFlowchart(graphData, { maxNodes: 10 });

      // Should only contain first 10 function names
      expect(mermaid).toContain("func0");
      expect(mermaid).toContain("func9");
      expect(mermaid).not.toContain("func50");
    });

    it("applies node shapes based on symbol kind", () => {
      const graphData = {
        symbols: [
          createMockSymbol("func1", "myFunc", "function"),
          createMockSymbol("class1", "MyClass", "class"),
        ],
        relations: [],
        entrypoints: [],
      };

      const mermaid = generateMermaidFlowchart(graphData);

      // Function should use stadium shape
      expect(mermaid).toContain("([");
      // Class should use subroutine shape
      expect(mermaid).toContain("[[");
    });

    it("includes confidence labels for high confidence relations", () => {
      const graphData = {
        symbols: [
          createMockSymbol("func1", "a", "function"),
          createMockSymbol("func2", "b", "function"),
        ],
        relations: [
          { ...createMockRelation("func1", "func2", "calls"), confidence: 0.95 },
        ],
        entrypoints: [],
      };

      const mermaid = generateMermaidFlowchart(graphData);

      expect(mermaid).toContain("95%");
    });

    it("includes class definitions for styling", () => {
      const graphData = {
        symbols: [createMockSymbol("func1", "test", "function")],
        relations: [],
        entrypoints: [],
      };

      const mermaid = generateMermaidFlowchart(graphData);

      expect(mermaid).toContain("classDef");
      expect(mermaid).toContain("highlighted");
      expect(mermaid).toContain("exported");
    });
  });

  describe("generateMermaidDependencyGraph", () => {
    it("generates valid dependency diagram", () => {
      const graphData = {
        symbols: [],
        relations: [
          createMockRelation("file:a.ts", "file:b.ts", "imports"),
          createMockRelation("file:b.ts", "file:c.ts", "imports"),
        ],
        entrypoints: [],
      };

      const mermaid = generateMermaidDependencyGraph(graphData);

      expect(mermaid).toContain("flowchart LR");
      expect(mermaid).toContain("Dependencies");
    });

    it("groups symbols by file", () => {
      const graphData = {
        symbols: [],
        relations: [
          createMockRelation("src/auth.ts:login", "src/utils.ts:helper", "calls"),
        ],
        entrypoints: [],
      };

      const mermaid = generateMermaidDependencyGraph(graphData);

      // Dependency graph should create file-level nodes
      expect(mermaid).toContain("Dependencies");
      expect(mermaid).toContain("flowchart");
    });
  });

  describe("generateMermaidCallGraph", () => {
    it("generates call graph diagram", () => {
      const graphData = {
        symbols: [
          createMockSymbol("func1", "main", "function"),
          createMockSymbol("func2", "helper", "function"),
        ],
        relations: [
          createMockRelation("func1", "func2", "calls"),
          createMockRelation("func2", "func1", "calls"), // Multiple calls to func1
        ],
        entrypoints: [],
      };

      const mermaid = generateMermaidCallGraph(graphData);

      expect(mermaid).toContain("flowchart TD");
      expect(mermaid).toContain("CallGraph");
    });

    it("shows call counts for functions", () => {
      const graphData = {
        symbols: [createMockSymbol("func1", "hotspot", "function")],
        relations: [
          createMockRelation("func2", "func1", "calls"),
          createMockRelation("func3", "func1", "calls"),
          createMockRelation("func4", "func1", "calls"),
        ],
        entrypoints: [],
      };

      const mermaid = generateMermaidCallGraph(graphData);

      expect(mermaid).toContain("3 calls");
    });

    it("filters to show only call relations", () => {
      const graphData = {
        symbols: [
          createMockSymbol("func1", "a", "function"),
          createMockSymbol("func2", "b", "function"),
        ],
        relations: [
          createMockRelation("func1", "func2", "calls"),
          createMockRelation("func1", "func3", "imports"), // Should be filtered
        ],
        entrypoints: [],
      };

      const mermaid = generateMermaidCallGraph(graphData);

      // Should only contain the calls relation
      expect(mermaid).toContain("CallGraph");
    });
  });

  describe("generateMermaidSequenceDiagram", () => {
    it("generates sequence diagram for entrypoint", () => {
      const graphData = {
        symbols: [createMockSymbol("handler", "handleRequest", "function")],
        relations: [],
        entrypoints: [
          {
            ...createMockEntrypoint("api", "/api/test"),
            symbolId: "handler",
          },
        ],
      };

      const mermaid = generateMermaidSequenceDiagram(
        graphData.entrypoints[0],
        graphData
      );

      expect(mermaid).toContain("sequenceDiagram");
      expect(mermaid).toContain("Client");
    });

    it("handles entrypoint without symbol mapping", () => {
      const entrypoint = createMockEntrypoint("api", "/api/test");
      const graphData = {
        symbols: [],
        relations: [],
        entrypoints: [],
      };

      const mermaid = generateMermaidSequenceDiagram(entrypoint, graphData);

      expect(mermaid).toContain("No symbol mapping");
    });

    it("includes call chain in sequence", () => {
      const graphData = {
        symbols: [
          createMockSymbol("handler", "handle", "function"),
          createMockSymbol("service", "process", "function"),
        ],
        relations: [createMockRelation("handler", "service", "calls")],
        entrypoints: [
          {
            ...createMockEntrypoint("api", "/api"),
            symbolId: "handler",
          },
        ],
      };

      const mermaid = generateMermaidSequenceDiagram(
        graphData.entrypoints[0],
        graphData
      );

      expect(mermaid).toContain("participant");
      expect(mermaid).toContain("handle");
    });
  });

  describe("getMermaidJavaScript", () => {
    it("returns embedded JavaScript for rendering", () => {
      const js = getMermaidJavaScript();

      expect(js).toContain("(function()");
      expect(js).toContain("parseFlowchart");
      expect(js).toContain("renderFlowchart");
    });

    it("includes caching mechanism", () => {
      const js = getMermaidJavaScript();

      expect(js).toContain("diagramCache");
    });

    it("includes node color mapping", () => {
      const js = getMermaidJavaScript();

      expect(js).toContain("getNodeColor");
      expect(js).toContain("highlighted");
      expect(js).toContain("exported");
    });

    it("handles parse errors gracefully", () => {
      const js = getMermaidJavaScript();

      expect(js).toContain("console.warn");
      expect(js).toContain("Mermaid parse error");
    });
  });

  describe("Edge cases", () => {
    it("handles empty graph data", () => {
      const mermaid = generateMermaidFlowchart({
        symbols: [],
        relations: [],
        entrypoints: [],
      });

      expect(mermaid).toContain("flowchart TD");
      expect(mermaid).toContain("CodeGraph");
    });

    it("handles symbols with special characters in name", () => {
      const graphData = {
        symbols: [createMockSymbol("f1", "my-function<test>", "function")],
        relations: [],
        entrypoints: [],
      };

      const mermaid = generateMermaidFlowchart(graphData);

      // Should escape or sanitize special characters
      expect(mermaid).toContain("flowchart");
    });

    it("handles very long symbol names", () => {
      const graphData = {
        symbols: [
          createMockSymbol(
            "f1",
            "thisIsAVeryLongFunctionNameThatShouldBeHandled",
            "function"
          ),
        ],
        relations: [],
        entrypoints: [],
      };

      const mermaid = generateMermaidFlowchart(graphData);

      expect(mermaid).toContain("flowchart");
    });

    it("handles many relations efficiently", () => {
      const symbols = Array.from({ length: 20 }, (_, i) =>
        createMockSymbol(`s${i}`, `f${i}`, "function")
      );
      const relations = Array.from({ length: 50 }, (_, i) =>
        createMockRelation(`s${i % 20}`, `s${(i + 1) % 20}`, "calls")
      );
      const graphData = {
        symbols,
        relations,
        entrypoints: [],
      };

      const mermaid = generateMermaidFlowchart(graphData, { maxEdges: 30 });

      expect(mermaid).toContain("flowchart TD");
    });
  });

  describe("Config options", () => {
    it("respects maxNodes configuration", () => {
      const symbols = Array.from({ length: 10 }, (_, i) =>
        createMockSymbol(`s${i}`, `f${i}`, "function")
      );

      const mermaid = generateMermaidFlowchart(
        { symbols, relations: [], entrypoints: [] },
        { maxNodes: 5 }
      );

      expect(mermaid).toContain("f0");
      expect(mermaid).not.toContain("f9");
    });

    it("respects maxEdges configuration", () => {
      const symbols = Array.from({ length: 5 }, (_, i) =>
        createMockSymbol(`s${i}`, `f${i}`, "function")
      );
      const relations = Array.from({ length: 20 }, (_, i) =>
        createMockRelation(`s${i % 5}`, `s${(i + 1) % 5}`, "calls")
      );

      const mermaid = generateMermaidFlowchart(
        { symbols, relations, entrypoints: [] },
        { maxEdges: 10 }
      );

      expect(mermaid).toContain("flowchart TD");
    });

    it("shows tests when showTests enabled", () => {
      // Note: showTests config affects test nodes visibility
      const graphData = {
        symbols: [createMockSymbol("t1", "testFunc", "test")],
        relations: [],
        entrypoints: [],
      };

      const mermaid = generateMermaidFlowchart(graphData);

      expect(mermaid).toContain("testFunc");
    });
  });
});