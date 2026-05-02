/**
 * Report Section Generators
 * HTML generation for individual report sections
 */

import {
  FindingsArtifact,
  RiskRegisterArtifact,
  TestSeedsArtifact,
  ReleaseReadinessArtifact,
  Severity,
  TestLevel,
} from "../types/artifacts.js";
import { NormalizedRepoGraph, SymbolNode, GraphRelation } from "../types/graph.js";
import { GraphData, generateMermaidFlowchart } from "./graph-viewer.js";

const VERSION = "0.2.0";

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Loaded artifacts for report generation
 */
export interface LoadedArtifacts {
  findings?: FindingsArtifact;
  riskRegister?: RiskRegisterArtifact;
  testSeeds?: TestSeedsArtifact;
  readiness?: ReleaseReadinessArtifact;
  graph?: NormalizedRepoGraph;
}

/**
 * Generate header section HTML
 */
export function generateHeader(
  artifacts: LoadedArtifacts,
  title?: string
): string {
  const findings = artifacts.findings;
  const headerTitle = title || "code-to-gate Analysis Report";

  const generatedAt = findings?.generated_at || new Date().toISOString();
  const runId = findings?.run_id || "unknown";
  const repoRoot = findings?.repo?.root || "unknown";
  const toolVersion = findings?.tool?.version || VERSION;

  return `
<div class="header">
  <div class="header-info">
    <h1>${escapeHtml(headerTitle)}</h1>
    <div class="header-meta">
      <div>Generated: ${escapeHtml(generatedAt)}</div>
      <div>Run ID: ${escapeHtml(runId)}</div>
      <div>Repository: ${escapeHtml(repoRoot)}</div>
      <div>Tool: code-to-gate v${escapeHtml(toolVersion)}</div>
    </div>
  </div>
  <div class="header-controls">
    <button class="theme-toggle" onclick="toggleTheme()">
      <span id="theme-label">Dark Mode</span>
    </button>
  </div>
</div>
`;
}

/**
 * Generate tabs navigation
 */
export function generateTabsNav(config: {
  showTabs?: boolean;
  showRiskRegister?: boolean;
  showTestSeeds?: boolean;
  showReadiness?: boolean;
  showGraph?: boolean;
}): string {
  if (!config.showTabs) return "";

  const tabs = [
    { id: "findings", label: "Findings", active: true },
    { id: "graph", label: "Graph", active: false },
    { id: "risks", label: "Risks", active: false },
    { id: "tests", label: "Test Seeds", active: false },
    { id: "readiness", label: "Readiness", active: false },
  ];

  let nav = '<div class="tabs">';
  for (const tab of tabs) {
    if (
      (tab.id === "risks" && !config.showRiskRegister) ||
      (tab.id === "tests" && !config.showTestSeeds) ||
      (tab.id === "readiness" && !config.showReadiness) ||
      (tab.id === "graph" && !config.showGraph)
    ) {
      continue;
    }

    nav += `
  <button class="tab-btn ${tab.active ? "active" : ""}" onclick="showTab('${tab.id}')">
    ${escapeHtml(tab.label)}
  </button>
`;
  }
  nav += "</div>";

  return nav;
}

/**
 * Generate risk register section HTML
 */
export function generateRiskRegisterSection(
  riskRegister?: RiskRegisterArtifact
): string {
  if (!riskRegister) {
    return `
<div id="risks-tab" class="tab-content">
  <div class="empty-state">
    <span class="empty-state-icon">-</span>
    <p>No risk register available</p>
  </div>
</div>
`;
  }

  const sortedRisks = [...riskRegister.risks].sort((a, b) => {
    const severityOrder: Record<Severity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  let html = `
<div id="risks-tab" class="tab-content">
  <div class="section">
    <div class="section-title">
      <h2>Risk Register</h2>
      <span class="section-count">${riskRegister.risks.length} risks</span>
    </div>
`;

  if (sortedRisks.length === 0) {
    html += `
    <div class="empty-state">
      <span class="empty-state-icon">&#10003;</span>
      <p>No risks identified</p>
    </div>
`;
  } else {
    for (const risk of sortedRisks) {
      html += `
    <div class="risk" data-risk-id="${escapeHtml(risk.id)}">
      <div class="risk-header">
        <span class="badge badge-${risk.severity}">${escapeHtml(risk.severity)}</span>
        <span class="finding-id">${escapeHtml(risk.id)}</span>
        <strong>${escapeHtml(risk.title)}</strong>
      </div>
      <div class="risk-body">
        <div class="finding-meta">
          <span class="finding-meta-label">Likelihood:</span>
          <span>${escapeHtml(risk.likelihood)}</span>
          <span class="finding-meta-label">Confidence:</span>
          <span>${risk.confidence.toFixed(2)}</span>
          <span class="finding-meta-label">Source Findings:</span>
          <span>${risk.sourceFindingIds.map((id) => escapeHtml(id)).join(", ") || "None"}</span>
        </div>
        ${risk.narrative ? `
        <div class="risk-narrative">
          <p>${escapeHtml(risk.narrative)}</p>
        </div>
        ` : ""}
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

  html += "</div></div>";
  return html;
}

/**
 * Generate test seeds section HTML
 */
export function generateTestSeedsSection(testSeeds?: TestSeedsArtifact): string {
  if (!testSeeds) {
    return `
<div id="tests-tab" class="tab-content">
  <div class="empty-state">
    <span class="empty-state-icon">-</span>
    <p>No test seeds available</p>
  </div>
</div>
`;
  }

  const sortedSeeds = [...testSeeds.seeds].sort((a, b) => {
    const levelOrder: Record<TestLevel, number> = { e2e: 0, integration: 1, unit: 2, manual: 3, exploratory: 4 };
    return levelOrder[a.suggestedLevel] - levelOrder[b.suggestedLevel];
  });

  let html = `
<div id="tests-tab" class="tab-content">
  <div class="section">
    <div class="section-title">
      <h2>Test Seeds</h2>
      <span class="section-count">${testSeeds.seeds.length} seeds</span>
    </div>
`;

  if (sortedSeeds.length === 0) {
    html += `
    <div class="empty-state">
      <span class="empty-state-icon">-</span>
      <p>No test seeds generated</p>
    </div>
`;
  } else {
    for (const seed of sortedSeeds) {
      const levelBadge = seed.suggestedLevel === "e2e"
        ? "badge-critical"
        : seed.suggestedLevel === "integration"
          ? "badge-medium"
          : "badge-low";

      html += `
    <div class="test-seed">
      <div class="test-seed-header">
        <span class="badge ${levelBadge}">${escapeHtml(seed.suggestedLevel)}</span>
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
  }

  html += "</div></div>";
  return html;
}

/**
 * Generate release readiness section HTML
 */
export function generateReadinessSection(
  readiness?: ReleaseReadinessArtifact
): string {
  if (!readiness) {
    return `
<div id="readiness-tab" class="tab-content">
  <div class="empty-state">
    <span class="empty-state-icon">-</span>
    <p>No readiness assessment available</p>
  </div>
</div>
`;
  }

  const statusColor =
    readiness.status === "passed"
      ? "#28a745"
      : readiness.status === "blocked"
        ? "#dc3545"
        : "#ffc107";

  let html = `
<div id="readiness-tab" class="tab-content">
  <div class="section">
    <div class="section-title">
      <h2>Release Readiness</h2>
      <span class="badge" style="background:${statusColor}">${escapeHtml(readiness.status)}</span>
    </div>
`;

  html += `
    <div class="dashboard">
      <div class="card">
        <div class="card-title">Critical Findings</div>
        <div class="card-value">${readiness.metrics.criticalFindings}</div>
      </div>
      <div class="card">
        <div class="card-title">High Findings</div>
        <div class="card-value">${readiness.metrics.highFindings}</div>
      </div>
      <div class="card">
        <div class="card-title">Medium Findings</div>
        <div class="card-value">${readiness.metrics.mediumFindings}</div>
      </div>
      <div class="card">
        <div class="card-title">Low Findings</div>
        <div class="card-value">${readiness.metrics.lowFindings}</div>
      </div>
      <div class="card">
        <div class="card-title">Risk Count</div>
        <div class="card-value">${readiness.metrics.riskCount}</div>
      </div>
      <div class="card">
        <div class="card-title">Test Seeds</div>
        <div class="card-value">${readiness.metrics.testSeedCount}</div>
      </div>
    </div>
`;

  if (readiness.summary) {
    html += `
    <div class="risk-narrative">
      <p>${escapeHtml(readiness.summary)}</p>
    </div>
`;
  }

  if (readiness.blockers.length > 0) {
    html += `
    <div class="risk-actions" style="background:rgba(220,53,69,0.1);border-left-color:#dc3545">
      <strong>Blockers:</strong>
      <ul>
        ${readiness.blockers.map((b) => `<li>${escapeHtml(b)}</li>`).join("\n")}
      </ul>
    </div>
`;
  }

  if (readiness.warnings.length > 0) {
    html += `
    <div class="risk-actions" style="background:rgba(255,193,7,0.1);border-left-color:#ffc107">
      <strong>Warnings:</strong>
      <ul>
        ${readiness.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("\n")}
      </ul>
    </div>
`;
  }

  if (readiness.passedChecks.length > 0) {
    html += `
    <div class="risk-actions" style="background:rgba(40,167,69,0.1);border-left-color:#28a745">
      <strong>Passed Checks:</strong>
      <ul>
        ${readiness.passedChecks.map((c) => `<li>${escapeHtml(c)}</li>`).join("\n")}
      </ul>
    </div>
`;
  }

  html += "</div></div>";
  return html;
}

/**
 * Generate graph section HTML
 */
export function generateGraphSection(
  graph?: NormalizedRepoGraph,
  findings?: FindingsArtifact
): string {
  if (!graph) {
    return `
<div id="graph-tab" class="tab-content">
  <div class="empty-state">
    <span class="empty-state-icon">-</span>
    <p>No graph data available</p>
  </div>
</div>
`;
  }

  // Build graph data
  const graphData: GraphData = {
    symbols: (graph.symbols as SymbolNode[]) || [],
    relations: (graph.relations as GraphRelation[]) || [],
    entrypoints: graph.entrypoints || [],
    findings: findings?.findings,
  };

  const mermaidDiagram = generateMermaidFlowchart(graphData, { maxNodes: 50 });

  let html = `
<div id="graph-tab" class="tab-content">
  <div class="graph-container">
    <div class="graph-title">
      <h2>Code Graph</h2>
      <span class="section-count">${graph.symbols?.length || 0} symbols, ${graph.relations?.length || 0} relations</span>
    </div>
    <div class="graph-canvas">
      <pre class="mermaid">${escapeHtml(mermaidDiagram)}</pre>
    </div>
  </div>
`;

  // Add file statistics if available
  if (graph.files && graph.files.length > 0) {
    const languageCounts = new Map<string, number>();
    for (const file of graph.files) {
      languageCounts.set(
        file.language,
        (languageCounts.get(file.language) || 0) + 1
      );
    }

    html += `
  <div class="section">
    <h3>Files Summary</h3>
    <div class="dashboard">
      <div class="card">
        <div class="card-title">Total Files</div>
        <div class="card-value">${graph.files.length}</div>
      </div>
`;

    const langEntries = Array.from(languageCounts.entries());
    for (const [lang, count] of langEntries) {
      html += `
      <div class="card">
        <div class="card-title">${escapeHtml(lang)}</div>
        <div class="card-value">${count}</div>
      </div>
`;
    }

    html += "</div></div>";
  }

  html += "</div>";
  return html;
}

/**
 * Generate footer HTML
 */
export function generateFooter(): string {
  return `
<div class="footer">
  <p>Generated by code-to-gate v${VERSION}</p>
  <p>Self-contained HTML report - no external dependencies</p>
</div>
`;
}