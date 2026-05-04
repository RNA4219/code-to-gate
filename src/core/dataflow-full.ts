/**
 * Dataflow-full: Complete data flow analysis module
 *
 * Extends dataflow-lite with:
 * - Cross-file dataflow tracking
 * - Conditional branch flow
 * - Loop iteration flow
 * - Object property propagation
 *
 * Used for:
 * - Complete dataflow analysis across modules
 * - Security vulnerability chain tracking
 * - Blast radius estimation accuracy improvement
 */

import type { DataflowNode, DataflowRelation, DataflowGraph, SymbolNode, GraphRelation, NormalizedRepoGraph } from "../types/graph.js";
import { sha256 } from "./path-utils.js";
import {
  buildDataflowGraph,
} from "./dataflow-lite.js";

export type { DataflowNode, DataflowRelation, DataflowGraph };

/**
 * Cross-file dataflow tracking
 * Tracks data flow between files via imports/exports
 */
export function extractCrossFileDataflow(
  graph: NormalizedRepoGraph,
  sourceSymbolId: string,
  targetSymbolId: string
): DataflowGraph {
  const nodes: DataflowNode[] = [];
  const relations: DataflowRelation[] = [];

  // Find import/export relations
  const importRelations = graph.relations.filter(r => r.kind === "imports");
  const _exportRelations = graph.relations.filter(r => r.kind === "exports");

  // Build cross-file flow chain
  const sourceSymbol = graph.symbols.find(s => s.id === sourceSymbolId);
  if (!sourceSymbol) {
    return { nodes, relations };
  }

  const sourceFile = graph.files.find(f => f.id === sourceSymbol.fileId);
  if (!sourceFile) {
    return { nodes, relations };
  }

  // Find files that import from source file
  const importingFiles = importRelations
    .filter(r => r.to.includes(sourceFile.path.replace(/\.ts$/, "").replace(/\.js$/, "")))
    .map(r => r.from);

  // Track dataflow through imports
  for (const importingFileId of importingFiles) {
    const importingFile = graph.files.find(f => f.id === importingFileId);
    if (!importingFile) continue;

    // Find symbols in importing file that might use source symbol
    const importingSymbols = graph.symbols.filter(s =>
      s.fileId === importingFileId &&
      s.kind === "function" || s.kind === "method"
    );

    for (const symbol of importingSymbols) {
      const node: DataflowNode = {
        id: `df:cross:${sha256(`${sourceSymbolId}:${symbol.id}`).slice(0, 8)}`,
        kind: "assign",
        source: sourceSymbolId,
        target: symbol.id,
        filePath: importingFile.path,
        location: symbol.location || { startLine: 1, endLine: 1 },
        evidence: [
          {
            id: `ev-cross-${sha256(`${sourceSymbolId}:${symbol.id}`).slice(0, 8)}`,
            path: importingFile.path,
            kind: "import",
            symbolId: symbol.id,
          },
        ],
      };
      nodes.push(node);

      relations.push({
        id: `dfrel:cross:${sha256(`${sourceSymbolId}:${symbol.id}`).slice(0, 8)}`,
        from: sourceSymbolId,
        to: symbol.id,
        kind: "flows_to",
        confidence: 0.7, // Cross-file flow has lower confidence
        evidence: node.evidence,
      });
    }
  }

  return {
    nodes,
    relations,
    sourceSymbolId,
    targetSymbolId,
  };
}

/**
 * Conditional branch flow tracking
 * Tracks data flow through if/switch statements
 */
export function extractConditionalFlow(
  content: string,
  filePath: string,
  symbolId: string
): DataflowGraph {
  const nodes: DataflowNode[] = [];
  const relations: DataflowRelation[] = [];

  const lines = content.split("\n");
  const branches: Array<{ condition: string; startLine: number; endLine: number }> = [];

  // Find if/else/switch branches
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const ifMatch = trimmed.match(/^if\s*\((.+)\)/) || trimmed.match(/^if\s+(.+)\s*:/);
    const switchMatch = trimmed.match(/^switch\s*\((.+)\)/);

    if (ifMatch) {
      branches.push({
        condition: ifMatch[1],
        startLine: i + 1,
        endLine: findBranchEnd(lines, i),
      });
    }

    if (switchMatch) {
      branches.push({
        condition: switchMatch[1],
        startLine: i + 1,
        endLine: findBranchEnd(lines, i),
      });
    }
  }

  // Create dataflow nodes for each branch
  for (const branch of branches) {
    const branchNodeId = `df:cond:${sha256(`${filePath}:${symbolId}:${branch.startLine}`).slice(0, 8)}`;

    nodes.push({
      id: branchNodeId,
      kind: "assign",
      source: branch.condition,
      target: `${symbolId}:branch:${branch.startLine}`,
      filePath,
      location: { startLine: branch.startLine, endLine: branch.endLine },
      evidence: [
        {
          id: `ev-cond-${sha256(`${filePath}:${branch.startLine}`).slice(0, 8)}`,
          path: filePath,
          startLine: branch.startLine,
          endLine: branch.endLine,
          kind: "ast",
          symbolId,
        },
      ],
    });

    relations.push({
      id: `dfrel:cond:${sha256(`${symbolId}:${branch.startLine}`).slice(0, 8)}`,
      from: symbolId,
      to: `${symbolId}:branch:${branch.startLine}`,
      kind: "flows_to",
      confidence: 0.8,
      evidence: nodes[nodes.length - 1].evidence,
    });
  }

  return {
    nodes,
    relations,
    sourceSymbolId: symbolId,
  };
}

/**
 * Loop iteration flow tracking
 * Tracks data flow through for/while loops
 */
export function extractLoopFlow(
  content: string,
  filePath: string,
  symbolId: string
): DataflowGraph {
  const nodes: DataflowNode[] = [];
  const relations: DataflowRelation[] = [];

  const lines = content.split("\n");
  const loops: Array<{ type: string; iterator: string; startLine: number; endLine: number }> = [];

  // Find for/while loops
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const forMatch = trimmed.match(/^for\s*\((.+)\)/) || trimmed.match(/^for\s+(.+)\s+in/) || trimmed.match(/^for\s+\w+\s+of/);
    const whileMatch = trimmed.match(/^while\s*\((.+)\)/);

    if (forMatch) {
      loops.push({
        type: "for",
        iterator: forMatch[1],
        startLine: i + 1,
        endLine: findBlockEnd(lines, i),
      });
    }

    if (whileMatch) {
      loops.push({
        type: "while",
        iterator: whileMatch[1],
        startLine: i + 1,
        endLine: findBlockEnd(lines, i),
      });
    }
  }

  // Create dataflow nodes for each loop
  for (const loop of loops) {
    const loopNodeId = `df:loop:${sha256(`${filePath}:${symbolId}:${loop.startLine}`).slice(0, 8)}`;

    nodes.push({
      id: loopNodeId,
      kind: "assign",
      source: loop.iterator,
      target: `${symbolId}:loop:${loop.startLine}`,
      filePath,
      location: { startLine: loop.startLine, endLine: loop.endLine },
      evidence: [
        {
          id: `ev-loop-${sha256(`${filePath}:${loop.startLine}`).slice(0, 8)}`,
          path: filePath,
          startLine: loop.startLine,
          endLine: loop.endLine,
          kind: "ast",
          symbolId,
        },
      ],
    });

    // Loop creates a feedback relation (iteration flows back)
    relations.push({
      id: `dfrel:loop:${sha256(`${symbolId}:${loop.startLine}`).slice(0, 8)}`,
      from: `${symbolId}:loop:${loop.startLine}`,
      to: `${symbolId}:loop:${loop.startLine}`,
      kind: "transforms",
      confidence: 0.7,
      evidence: nodes[nodes.length - 1].evidence,
    });
  }

  return {
    nodes,
    relations,
    sourceSymbolId: symbolId,
  };
}

/**
 * Object property propagation tracking
 * Tracks data flow through object property access/assignment
 */
export function extractPropertyPropagation(
  symbols: SymbolNode[],
  relations: GraphRelation[],
  filePath: string,
  objectId: string
): DataflowGraph {
  const nodes: DataflowNode[] = [];
  const dfRelations: DataflowRelation[] = [];

  // Find all property access relations
  const propAccesses = relations.filter(r =>
    r.from === objectId &&
    r.kind === "references"
  );

  // Find object symbol
  const objectSymbol = symbols.find(s => s.id === objectId);
  if (!objectSymbol) {
    return { nodes, relations: dfRelations };
  }

  // Track property propagation
  for (const access of propAccesses) {
    const targetSymbol = symbols.find(s => s.id === access.to);
    if (!targetSymbol) continue;

    // Create property access dataflow node
    const propNodeId = `df:prop:${sha256(`${objectId}:${access.to}`).slice(0, 8)}`;

    nodes.push({
      id: propNodeId,
      kind: "prop_access",
      source: objectId,
      target: access.to,
      filePath,
      location: targetSymbol.location || { startLine: 1, endLine: 1 },
      evidence: access.evidence,
    });

    dfRelations.push({
      id: `dfrel:prop:${sha256(`${objectId}:${access.to}`).slice(0, 8)}`,
      from: objectId,
      to: access.to,
      kind: "flows_to",
      confidence: access.confidence,
      evidence: access.evidence,
    });
  }

  return {
    nodes,
    relations: dfRelations,
    sourceSymbolId: objectId,
  };
}

/**
 * Build complete dataflow graph from repo graph
 * Integrates all dataflow analysis across all files
 */
export function buildFullDataflowGraph(
  graph: NormalizedRepoGraph,
  verbose: boolean = false
): DataflowGraph {
  const nodes: DataflowNode[] = [];
  const relations: DataflowRelation[] = [];

  // Build per-file dataflow
  for (const file of graph.files) {
    if (file.language !== "ts" && file.language !== "js" && file.language !== "py") {
      continue;
    }

    const fileSymbols = graph.symbols.filter(s => s.fileId === file.id);
    const fileRelations = graph.relations.filter(r =>
      r.from.startsWith(`symbol:${file.path}`) ||
      r.to.startsWith(`symbol:${file.path}`)
    );

    // Basic dataflow
    const basicDf = buildDataflowGraph(fileSymbols, fileRelations, file.path);
    nodes.push(...basicDf.nodes);
    relations.push(...basicDf.relations);

    if (verbose && basicDf.nodes.length > 0) {
      console.log(JSON.stringify({
        file: file.path,
        basicDataflowNodes: basicDf.nodes.length,
        basicDataflowRelations: basicDf.relations.length,
      }));
    }
  }

  // Cross-file dataflow
  const exportSymbols = graph.symbols.filter(s =>
    graph.relations.some(r => r.kind === "exports" && r.to === s.id)
  );

  for (const exportSymbol of exportSymbols) {
    // Find all symbols that import this symbol
    const importRelations = graph.relations.filter(r =>
      r.kind === "imports" &&
      r.to.includes(exportSymbol.name)
    );

    for (const importRel of importRelations) {
      const importingFile = graph.files.find(f => f.id === importRel.from);
      if (!importingFile) continue;

      const importingSymbols = graph.symbols.filter(s =>
        s.fileId === importRel.from &&
        s.kind === "function" || s.kind === "method"
      );

      for (const importingSymbol of importingSymbols) {
        const crossFileDf = extractCrossFileDataflow(graph, exportSymbol.id, importingSymbol.id);
        nodes.push(...crossFileDf.nodes);
        relations.push(...crossFileDf.relations);
      }
    }
  }

  return {
    nodes,
    relations,
  };
}

/**
 * Helper: Find branch end line (if/switch/else)
 */
function findBranchEnd(lines: string[], startIdx: number): number {
  const startIndent = lines[startIdx].length - lines[startIdx].trimStart().length;
  let braceCount = 0;
  let foundOpenBrace = false;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("//")) {
      continue;
    }

    // Count braces
    for (const char of line) {
      if (char === "{") {
        braceCount++;
        foundOpenBrace = true;
      }
      if (char === "}") {
        braceCount--;
        if (foundOpenBrace && braceCount === 0) {
          return i + 1;
        }
      }
    }

    // Handle braceless blocks (Python-style)
    if (!foundOpenBrace && i > startIdx) {
      const currentIndent = line.length - line.trimStart().length;
      if (currentIndent <= startIndent && trimmed !== "else" && !trimmed.startsWith("elif")) {
        return i;
      }
    }
  }

  return lines.length;
}

/**
 * Helper: Find block end line (for/while loops)
 */
function findBlockEnd(lines: string[], startIdx: number): number {
  // Use same logic as findBranchEnd
  return findBranchEnd(lines, startIdx);
}

/**
 * Detect sensitive data flow to unsafe sinks
 * Security-focused dataflow analysis
 */
export function detectSensitiveDataFlow(
  graph: NormalizedRepoGraph,
  fullDfGraph: DataflowGraph
): Array<{ source: string; sink: string; path: DataflowRelation[] }> {
  const results: Array<{ source: string; sink: string; path: DataflowRelation[] }> = [];

  // Define sensitive sources
  const sensitiveSources = [
    "userInput", "request", "input", "params", "query", "body",
    "localStorage", "sessionStorage", "cookie", "env",
  ];

  // Define unsafe sinks
  const unsafeSinks = [
    "sql", "query", "execute", "eval", "exec", "system",
    "innerHTML", "write", "send", "response", "redirect",
  ];

  // Find sensitive source symbols
  const sourceSymbols = graph.symbols.filter(s =>
    sensitiveSources.some(src =>
      s.name.toLowerCase().includes(src) ||
      s.id.toLowerCase().includes(src)
    )
  );

  // Find unsafe sink symbols
  const sinkSymbols = graph.symbols.filter(s =>
    unsafeSinks.some(snk =>
      s.name.toLowerCase().includes(snk) ||
      s.id.toLowerCase().includes(snk)
    )
  );

  // Find paths from sources to sinks
  for (const source of sourceSymbols) {
    for (const sink of sinkSymbols) {
      const path = findDataflowPath(fullDfGraph, source.id, sink.id);
      if (path.length > 0) {
        results.push({
          source: source.id,
          sink: sink.id,
          path,
        });
      }
    }
  }

  return results;
}

/**
 * Helper: Find dataflow path between two nodes
 */
function findDataflowPath(
  dfGraph: DataflowGraph,
  sourceId: string,
  sinkId: string
): DataflowRelation[] {
  const path: DataflowRelation[] = [];
  const visited = new Set<string>();
  const queue: Array<{ nodeId: string; path: DataflowRelation[] }> = [
    { nodeId: sourceId, path: [] },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.nodeId)) continue;
    visited.add(current.nodeId);

    // Found sink
    if (current.nodeId === sinkId) {
      return current.path;
    }

    // Find outgoing relations
    const outgoing = dfGraph.relations.filter(r => r.from === current.nodeId);
    for (const rel of outgoing) {
      if (!visited.has(rel.to)) {
        queue.push({
          nodeId: rel.to,
          path: [...current.path, rel],
        });
      }
    }
  }

  return path;
}