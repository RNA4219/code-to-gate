/**
 * Base CSS Constants for Web Viewer
 * CSS template string for the main viewer styles
 */

export const BASE_CSS = `
/* Base CSS Variables */
:root {
  --color-critical: #dc3545;
  --color-high: #fd7e14;
  --color-medium: #ffc107;
  --color-low: #17a2b8;
  --color-bg: #f8f9fa;
  --color-text: #212529;
  --color-border: #dee2e6;
  --color-card-bg: #ffffff;
  --color-code-bg: #282c34;
  --color-code-text: #abb2bf;
  --color-header-bg: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --color-link: #667eea;
  --shadow-soft: 0 2px 4px rgba(0,0,0,0.1);
  --shadow-medium: 0 4px 8px rgba(0,0,0,0.15);
}

/* Dark Mode Variables */
[data-theme="dark"] {
  --color-bg: #1a1a2e;
  --color-text: #e0e0e0;
  --color-border: #3a3a5a;
  --color-card-bg: #16213e;
  --color-code-bg: #0f0f23;
  --color-code-text: #abb2bf;
  --color-header-bg: linear-gradient(135deg, #4a5568 0%, #2d3748 100%);
  --color-link: #90cdf4;
  --shadow-soft: 0 2px 4px rgba(0,0,0,0.3);
  --shadow-medium: 0 4px 8px rgba(0,0,0,0.4);
}

/* Reset and Base */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: var(--color-bg);
  color: var(--color-text);
  line-height: 1.6;
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
  transition: background-color 0.3s, color 0.3s;
}

h1, h2, h3, h4 {
  margin-bottom: 0.5em;
  color: var(--color-text);
}

a {
  color: var(--color-link);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

/* Header Section */
.header {
  background: var(--color-header-bg);
  color: white;
  padding: 30px;
  border-radius: 8px;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.header h1 {
  font-size: 2em;
  margin-bottom: 10px;
}

.header-meta {
  font-size: 0.9em;
  opacity: 0.9;
}

.header-controls {
  display: flex;
  gap: 10px;
}

/* Dark Mode Toggle */
.theme-toggle {
  background: rgba(255,255,255,0.2);
  border: none;
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9em;
  transition: background 0.2s;
}

.theme-toggle:hover {
  background: rgba(255,255,255,0.3);
}

/* Toolbar */
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
  padding: 15px;
  background: var(--color-card-bg);
  border-radius: 8px;
  box-shadow: var(--shadow-soft);
}

.toolbar-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

.toolbar-label {
  font-size: 0.85em;
  color: #6c757d;
  font-weight: 500;
}

.filter-btn {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85em;
  transition: all 0.2s;
}

.filter-btn:hover {
  background: var(--color-border);
}

.filter-btn.active {
  background: var(--color-link);
  color: white;
  border-color: var(--color-link);
}

.search-input {
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 0.9em;
  width: 200px;
  background: var(--color-bg);
  color: var(--color-text);
}

/* Dashboard Cards */
.dashboard {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 15px;
  margin-bottom: 30px;
}

.card {
  background: var(--color-card-bg);
  border-radius: 8px;
  padding: 20px;
  box-shadow: var(--shadow-soft);
  border-left: 4px solid var(--color-border);
  transition: transform 0.2s, box-shadow 0.2s;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-medium);
}

.card-critical { border-left-color: var(--color-critical); }
.card-high { border-left-color: var(--color-high); }
.card-medium { border-left-color: var(--color-medium); }
.card-low { border-left-color: var(--color-low); }

.card-title {
  font-size: 0.85em;
  color: #6c757d;
  margin-bottom: 5px;
}

.card-value {
  font-size: 2em;
  font-weight: 600;
  color: var(--color-text);
}

/* Severity Chart */
.severity-chart {
  background: var(--color-card-bg);
  border-radius: 8px;
  padding: 20px;
  box-shadow: var(--shadow-soft);
  margin-bottom: 30px;
}

.chart-bars {
  display: flex;
  height: 30px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--color-bg);
}

.chart-bar {
  transition: width 0.3s;
  min-width: 2px;
}

.chart-bar-critical { background: var(--color-critical); }
.chart-bar-high { background: var(--color-high); }
.chart-bar-medium { background: var(--color-medium); }
.chart-bar-low { background: var(--color-low); }

.chart-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
  font-size: 0.85em;
}

.chart-label {
  display: flex;
  align-items: center;
  gap: 5px;
}

.chart-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

/* Tabs Navigation */
.tabs {
  display: flex;
  border-bottom: 2px solid var(--color-border);
  margin-bottom: 20px;
}

.tab-btn {
  padding: 10px 20px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.95em;
  color: #6c757d;
  position: relative;
  transition: color 0.2s;
}

.tab-btn:hover {
  color: var(--color-text);
}

.tab-btn.active {
  color: var(--color-link);
}

.tab-btn.active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--color-link);
}

.tab-content {
  display: none;
}

.tab-content.active {
  display: block;
}

/* Section Containers */
.section {
  background: var(--color-card-bg);
  border-radius: 8px;
  padding: 20px;
  box-shadow: var(--shadow-soft);
  margin-bottom: 20px;
}

.section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.section-title h2 {
  margin: 0;
}

.section-count {
  font-size: 0.85em;
  color: #6c757d;
}

/* Severity Badge */
.badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 0.75em;
  font-weight: 600;
  text-transform: uppercase;
}

.badge-critical { background: var(--color-critical); color: white; }
.badge-high { background: var(--color-high); color: white; }
.badge-medium { background: var(--color-medium); color: #212529; }
.badge-low { background: var(--color-low); color: white; }

/* Collapsible Sections */
.collapsible {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  margin-bottom: 10px;
  overflow: hidden;
}

.collapsible-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  background: var(--color-bg);
  cursor: pointer;
  transition: background 0.2s;
}

.collapsible-header:hover {
  background: var(--color-border);
}

.collapsible-icon {
  transition: transform 0.2s;
  font-size: 1.2em;
}

.collapsible-icon.open {
  transform: rotate(180deg);
}

.collapsible-content {
  display: none;
  padding: 15px;
  border-top: 1px solid var(--color-border);
}

.collapsible-content.active {
  display: block;
}

/* Finding Cards */
.finding {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  margin-bottom: 15px;
  overflow: hidden;
  background: var(--color-card-bg);
}

.finding-header {
  display: flex;
  align-items: center;
  padding: 10px 15px;
  background: var(--color-bg);
  gap: 10px;
  flex-wrap: wrap;
}

.finding-id {
  font-size: 0.85em;
  color: #6c757d;
}

.finding-title {
  font-weight: 600;
  flex: 1;
}

.finding-body {
  padding: 15px;
}

.finding-meta {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 5px 15px;
  margin-bottom: 10px;
  font-size: 0.9em;
}

.finding-meta-label {
  color: #6c757d;
}

.finding-summary {
  margin-bottom: 10px;
}

/* Evidence Display */
.evidence {
  background: var(--color-code-bg);
  color: var(--color-code-text);
  padding: 15px;
  border-radius: 4px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.85em;
  overflow-x: auto;
  margin-top: 10px;
  position: relative;
}

.evidence-header {
  color: #61afef;
  margin-bottom: 8px;
  font-size: 0.85em;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.evidence-path {
  color: #e5c07b;
}

.evidence-expand {
  background: rgba(255,255,255,0.1);
  border: none;
  color: #61afef;
  padding: 4px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.8em;
}

.evidence-expand:hover {
  background: rgba(255,255,255,0.2);
}

.code-line {
  padding: 2px 0;
  white-space: pre;
}

.code-line.highlighted {
  background: rgba(255, 200, 0, 0.15);
  display: block;
  margin: 0 -15px;
  padding-left: 15px;
  padding-right: 15px;
}

.line-number {
  color: #636d83;
  min-width: 40px;
  display: inline-block;
  text-align: right;
  padding-right: 15px;
  user-select: none;
  border-right: 1px solid #3a3a5a;
  margin-right: 10px;
}

/* Risk Cards */
.risk {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  margin-bottom: 15px;
  overflow: hidden;
  background: var(--color-card-bg);
}

.risk-header {
  padding: 10px 15px;
  background: var(--color-bg);
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.risk-body {
  padding: 15px;
}

.risk-narrative {
  margin-bottom: 15px;
  padding: 10px;
  background: var(--color-bg);
  border-radius: 4px;
}

.risk-impact {
  margin-top: 10px;
}

.risk-impact li {
  margin-bottom: 5px;
}

.risk-actions {
  margin-top: 15px;
  padding: 10px;
  background: rgba(102, 126, 234, 0.1);
  border-radius: 4px;
  border-left: 3px solid var(--color-link);
}

/* Test Seed Cards */
.test-seed {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  margin-bottom: 15px;
  padding: 15px;
  background: var(--color-card-bg);
}

.test-seed-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.test-seed-body {
  font-size: 0.9em;
}

.test-seed-steps {
  background: var(--color-bg);
  padding: 10px;
  border-radius: 4px;
  margin-top: 10px;
}

/* Graph Container */
.graph-container {
  background: var(--color-card-bg);
  border-radius: 8px;
  padding: 20px;
  box-shadow: var(--shadow-soft);
  margin-bottom: 20px;
  overflow: hidden;
}

.graph-title {
  margin-bottom: 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.graph-controls {
  display: flex;
  gap: 10px;
}

.graph-canvas {
  overflow: auto;
  max-height: 600px;
}

/* Mermaid Styles (embedded) */
.mermaid {
  text-align: center;
}

.mermaid svg {
  max-width: 100%;
  height: auto;
}

/* Footer */
.footer {
  text-align: center;
  padding: 20px;
  color: #6c757d;
  font-size: 0.85em;
  border-top: 1px solid var(--color-border);
  margin-top: 30px;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 40px;
  color: #6c757d;
}

.empty-state-icon {
  font-size: 3em;
  margin-bottom: 10px;
}

/* Responsive Design */
@media (max-width: 768px) {
  body {
    padding: 10px;
  }

  .header {
    padding: 20px;
    flex-direction: column;
  }

  .header-controls {
    margin-top: 15px;
  }

  .dashboard {
    grid-template-columns: repeat(2, 1fr);
  }

  .toolbar {
    flex-direction: column;
  }

  .tabs {
    flex-wrap: wrap;
  }

  .tab-btn {
    flex: 1;
    text-align: center;
  }

  .finding-header {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 480px) {
  .dashboard {
    grid-template-columns: 1fr;
  }

  .card {
    padding: 15px;
  }

  .card-value {
    font-size: 1.5em;
  }
}

/* Print Styles */
@media print {
  body {
    background: white;
    color: black;
    max-width: none;
  }

  .header {
    background: #333;
    color: white;
    -webkit-print-color-adjust: exact;
  }

  .toolbar,
  .header-controls,
  .theme-toggle,
  .collapsible-icon {
    display: none;
  }

  .collapsible-content {
    display: block !important;
  }

  .card,
  .section,
  .finding,
  .risk {
    box-shadow: none;
    border: 1px solid #ccc;
  }
}

/* Animation Classes */
.fade-in {
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.slide-down {
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Highlight Animation */
.highlight-pulse {
  animation: highlightPulse 0.5s ease-out;
}

@keyframes highlightPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.4);
  }
  50% {
    box-shadow: 0 0 0 10px rgba(102, 126, 234, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(102, 126, 234, 0);
  }
}
`;