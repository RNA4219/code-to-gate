/**
 * CSS styles for HTML reporter
 * Self-contained CSS with no external dependencies.
 */

/**
 * Get CSS styles for the HTML report
 */
export function getHtmlStyles(): string {
  return `
    :root {
      --color-critical: #dc3545;
      --color-high: #fd7e14;
      --color-medium: #ffc107;
      --color-low: #17a2b8;
      --color-bg: #f8f9fa;
      --color-text: #212529;
      --color-border: #dee2e6;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.6;
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }

    h1, h2, h3, h4 {
      margin-bottom: 0.5em;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 20px;
    }

    .header h1 {
      font-size: 2em;
      margin-bottom: 10px;
    }

    .header-meta {
      font-size: 0.9em;
      opacity: 0.9;
    }

    .dashboard {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }

    .card {
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      border-left: 4px solid var(--color-border);
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
    }

    .severity-chart {
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 30px;
    }

    .chart-bars {
      display: flex;
      height: 30px;
      border-radius: 4px;
      overflow: hidden;
    }

    .chart-bar {
      transition: width 0.3s;
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

    .section {
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      padding: 15px;
      background: var(--color-bg);
      border-radius: 4px;
      margin-bottom: 10px;
    }

    .section-header:hover {
      background: #e9ecef;
    }

    .section-content {
      display: none;
      padding: 15px;
    }

    .section-content.active {
      display: block;
    }

    .finding {
      border: 1px solid var(--color-border);
      border-radius: 6px;
      margin-bottom: 15px;
      overflow: hidden;
    }

    .finding-header {
      display: flex;
      align-items: center;
      padding: 10px 15px;
      background: var(--color-bg);
      gap: 10px;
    }

    .finding-id {
      font-size: 0.85em;
      color: #6c757d;
    }

    .finding-title {
      font-weight: 600;
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

    .evidence {
      background: #282c34;
      color: #abb2bf;
      padding: 15px;
      border-radius: 4px;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 0.85em;
      overflow-x: auto;
      margin-top: 10px;
    }

    .evidence-header {
      color: #61afef;
      margin-bottom: 5px;
      font-size: 0.8em;
    }

    .code-line {
      padding: 2px 0;
    }

    .code-line.highlighted {
      background: rgba(255, 255, 0, 0.15);
      display: block;
    }

    .line-number {
      color: #636d83;
      min-width: 40px;
      display: inline-block;
      text-align: right;
      padding-right: 10px;
      user-select: none;
    }

    .risk {
      border: 1px solid var(--color-border);
      border-radius: 6px;
      margin-bottom: 15px;
      overflow: hidden;
    }

    .risk-header {
      padding: 10px 15px;
      background: var(--color-bg);
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .risk-body {
      padding: 15px;
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
      background: #e7f3ff;
      border-radius: 4px;
    }

    .test-seed {
      border: 1px solid var(--color-border);
      border-radius: 6px;
      margin-bottom: 15px;
      padding: 15px;
    }

    .test-seed-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }

    .test-seed-body {
      font-size: 0.9em;
    }

    .footer {
      text-align: center;
      padding: 20px;
      color: #6c757d;
      font-size: 0.85em;
    }

    .collapsible-icon {
      transition: transform 0.2s;
    }

    .collapsible-icon.open {
      transform: rotate(180deg);
    }

    @media (max-width: 768px) {
      body {
        padding: 10px;
      }

      .dashboard {
        grid-template-columns: 1fr 1fr;
      }

      .header {
        padding: 20px;
      }
    }
  `;
}