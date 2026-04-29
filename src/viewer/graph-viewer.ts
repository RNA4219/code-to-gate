/**
 * Graph Viewer - Mermaid-based graph visualization
 *
 * Generates Mermaid diagram definitions for code-to-gate graphs.
 * Self-contained with embedded Mermaid rendering logic.
 */

import { GraphRelation, SymbolNode, EntrypointNode } from "../types/graph.js";

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
 * Escape text for Mermaid diagram
 */
function escapeMermaidText(text: string): string {
  return text
    .replace(/"/g, "'")
    .replace(/\n/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .trim();
}

/**
 * Generate a safe node ID for Mermaid
 */
function sanitizeNodeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+/, "n_");
}

/**
 * Get node shape based on symbol kind
 */
function getNodeShape(kind: string): string {
  switch (kind) {
    case "function":
      return "([%s])"; // Rounded rectangle (stadium)
    case "class":
      return "[[%s]]"; // Rectangle with rounded corners (subroutine)
    case "method":
      return "[%s]"; // Rectangle
    case "interface":
      return "[[%s]]"; // Rectangle with rounded corners
    case "route":
      return ">%s]"; // Arrow shape
    case "test":
      return "((%s))"; // Circle
    default:
      return "[%s]"; // Default rectangle
  }
}

/**
 * Get edge style based on relation kind
 */
function getEdgeStyle(kind: string): string {
  switch (kind) {
    case "calls":
      return "-->"; // Solid arrow
    case "imports":
      return "-.->"; // Dotted arrow
    case "tests":
      return "-..->"; // Dotted arrow with thicker dots
    case "depends_on":
      return "==>"; // Thick arrow
    default:
      return "-->"; // Default solid arrow
  }
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

  // Filter and limit nodes
  const symbols = graphData.symbols.slice(0, maxNodes);
  const relations = graphData.relations.slice(0, maxEdges);

  let mermaid = `flowchart TD\n`;

  // Add title/subgraph
  mermaid += `  subgraph CodeGraph["Code Graph"]\n`;

  // Generate nodes
  const nodeMap = new Map<string, string>();
  for (const symbol of symbols) {
    const nodeId = sanitizeNodeId(symbol.id);
    const shape = getNodeShape(symbol.kind);
    const label = escapeMermaidText(symbol.name);

    // Check if node is highlighted due to findings
    const isHighlighted = highlightFindings.some((fId) =>
      graphData.findings?.some(
        (f) =>
          f.id === fId &&
          f.affectedSymbols?.includes(symbol.id)
      )
    );

    // Apply styling for highlighted nodes
    if (isHighlighted) {
      mermaid += `    ${nodeId}${shape.replace("%s", `"${label}"`)}:::highlighted\n`;
    } else if (symbol.exported) {
      mermaid += `    ${nodeId}${shape.replace("%s", `"${label}"`)}:::exported\n`;
    } else {
      mermaid += `    ${nodeId}${shape.replace("%s", `"${label}"`)}\n`;
    }

    nodeMap.set(symbol.id, nodeId);
  }

  // Add entrypoints
  for (const entry of graphData.entrypoints.slice(0, 10)) {
    const nodeId = sanitizeNodeId(entry.id);
    const label = escapeMermaidText(entry.route || entry.path);
    mermaid += `    ${nodeId}>"${label}"]:::entrypoint\n`;

    // Connect entrypoint to symbol if available
    if (entry.symbolId && nodeMap.has(entry.symbolId)) {
      const targetId = nodeMap.get(entry.symbolId)!;
      mermaid += `    ${nodeId} --> ${targetId}\n`;
    }
  }

  mermaid += `  end\n`;

  // Generate edges (relations)
  for (const relation of relations) {
    const fromId = nodeMap.get(relation.from) || sanitizeNodeId(relation.from);
    const toId = nodeMap.get(relation.to) || sanitizeNodeId(relation.to);
    const edgeStyle = getEdgeStyle(relation.kind);

    // Skip if both nodes don't exist in our limited set
    if (!nodeMap.has(relation.from) && !nodeMap.has(relation.to)) {
      continue;
    }

    // Add confidence label if high
    if (relation.confidence >= 0.8) {
      mermaid += `    ${fromId} ${edgeStyle}|"${Math.round(relation.confidence * 100)}%"| ${toId}\n`;
    } else {
      mermaid += `    ${fromId} ${edgeStyle} ${toId}\n`;
    }
  }

  // Add class definitions for styling
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

  // Group relations by file/module
  const fileRelations = new Map<string, Set<string>>();

  for (const relation of graphData.relations) {
    // Extract file paths from symbol IDs (simplified)
    const fromFile = relation.from.split(":")[0] || "unknown";
    const toFile = relation.to.split(":")[0] || "unknown";

    if (!fileRelations.has(fromFile)) {
      fileRelations.set(fromFile, new Set());
    }
    fileRelations.get(fromFile)!.add(toFile);
  }

  // Limit files
  const files = Array.from(fileRelations.keys()).slice(0, maxNodes);

  let mermaid = `flowchart LR\n`;
  mermaid += `  subgraph Dependencies["Module Dependencies"]\n`;

  // Create file nodes
  for (const file of files) {
    const nodeId = sanitizeNodeId(file);
    const label = escapeMermaidText(file.replace(/^.*[\\/]/, "")); // Just filename
    mermaid += `    ${nodeId}["${label}"]\n`;
  }

  mermaid += `  end\n`;

  // Create edges
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
  // Filter only call relations
  const callRelations = graphData.relations.filter((r) => r.kind === "calls");
  const maxNodes = config.maxNodes || 20;

  // Find most-called functions
  const callCounts = new Map<string, number>();
  for (const rel of callRelations) {
    callCounts.set(rel.to, (callCounts.get(rel.to) || 0) + 1);
  }

  // Get top called functions
  const topCalled = Array.from(callCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxNodes)
    .map(([id]) => id);

  let mermaid = `flowchart TD\n`;
  mermaid += `  subgraph CallGraph["Call Graph"]\n`;

  // Create nodes for top functions
  for (const symbolId of topCalled) {
    const symbol = graphData.symbols.find((s) => s.id === symbolId);
    const nodeId = sanitizeNodeId(symbolId);
    const label = symbol ? escapeMermaidText(symbol.name) : symbolId;
    const callCount = callCounts.get(symbolId) || 0;

    mermaid += `    ${nodeId}["${label}<br/><small>${callCount} calls</small>"]\n`;
  }

  mermaid += `  end\n`;

  // Add edges for calls between top functions
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
  // Find call chain from entrypoint
  const startSymbolId = entrypoint.symbolId;
  if (!startSymbolId) {
    return `sequenceDiagram\n  note over Client: No symbol mapping for entrypoint`;
  }

  let mermaid = `sequenceDiagram\n`;
  mermaid += `  participant Client\n`;

  // Find symbols involved in call chain
  const visited = new Set<string>();
  const toVisit = [startSymbolId];
  const participants: string[] = [];

  // BFS to find call chain (limited depth)
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

      // Find outgoing calls
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

  // Start from Client
  if (participants.length > 0) {
    mermaid += `  Client->>+${participants[0]}: Request\n`;
  }

  // Add message arrows
  for (let i = 0; i < participants.length - 1; i++) {
    mermaid += `  ${participants[i]}->>+${participants[i + 1]}: Call\n`;
  }

  // Return path
  for (let i = participants.length - 1; i >= 0; i--) {
    mermaid += `  ${participants[i]}-->>-Client: Response\n`;
  }

  return mermaid;
}

/**
 * Get embedded Mermaid JavaScript for rendering
 */
export function getMermaidJavaScript(): string {
  return `
// Embedded Mermaid initialization (minimal inline renderer)
(function() {
  // Simple Mermaid-like diagram parser and SVG generator
  // This is a minimal implementation for basic flowchart rendering

  const diagramCache = new Map();

  function parseFlowchart(mermaidCode) {
    const lines = mermaidCode.split('\\n').filter(l => l.trim());
    const nodes = [];
    const edges = [];
    const classDefs = {};

    for (const line of lines) {
      const trimmed = line.trim();

      // Parse class definitions
      if (trimmed.startsWith('classDef')) {
        const match = trimmed.match(/classDef\\s+(\\w+)\\s+(.+)/);
        if (match) {
          classDefs[match[1]] = match[2];
        }
        continue;
      }

      // Parse subgraph declarations
      if (trimmed.startsWith('subgraph')) continue;
      if (trimmed === 'end') continue;

      // Parse edges
      const edgeMatch = trimmed.match(/(\\w+)\\s*(-[-.>]+)\\s*(?:\\|"([^"]*)\"\\|)?\\s*(\\w+)/);
      if (edgeMatch) {
        edges.push({
          from: edgeMatch[1],
          style: edgeMatch[2],
          label: edgeMatch[3] || '',
          to: edgeMatch[4]
        });
        continue;
      }

      // Parse nodes (simplified)
      const nodeMatch = trimmed.match(/(\\w+)(?:\\(([^)]*)\\)|\\[([^\\[]*)\\]|\\{([^}]*)\\}|>"([^"]*)"<)?(?:\\[([^\\[]*)\\])?(?::::(\\w+))?/);
      if (nodeMatch && !trimmed.includes('-->')) {
        nodes.push({
          id: nodeMatch[1],
          label: nodeMatch[2] || nodeMatch[3] || nodeMatch[4] || nodeMatch[5] || nodeMatch[6] || nodeMatch[1],
          class: nodeMatch[7] || ''
        });
      }
    }

    return { nodes, edges, classDefs };
  }

  function renderFlowchart(parsed, container) {
    const width = container.offsetWidth || 800;
    const height = 400;

    // Create SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', height.toString());
    svg.style.overflow = 'visible';

    // Render nodes (simplified layout)
    const nodePositions = {};
    const nodeWidth = 120;
    const nodeHeight = 40;
    const cols = Math.ceil(Math.sqrt(parsed.nodes.length));
    const spacingX = 150;
    const spacingY = 80;

    parsed.nodes.forEach((node, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      nodePositions[node.id] = {
        x: col * spacingX + 50,
        y: row * spacingY + 50
      };

      // Draw node rectangle
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', (nodePositions[node.id].x - nodeWidth/2).toString());
      rect.setAttribute('y', (nodePositions[node.id].y - nodeHeight/2).toString());
      rect.setAttribute('width', nodeWidth.toString());
      rect.setAttribute('height', nodeHeight.toString());
      rect.setAttribute('rx', '5');
      rect.setAttribute('fill', getNodeColor(node.class, parsed.classDefs));
      rect.setAttribute('stroke', '#333');
      rect.setAttribute('class', 'mermaid-node');

      // Add label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', nodePositions[node.id].x.toString());
      text.setAttribute('y', nodePositions[node.id].y.toString());
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', 'white');
      text.setAttribute('font-size', '12');
      text.textContent = node.label.length > 15 ? node.label.slice(0, 15) + '...' : node.label;

      svg.appendChild(rect);
      svg.appendChild(text);
    });

    // Render edges
    parsed.edges.forEach(edge => {
      const from = nodePositions[edge.from];
      const to = nodePositions[edge.to];

      if (!from || !to) return;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', from.x.toString());
      line.setAttribute('y1', (from.y + nodeHeight/2).toString());
      line.setAttribute('x2', to.x.toString());
      line.setAttribute('y2', (to.y - nodeHeight/2).toString());
      line.setAttribute('stroke', '#666');
      line.setAttribute('stroke-width', '2');

      // Arrow marker
      const arrowId = 'arrow-' + edge.from + '-' + edge.to;
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', arrowId);
      marker.setAttribute('markerWidth', '10');
      marker.setAttribute('markerHeight', '10');
      marker.setAttribute('refX', '9');
      marker.setAttribute('refY', '3');
      marker.setAttribute('orient', 'auto');

      const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arrowPath.setAttribute('d', 'M0,0 L0,6 L9,3 z');
      arrowPath.setAttribute('fill', '#666');
      marker.appendChild(arrowPath);

      const defs = svg.querySelector('defs') || document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      defs.appendChild(marker);
      if (!svg.querySelector('defs')) svg.appendChild(defs);

      line.setAttribute('marker-end', 'url(#' + arrowId + ')');
      svg.appendChild(line);

      // Edge label
      if (edge.label) {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + nodeHeight/2 + to.y - nodeHeight/2) / 2;
        label.setAttribute('x', midX.toString());
        label.setAttribute('y', (midY - 5).toString());
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', '#888');
        label.setAttribute('font-size', '10');
        label.textContent = edge.label;
        svg.appendChild(label);
      }
    });

    container.innerHTML = '';
    container.appendChild(svg);
  }

  function getNodeColor(className, classDefs) {
    const defaults = {
      highlighted: '#dc3545',
      exported: '#667eea',
      entrypoint: '#fd7e14'
    };
    return defaults[className] || '#f0f0f0';
  }

  // Initialize all mermaid elements
  document.querySelectorAll('.mermaid').forEach(el => {
    const code = el.textContent.trim();
    if (diagramCache.has(code)) {
      el.innerHTML = diagramCache.get(code);
      return;
    }

    try {
      const parsed = parseFlowchart(code);
      renderFlowchart(parsed, el);
      diagramCache.set(code, el.innerHTML);
    } catch (e) {
      console.warn('Mermaid parse error:', e);
      el.innerHTML = '<pre style="color:#888;font-size:0.8em">' + code + '</pre>';
    }
  });
})();
`;
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
  // Update button states
  document.querySelectorAll('.graph-controls .filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');

  // Show/hide content
  document.querySelectorAll('.graph-canvas .tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById('graph-' + tabId).classList.add('active');
}
</script>
`;
}