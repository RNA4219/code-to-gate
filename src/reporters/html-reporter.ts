/**
 * HTML Reporter - generates self-contained static HTML report
 *
 * Generates a single HTML file with embedded CSS and JavaScript
 * for viewing analysis results without external dependencies.
 */

import { VERSION } from "../cli/exit-codes.js";
import {
  FindingsArtifact,
  RiskRegisterArtifact,
  TestSeedsArtifact,
  Finding,
  type _RiskSeed,
  type _TestSeed,
  Severity,
} from "../types/artifacts.js";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { getHtmlStyles } from "./html-reporter-styles.js";

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
 * Severity color mapping for CSS (unused - kept for future use)
 */
function _severityColor(severity: Severity): string {
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
 * Severity badge class (unused - kept for future use)
 */
function _severityBadgeClass(severity: Severity): string {
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
  return getHtmlStyles();
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
    const levelBadge = seed.suggestedLevel === "e2e"
      ? "badge-critical"
      : seed.suggestedLevel === "integration"
        ? "badge-medium"
        : "badge-low";

    section += `
      <div class="test-seed">
        <div class="test-seed-header">
          <span class="badge ${levelBadge}">${seed.suggestedLevel}</span>
          <span class="badge">${escapeHtml(seed.intent)}</span>
          <strong>${escapeHtml(seed.title)}</strong>
        </div>
        <div class="test-seed-body">
          <p>${escapeHtml(seed.notes || "")}</p>
          <div class="finding-meta">
            <span class="finding-meta-label">Intent:</span>
            <span>${escapeHtml(seed.intent)}</span>
            <span class="finding-meta-label">Level:</span>
            <span>${escapeHtml(seed.suggestedLevel)}</span>
            ${seed.sourceRiskIds.length > 0 ? `
              <span class="finding-meta-label">Source Risks:</span>
              <span>${escapeHtml(seed.sourceRiskIds.join(", "))}</span>
            ` : ""}
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