/**
 * HTML Reporter - generates self-contained static HTML report
 *
 * Generates a single HTML file with embedded CSS and JavaScript
 * for viewing analysis results without external dependencies.
 */

import {
  FindingsArtifact,
  RiskRegisterArtifact,
  TestSeedsArtifact,
  Finding,
  RiskSeed,
  TestSeed,
  Severity,
} from "../types/artifacts.js";
import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

const VERSION = "0.1.0";

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Severity color mapping for CSS
 */
function severityColor(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "#dc3545"; // Red
    case "high":
      return "#fd7e14"; // Orange
    case "medium":
      return "#ffc107"; // Yellow
    case "low":
      return "#17a2b8"; // Blue
    default:
      return "#6c757d"; // Gray
  }
}

/**
 * Severity badge class
 */
function severityBadgeClass(severity: Severity): string {
  return `badge badge-${severity}`;
}

/**
 * Count findings by severity
 */
function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const finding of findings) {
    counts[finding.severity]++;
  }
  return counts;
}

/**
 * Get CSS styles for the report
 */
function getStyles(): string {
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

/**
 * Generate dashboard section
 */
function generateDashboard(
  findings: FindingsArtifact,
  riskRegister?: RiskRegisterArtifact,
  testSeeds?: TestSeedsArtifact
): string {
  const counts = countBySeverity(findings.findings);
  const total = findings.findings.length;
  const risksCount = riskRegister?.risks.length || 0;
  const seedsCount = testSeeds?.seeds.length || 0;

  // Calculate percentages for chart
  const criticalPct = total > 0 ? (counts.critical / total) * 100 : 0;
  const highPct = total > 0 ? (counts.high / total) * 100 : 0;
  const mediumPct = total > 0 ? (counts.medium / total) * 100 : 0;
  const lowPct = total > 0 ? (counts.low / total) * 100 : 0;

  return `
    <div class="dashboard">
      <div class="card card-critical">
        <div class="card-title">Critical</div>
        <div class="card-value">${counts.critical}</div>
      </div>
      <div class="card card-high">
        <div class="card-title">High</div>
        <div class="card-value">${counts.high}</div>
      </div>
      <div class="card card-medium">
        <div class="card-title">Medium</div>
        <div class="card-value">${counts.medium}</div>
      </div>
      <div class="card card-low">
        <div class="card-title">Low</div>
        <div class="card-value">${counts.low}</div>
      </div>
      <div class="card">
        <div class="card-title">Total Findings</div>
        <div class="card-value">${total}</div>
      </div>
      <div class="card">
        <div class="card-title">Risks</div>
        <div class="card-value">${risksCount}</div>
      </div>
      <div class="card">
        <div class="card-title">Test Seeds</div>
        <div class="card-value">${seedsCount}</div>
      </div>
    </div>

    <div class="severity-chart">
      <h3>Severity Distribution</h3>
      <div class="chart-bars">
        <div class="chart-bar chart-bar-critical" style="width: ${criticalPct}%" title="Critical: ${counts.critical}"></div>
        <div class="chart-bar chart-bar-high" style="width: ${highPct}%" title="High: ${counts.high}"></div>
        <div class="chart-bar chart-bar-medium" style="width: ${mediumPct}%" title="Medium: ${counts.medium}"></div>
        <div class="chart-bar chart-bar-low" style="width: ${lowPct}%" title="Low: ${counts.low}"></div>
      </div>
      <div class="chart-labels">
        <span>Critical (${counts.critical})</span>
        <span>High (${counts.high})</span>
        <span>Medium (${counts.medium})</span>
        <span>Low (${counts.low})</span>
      </div>
    </div>
  `;
}

/**
 * Generate code snippet with line highlighting
 */
function generateCodeSnippet(
  filePath: string,
  startLine?: number,
  endLine?: number,
  repoRoot?: string
): string {
  if (!startLine) {
    return `<div class="evidence-header">${filePath}</div>`;
  }

  // Try to read the file
  let fileContent: string | null = null;
  if (repoRoot) {
    try {
      const fullPath = path.join(repoRoot, filePath);
      fileContent = readFileSync(fullPath, "utf8");
    } catch {
      // File not readable, just show placeholder
    }
  }

  if (!fileContent) {
    return `
      <div class="evidence-header">${filePath}:${startLine}${endLine ? `-${endLine}` : ""}</div>
      <div class="code-line"><span class="line-number">${startLine}</span>// Code not available</div>
    `;
  }

  const lines = fileContent.split("\n");
  const contextStart = Math.max(1, startLine - 2);
  const contextEnd = Math.min(lines.length, (endLine || startLine) + 2);

  let snippet = `<div class="evidence-header">${filePath}:${startLine}${endLine ? `-${endLine}` : ""}</div>`;

  for (let i = contextStart; i <= contextEnd; i++) {
    const isHighlighted = i >= startLine && i <= (endLine || startLine);
    const lineContent = lines[i - 1] || "";
    // Escape HTML
    const escaped = lineContent
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    snippet += `<div class="code-line${isHighlighted ? " highlighted" : ""}"><span class="line-number">${i}</span>${escaped}</div>`;
  }

  return snippet;
}

/**
 * Generate findings section with collapsible severity groups
 */
function generateFindingsSection(
  findings: FindingsArtifact,
  repoRoot?: string
): string {
  const severities: Severity[] = ["critical", "high", "medium", "low"];

  let section = `
    <div class="section">
      <h2>Findings</h2>
  `;

  for (const severity of severities) {
    const severityFindings = findings.findings.filter((f) => f.severity === severity);
    if (severityFindings.length === 0) continue;

    section += `
      <div class="section-header" onclick="toggleSection('${severity}-findings')">
        <span><span class="badge badge-${severity}">${severity}</span> ${severityFindings.length} findings</span>
        <span class="collapsible-icon" id="${severity}-findings-icon">&#9662;</span>
      </div>
      <div class="section-content active" id="${severity}-findings">
    `;

    for (const finding of severityFindings) {
      section += `
        <div class="finding">
          <div class="finding-header">
            <span class="badge badge-${finding.severity}">${finding.severity}</span>
            <span class="finding-id">${escapeHtml(finding.id)}</span>
            <span class="finding-title">${escapeHtml(finding.title)}</span>
          </div>
          <div class="finding-body">
            <div class="finding-meta">
              <span class="finding-meta-label">Rule:</span>
              <span>${escapeHtml(finding.ruleId)}</span>
              <span class="finding-meta-label">Category:</span>
              <span>${escapeHtml(finding.category)}</span>
              <span class="finding-meta-label">Confidence:</span>
              <span>${finding.confidence.toFixed(2)}</span>
            </div>
            <p>${escapeHtml(finding.summary)}</p>
            ${finding.evidence.length > 0 ? `
              <div class="evidence">
                ${finding.evidence.map((e) => generateCodeSnippet(e.path, e.startLine, e.endLine, repoRoot)).join("\n")}
              </div>
            ` : ""}
          </div>
        </div>
      `;
    }

    section += `</div>`;
  }

  section += `</div>`;
  return section;
}

/**
 * Generate risk register section
 */
function generateRiskRegisterSection(
  riskRegister: RiskRegisterArtifact
): string {
  let section = `
    <div class="section">
      <h2>Risk Register</h2>
  `;

  if (riskRegister.risks.length === 0) {
    section += `<p>No risks identified.</p>`;
  } else {
    for (const risk of riskRegister.risks) {
      section += `
        <div class="risk">
          <div class="risk-header">
            <span class="badge badge-${risk.severity}">${risk.severity}</span>
            <span class="finding-id">${escapeHtml(risk.id)}</span>
            <strong>${escapeHtml(risk.title)}</strong>
          </div>
          <div class="risk-body">
            <div class="finding-meta">
              <span class="finding-meta-label">Likelihood:</span>
              <span>${risk.likelihood}</span>
              <span class="finding-meta-label">Confidence:</span>
              <span>${risk.confidence.toFixed(2)}</span>
              <span class="finding-meta-label">Source Findings:</span>
              <span>${escapeHtml(risk.sourceFindingIds.join(", "))}</span>
            </div>
            ${risk.narrative ? `<p>${escapeHtml(risk.narrative)}</p>` : ""}
            <div class="risk-impact">
              <strong>Impact:</strong>
              <ul>
                ${risk.impact.map((i) => `<li>${escapeHtml(i)}</li>`).join("\n")}
              </ul>
            </div>
            <div class="risk-actions">
              <strong>Recommended Actions:</strong>
              <ul>
                ${risk.recommendedActions.map((a) => `<li>${escapeHtml(a)}</li>`).join("\n")}
              </ul>
            </div>
          </div>
        </div>
      `;
    }
  }

  section += `</div>`;
  return section;
}

/**
 * Generate test seeds section
 */
function generateTestSeedsSection(
  testSeeds?: TestSeedsArtifact
): string {
  if (!testSeeds || testSeeds.seeds.length === 0) {
    return `
      <div class="section">
        <h2>Test Seeds</h2>
        <p>No test seeds generated.</p>
      </div>
    `;
  }

  let section = `
    <div class="section">
      <h2>Test Seeds</h2>
  `;

  for (const seed of testSeeds.seeds) {
    const priorityBadge = seed.priority === "high"
      ? "badge-critical"
      : seed.priority === "medium"
        ? "badge-medium"
        : "badge-low";

    section += `
      <div class="test-seed">
        <div class="test-seed-header">
          <span class="badge ${priorityBadge}">${seed.priority}</span>
          <span class="badge">${escapeHtml(seed.category)}</span>
          <strong>${escapeHtml(seed.title)}</strong>
        </div>
        <div class="test-seed-body">
          <p>${escapeHtml(seed.description)}</p>
          <div class="finding-meta">
            <span class="finding-meta-label">Target:</span>
            <span>${escapeHtml(seed.target)}</span>
            <span class="finding-meta-label">Expected:</span>
            <span>${escapeHtml(seed.expectedOutcome)}</span>
          </div>
        </div>
      </div>
    `;
  }

  section += `</div>`;
  return section;
}

/**
 * Generate JavaScript for collapsible sections
 */
function getJavaScript(): string {
  return `
    function toggleSection(id) {
      const content = document.getElementById(id);
      const icon = document.getElementById(id + '-icon');
      if (content) {
        content.classList.toggle('active');
      }
      if (icon) {
        icon.classList.toggle('open');
      }
    }
  `;
}

/**
 * Generate complete HTML report
 */
export function generateHtmlReport(
  findings: FindingsArtifact,
  riskRegister?: RiskRegisterArtifact,
  testSeeds?: TestSeedsArtifact,
  repoRoot?: string
): string {
  const header = `
    <div class="header">
      <h1>code-to-gate Analysis Report</h1>
      <div class="header-meta">
        <div>Generated: ${findings.generated_at}</div>
        <div>Run ID: ${findings.run_id}</div>
        <div>Repository: ${findings.repo.root}</div>
        <div>Tool: code-to-gate v${findings.tool.version}</div>
      </div>
    </div>
  `;

  const dashboard = generateDashboard(findings, riskRegister, testSeeds);
  const findingsSection = generateFindingsSection(findings, repoRoot);
  const riskSection = riskRegister ? generateRiskRegisterSection(riskRegister) : "";
  const testSeedsSection = generateTestSeedsSection(testSeeds);

  const footer = `
    <div class="footer">
      <p>Generated by code-to-gate v${VERSION}</p>
      <p>Findings based on static analysis of the repository.</p>
    </div>
  `;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>code-to-gate Analysis Report - ${findings.run_id}</title>
  <style>
    ${getStyles()}
  </style>
</head>
<body>
  ${header}
  ${dashboard}
  ${findingsSection}
  ${riskSection}
  ${testSeedsSection}
  ${footer}
  <script>
    ${getJavaScript()}
  </script>
</body>
</html>
  `;
}

/**
 * Write HTML report to file
 */
export function writeHtmlReport(
  outDir: string,
  findings: FindingsArtifact,
  riskRegister?: RiskRegisterArtifact,
  testSeeds?: TestSeedsArtifact,
  repoRoot?: string,
  filename?: string
): string {
  const outputFilename = filename || "analysis-report.html";
  const filePath = path.join(outDir, outputFilename);
  const html = generateHtmlReport(findings, riskRegister, testSeeds, repoRoot);
  writeFileSync(filePath, html.trim(), "utf8");
  return filePath;
}