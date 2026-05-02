/**
 * Mermaid CSS Constants for Web Viewer
 * CSS overrides for Mermaid diagrams in dark mode
 */

export const MERMAID_CSS = `
/* Mermaid Theme Overrides for Dark Mode */
[data-theme="dark"] .mermaid {
  --mermaid-node-bg: #16213e;
  --mermaid-node-border: #3a3a5a;
  --mermaid-edge: #90cdf4;
  --mermaid-text: #e0e0e0;
}

[data-theme="dark"] .mermaid .node rect,
[data-theme="dark"] .mermaid .node circle,
[data-theme="dark"] .mermaid .node ellipse,
[data-theme="dark"] .mermaid .node polygon,
[data-theme="dark"] .mermaid .node path {
  fill: var(--mermaid-node-bg);
  stroke: var(--mermaid-node-border);
}

[data-theme="dark"] .mermaid .edgePath .path {
  stroke: var(--mermaid-edge);
}

[data-theme="dark"] .mermaid .edgeLabel {
  background-color: var(--mermaid-node-bg);
  color: var(--mermaid-text);
}

[data-theme="dark"] .mermaid .label {
  color: var(--mermaid-text);
}
`;