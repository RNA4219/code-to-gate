/**
 * Graph Viewer - Mermaid-based graph visualization
 *
 * Generates Mermaid diagram definitions for code-to-gate graphs.
 */

import { GraphRelation, SymbolNode, EntrypointNode } from "../types/graph.js";
import { escapeMermaidText, sanitizeNodeId, getNodeShape, getEdgeStyle } from "./graph-viewer-utils.js";
import { getMermaidRendererJavaScript } from "./mermaid-renderer-js.js";

// Re-export utilities
export { escapeMermaidText, sanitizeNodeId, getNodeShape, getEdgeStyle } from "./graph-viewer-utils.js";

/**
 * Configuration for graph generation
 */
export interface GraphViewerConfig {
  maxNodes?: number;
  maxEdges?: number;
  highlightFindings?: string[];
  showTests?: boolean;
  showConfigs?: boolean;
}

/**
 * Graph data for visualization
 */
export interface GraphData {
  symbols: SymbolNode[];
  relations: GraphRelation[];
  entrypoints: EntrypointNode[];
  findings?: Array<{ id: string; affectedSymbols?: string[] }>;
}

/**
 * Generate Mermaid flowchart diagram from graph data
 */
export function generateMermaidFlowchart(
  graphData: GraphData,
  config: GraphViewerConfig = {}
): string {
  const maxNodes = config.maxNodes || 50;
  const maxEdges = config.maxEdges || 100;
  const highlightFindings = config.highlightFindings || [];

  const symbols = graphData.symbols.slice(0, maxNodes);
  const relations = graphData.relations.slice(0, maxEdges);

  let mermaid = `flowchart TD\n`;
  mermaid += `  subgraph CodeGraph["Code Graph"]\n`;

  const nodeMap = new Map<string, string>();
  for (const symbol of symbols) {
    const nodeId = sanitizeNodeId(symbol.id);
    const shape = getNodeShape(symbol.kind);
    const label = escapeMermaidText(symbol.name);

    const isHighlighted = highlightFindings.some((fId) =>
      graphData.findings?.some(
        (f) => f.id === fId && f.affectedSymbols?.includes(symbol.id)
      )
    );

    if (isHighlighted) {
      mermaid += `    ${nodeId}${shape.replace("%s", `"${label}"`)}:::highlighted\n`;
    } else if (symbol.exported) {
      mermaid += `    ${nodeId}${shape.replace("%s", `"${label}"`)}:::exported\n`;
    } else {
      mermaid += `    ${nodeId}${shape.replace("%s", `"${label}"`)}\n`;
    }

    nodeMap.set(symbol.id, nodeId);
  }

  for (const entry of graphData.entrypoints.slice(0, 10)) {
    const nodeId = sanitizeNodeId(entry.id);
    const label = escapeMermaidText(entry.route || entry.path);
    mermaid += `    ${nodeId}>"${label}"]:::entrypoint\n`;

    if (entry.symbolId && nodeMap.has(entry.symbolId)) {
      const targetId = nodeMap.get(entry.symbolId)!;
      mermaid += `    ${nodeId} --> ${targetId}\n`;
    }
  }

  mermaid += `  end\n`;

  for (const relation of relations) {
    const fromId = nodeMap.get(relation.from) || sanitizeNodeId(relation.from);
    const toId = nodeMap.get(relation.to) || sanitizeNodeId(relation.to);
    const edgeStyle = getEdgeStyle(relation.kind);

    if (!nodeMap.has(relation.from) && !nodeMap.has(relation.to)) {
      continue;
    }

    if (relation.confidence >= 0.8) {
      mermaid += `    ${fromId} ${edgeStyle}|"${Math.round(relation.confidence * 100)}%"| ${toId}\n`;
    } else {
      mermaid += `    ${fromId} ${edgeStyle} ${toId}\n`;
    }
  }

  mermaid += `\n  classDef highlighted fill:#dc3545,stroke:#c82333,color:white\n`;
  mermaid += `  classDef exported fill:#667eea,stroke:#5a67d8,color:white\n`;
  mermaid += `  classDef entrypoint fill:#fd7e14,stroke:#dc6a10,color:white\n`;

  return mermaid;
}

/**
 * Generate Mermaid dependency diagram
 */
export function generateMermaidDependencyGraph(
  graphData: GraphData,
  config: GraphViewerConfig = {}
): string {
  const maxNodes = config.maxNodes || 30;

  const fileRelations = new Map<string, Set<string>>();

  for (const relation of graphData.relations) {
    const fromFile = relation.from.split(":")[0] || "unknown";
    const toFile = relation.to.split(":")[0] || "unknown";

    if (!fileRelations.has(fromFile)) {
      fileRelations.set(fromFile, new Set());
    }
    fileRelations.get(fromFile)!.add(toFile);
  }

  const files = Array.from(fileRelations.keys()).slice(0, maxNodes);

  let mermaid = `flowchart LR\n`;
  mermaid += `  subgraph Dependencies["Module Dependencies"]\n`;

  for (const file of files) {
    const nodeId = sanitizeNodeId(file);
    const label = escapeMermaidText(file.replace(/^.*[\\/]/, ""));
    mermaid += `    ${nodeId}["${label}"]\n`;
  }

  mermaid += `  end\n`;

  const entries = Array.from(fileRelations.entries());
  for (const [from, targets] of entries) {
    const fromId = sanitizeNodeId(from);
    for (const to of targets) {
      if (files.includes(to)) {
        const toId = sanitizeNodeId(to);
        mermaid += `    ${fromId} --> ${toId}\n`;
      }
    }
  }

  return mermaid;
}

/**
 * Generate Mermaid call graph (function-level)
 */
export function generateMermaidCallGraph(
  graphData: GraphData,
  config: GraphViewerConfig = {}
): string {
  const callRelations = graphData.relations.filter((r) => r.kind === "calls");
  const maxNodes = config.maxNodes || 20;

  const callCounts = new Map<string, number>();
  for (const rel of callRelations) {
    callCounts.set(rel.to, (callCounts.get(rel.to) || 0) + 1);
  }

  const topCalled = Array.from(callCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxNodes)
    .map(([id]) => id);

  let mermaid = `flowchart TD\n`;
  mermaid += `  subgraph CallGraph["Call Graph"]\n`;

  for (const symbolId of topCalled) {
    const symbol = graphData.symbols.find((s) => s.id === symbolId);
    const nodeId = sanitizeNodeId(symbolId);
    const label = symbol ? escapeMermaidText(symbol.name) : symbolId;
    const callCount = callCounts.get(symbolId) || 0;

    mermaid += `    ${nodeId}["${label}<br/><small>${callCount} calls</small>"]\n`;
  }

  mermaid += `  end\n`;

  for (const rel of callRelations) {
    if (topCalled.includes(rel.from) && topCalled.includes(rel.to)) {
      const fromId = sanitizeNodeId(rel.from);
      const toId = sanitizeNodeId(rel.to);
      mermaid += `    ${fromId} --> ${toId}\n`;
    }
  }

  return mermaid;
}

/**
 * Generate a simple sequence diagram for entrypoint flow
 */
export function generateMermaidSequenceDiagram(
  entrypoint: EntrypointNode,
  graphData: GraphData,
  _config: GraphViewerConfig = {}
): string {
  const startSymbolId = entrypoint.symbolId;
  if (!startSymbolId) {
    return `sequenceDiagram\n  note over Client: No symbol mapping for entrypoint`;
  }

  let mermaid = `sequenceDiagram\n`;
  mermaid += `  participant Client\n`;

  const visited = new Set<string>();
  const toVisit = [startSymbolId];
  const participants: string[] = [];

  const maxDepth = 5;
  let depth = 0;

  while (toVisit.length > 0 && depth < maxDepth) {
    const current = toVisit.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const symbol = graphData.symbols.find((s) => s.id === current);
    if (symbol) {
      const participantId = sanitizeNodeId(symbol.id);
      const participantName = escapeMermaidText(symbol.name);
      participants.push(participantId);
      mermaid += `  participant ${participantId} as "${participantName}"\n`;

      const calls = graphData.relations.filter(
        (r) => r.kind === "calls" && r.from === current
      );
      for (const call of calls) {
        if (!visited.has(call.to)) {
          toVisit.push(call.to);
        }
      }
    }
    depth++;
  }

  if (participants.length > 0) {
    mermaid += `  Client->>+${participants[0]}: Request\n`;
  }

  for (let i = 0; i < participants.length - 1; i++) {
    mermaid += `  ${participants[i]}->>+${participants[i + 1]}: Call\n`;
  }

  for (let i = participants.length - 1; i >= 0; i--) {
    mermaid += `  ${participants[i]}-->>-Client: Response\n`;
  }

  return mermaid;
}

/**
 * Get embedded Mermaid JavaScript for rendering
 */
export function getMermaidJavaScript(): string {
  return getMermaidRendererJavaScript();
}

/**
 * Generate the graph viewer HTML section
 */
export function generateGraphViewerSection(
  graphData: GraphData,
  config: GraphViewerConfig = {}
): string {
  const flowchart = generateMermaidFlowchart(graphData, config);
  const dependencyGraph = generateMermaidDependencyGraph(graphData, config);
  const callGraph = generateMermaidCallGraph(graphData, config);

  return `
<div class="graph-container">
  <div class="graph-title">
    <h2>Code Graph Visualization</h2>
    <div class="graph-controls">
      <button class="filter-btn active" onclick="showGraphTab('flowchart')">Flowchart</button>
      <button class="filter-btn" onclick="showGraphTab('dependencies')">Dependencies</button>
      <button class="filter-btn" onclick="showGraphTab('calls')">Call Graph</button>
    </div>
  </div>

  <div class="graph-canvas">
    <div id="graph-flowchart" class="tab-content active">
      <div class="mermaid">${escapeMermaidText(flowchart)}</div>
    </div>

    <div id="graph-dependencies" class="tab-content">
      <div class="mermaid">${escapeMermaidText(dependencyGraph)}</div>
    </div>

    <div id="graph-calls" class="tab-content">
      <div class="mermaid">${escapeMermaidText(callGraph)}</div>
    </div>
  </div>
</div>

<script>
function showGraphTab(tabId) {
  document.querySelectorAll('.graph-controls .filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');

  document.querySelectorAll('.graph-canvas .tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById('graph-' + tabId).classList.add('active');
}
</script>
`;
}