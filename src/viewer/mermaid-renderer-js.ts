/**
 * Embedded Mermaid JavaScript Renderer
 * Minimal inline SVG renderer for Mermaid flowchart syntax
 */

export function getMermaidRendererJavaScript(): string {
  return `
// Embedded Mermaid initialization (minimal inline renderer)
(function() {
  const diagramCache = new Map();

  function parseFlowchart(mermaidCode) {
    const lines = mermaidCode.split('\\n').filter(l => l.trim());
    const nodes = [];
    const edges = [];
    const classDefs = {};

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('classDef')) {
        const match = trimmed.match(/classDef\\s+(\\w+)\\s+(.+)/);
        if (match) {
          classDefs[match[1]] = match[2];
        }
        continue;
      }

      if (trimmed.startsWith('subgraph')) continue;
      if (trimmed === 'end') continue;

      const edgeMatch = trimmed.match(/(\\w+)\\s*(-[-.>]+)\\s*(?:\\|"([^"]*)"\\|)?\\s*(\\w+)/);
      if (edgeMatch) {
        edges.push({
          from: edgeMatch[1],
          style: edgeMatch[2],
          label: edgeMatch[3] || '',
          to: edgeMatch[4]
        });
        continue;
      }

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

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', height.toString());
    svg.style.overflow = 'visible';

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

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', (nodePositions[node.id].x - nodeWidth/2).toString());
      rect.setAttribute('y', (nodePositions[node.id].y - nodeHeight/2).toString());
      rect.setAttribute('width', nodeWidth.toString());
      rect.setAttribute('height', nodeHeight.toString());
      rect.setAttribute('rx', '5');
      rect.setAttribute('fill', getNodeColor(node.class, parsed.classDefs));
      rect.setAttribute('stroke', '#333');
      rect.setAttribute('class', 'mermaid-node');

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