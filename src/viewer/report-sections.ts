/**
 * Report Section Generators
 * HTML generation for individual report sections
 */

import {
  FindingsArtifact,
  EvidenceDagArtifact,
  EvidenceDagEdge,
  EvidenceDagNode,
  RiskRegisterArtifact,
  TestSeedsArtifact,
  ReleaseReadinessArtifact,
  Severity,
  TestLevel,
} from "../types/artifacts.js";
import { NormalizedRepoGraph, SymbolNode, GraphRelation } from "../types/graph.js";
import type { HistoricalSummaryReport } from "../historical/types.js";
import type { QEGCodeToGateEvidence } from "../qeg/qeg-types.js";
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
  historicalComparison?: HistoricalSummaryReport;
  qegEvidence?: QEGCodeToGateEvidence;
  evidenceDag?: EvidenceDagArtifact;
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
  showHistorical?: boolean;
  showQeg?: boolean;
}): string {
  if (!config.showTabs) return "";

  const tabs = [
    { id: "findings", label: "Findings", active: true },
    { id: "graph", label: "Graph", active: false },
    { id: "risks", label: "Risks", active: false },
    { id: "tests", label: "Test Seeds", active: false },
    { id: "readiness", label: "Readiness", active: false },
    { id: "qeg", label: "QEG", active: false },
    { id: "historical", label: "Historical", active: false },
  ];

  let nav = '<div class="tabs">';
  for (const tab of tabs) {
    if (
      (tab.id === "risks" && !config.showRiskRegister) ||
      (tab.id === "tests" && !config.showTestSeeds) ||
      (tab.id === "readiness" && !config.showReadiness) ||
      (tab.id === "graph" && !config.showGraph) ||
      (tab.id === "qeg" && !config.showQeg) ||
      (tab.id === "historical" && !config.showHistorical)
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

function renderKeyValueRecord(record: Record<string, number>): string {
  const entries = Object.entries(record);
  if (entries.length === 0) {
    return "<span>none</span>";
  }

  return `
    <ul>
      ${entries.map(([key, value]) => `<li>${escapeHtml(key)}: ${value}</li>`).join("\n")}
    </ul>
`;
}

function renderEvidenceDagNode(node: EvidenceDagNode, edges: EvidenceDagEdge[]): string {
  const connectedEdges = edges.filter((edge) => edge.source === node.id || edge.target === node.id);
  const metadata = node.metadata ? Object.entries(node.metadata) : [];

  return `
    <details class="risk-actions">
      <summary>
        <span class="badge">${escapeHtml(node.type)}</span>
        <strong>${escapeHtml(node.label)}</strong>
        <span class="finding-id">${escapeHtml(node.id)}</span>
      </summary>
      ${metadata.length > 0 ? `
      <div class="finding-meta">
        ${metadata.map(([key, value]) => `
          <span class="finding-meta-label">${escapeHtml(key)}:</span>
          <span>${escapeHtml(String(value))}</span>
        `).join("\n")}
      </div>
      ` : ""}
      ${connectedEdges.length > 0 ? `
      <div class="risk-impact">
        <strong>Connected edges:</strong>
        <ul>
          ${connectedEdges.map((edge) => `
            <li>${escapeHtml(edge.source)} -- ${escapeHtml(edge.type)} --&gt; ${escapeHtml(edge.target)}</li>
          `).join("\n")}
        </ul>
      </div>
      ` : ""}
    </details>
`;
}

export function generateQegSection(
  qegEvidence?: QEGCodeToGateEvidence,
  evidenceDag?: EvidenceDagArtifact
): string {
  if (!qegEvidence && !evidenceDag) {
    return `
<div id="qeg-tab" class="tab-content">
  <div class="empty-state">
    <span class="empty-state-icon">-</span>
    <p>No QEG evidence available</p>
  </div>
</div>
`;
  }

  const schemaOk = qegEvidence?.schema_compliance.filter((item) => item.status === "ok").length ?? 0;
  const schemaErrors = qegEvidence?.schema_compliance.filter((item) => item.status === "error").length ?? 0;
  const artifactHashes = qegEvidence?.artifact_hashes ?? [];
  const findingNodes = evidenceDag?.nodes.filter((node) => node.type === "finding") ?? [];
  const manualNodes = evidenceDag?.nodes.filter((node) => node.type === "manual-test") ?? [];
  const ciRunNodes = evidenceDag?.nodes.filter((node) => node.type === "ci-run") ?? [];
  const artifactNodes = evidenceDag?.nodes.filter((node) => node.type === "artifact") ?? [];

  return `
<div id="qeg-tab" class="tab-content">
  <div class="section">
    <div class="section-title">
      <h2>QEG Evidence</h2>
      <span class="section-count">${qegEvidence ? "qeg-code-to-gate.json" : "evidence-dag only"}</span>
    </div>
    <div class="dashboard">
      <div class="card"><div class="card-title">Readiness</div><div class="card-value">${escapeHtml(qegEvidence?.readiness_status ?? "unknown")}</div></div>
      <div class="card"><div class="card-title">Findings</div><div class="card-value">${qegEvidence?.findings_summary.total ?? evidenceDag?.summary.findings ?? 0}</div></div>
      <div class="card"><div class="card-title">Schema OK</div><div class="card-value">${schemaOk}</div></div>
      <div class="card"><div class="card-title">Schema Errors</div><div class="card-value">${schemaErrors}</div></div>
      <div class="card"><div class="card-title">Artifact Hashes</div><div class="card-value">${artifactHashes.length}</div></div>
      <div class="card"><div class="card-title">DAG Nodes</div><div class="card-value">${evidenceDag?.summary.nodeCount ?? 0}</div></div>
    </div>

    ${qegEvidence ? `
    <div class="risk-actions">
      <strong>Findings by severity:</strong>
      ${renderKeyValueRecord(qegEvidence.findings_summary.by_severity)}
      <strong>Findings by rule:</strong>
      ${renderKeyValueRecord(qegEvidence.findings_summary.by_rule)}
    </div>
    ` : ""}

    ${qegEvidence && qegEvidence.schema_compliance.length > 0 ? `
    <div class="risk-actions">
      <strong>Schema validation:</strong>
      <ul>
        ${qegEvidence.schema_compliance.map((item) => `
          <li>
            <span class="badge ${item.status === "error" ? "badge-critical" : "badge-low"}">${escapeHtml(item.status)}</span>
            ${escapeHtml(item.artifact)}
            ${item.errors?.length ? `: ${escapeHtml(item.errors.join("; "))}` : ""}
          </li>
        `).join("\n")}
      </ul>
    </div>
    ` : ""}

    ${artifactHashes.length > 0 ? `
    <div class="risk-actions">
      <strong>Artifact hashes:</strong>
      <ul>
        ${artifactHashes.map((item) => `
          <li><code>${escapeHtml(item.hash)}</code> ${escapeHtml(item.artifact)} (${escapeHtml(item.path)})</li>
        `).join("\n")}
      </ul>
    </div>
    ` : ""}

    ${evidenceDag ? `
    <div class="risk-actions">
      <strong>Evidence DAG:</strong>
      <p>${evidenceDag.summary.edgeCount} edges, ${artifactNodes.length} artifacts, ${manualNodes.length} manual test candidates, ${ciRunNodes.length} CI runs.</p>
    </div>
    <div class="section">
      <h3>Finding Drill-down</h3>
      ${findingNodes.length > 0
        ? findingNodes.map((node) => renderEvidenceDagNode(node, evidenceDag.edges)).join("\n")
        : `<div class="empty-state"><span class="empty-state-icon">-</span><p>No finding nodes in evidence DAG</p></div>`}
    </div>
    <div class="section">
      <h3>Manual Test Candidates</h3>
      ${manualNodes.length > 0
        ? manualNodes.map((node) => renderEvidenceDagNode(node, evidenceDag.edges)).join("\n")
        : `<div class="empty-state"><span class="empty-state-icon">-</span><p>No manual test candidates in evidence DAG</p></div>`}
    </div>
    ` : ""}
  </div>
</div>
`;
}

export function generateHistoricalSection(
  historical?: HistoricalSummaryReport
): string {
  if (!historical) {
    return `
<div id="historical-tab" class="tab-content">
  <div class="empty-state">
    <span class="empty-state-icon">-</span>
    <p>No historical comparison available</p>
  </div>
</div>
`;
  }

  const summary = historical.findingsComparison.summary;
  const trendPoints = historical.riskTrends.historyPoints ?? [];
  const bars = trendPoints.slice(-12).map((point) => {
    const total = Math.max(point.totalFindings, 1);
    const height = Math.min(100, Math.max(8, total * 6));
    return `
      <div class="timeline-bar" title="${escapeHtml(point.run_id)}: ${point.totalFindings} findings">
        <div class="timeline-bar-fill" style="height:${height}px"></div>
        <span>${escapeHtml(point.generated_at.slice(0, 10))}</span>
      </div>
`;
  }).join("\n");

  return `
<div id="historical-tab" class="tab-content">
  <div class="section">
    <div class="section-title">
      <h2>Historical Diff</h2>
      <span class="section-count">${summary.totalCurrent} current / ${summary.totalPrevious} previous</span>
    </div>
    <div class="dashboard">
      <div class="card"><div class="card-title">New</div><div class="card-value">${summary.newCount}</div></div>
      <div class="card"><div class="card-title">Resolved</div><div class="card-value">${summary.resolvedCount}</div></div>
      <div class="card"><div class="card-title">Unchanged</div><div class="card-value">${summary.unchangedCount}</div></div>
      <div class="card"><div class="card-title">Regressions</div><div class="card-value">${summary.regressionCount}</div></div>
    </div>
    <div class="risk-narrative">
      <p>Trend: ${escapeHtml(historical.riskTrends.trendDirection)} (score ${historical.riskTrends.trendScore.toFixed(2)})</p>
    </div>
    ${bars ? `<div class="timeline-chart">${bars}</div>` : `
    <div class="empty-state">
      <span class="empty-state-icon">-</span>
      <p>No timeline history points available</p>
    </div>
    `}
  </div>
</div>
`;
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
      : readiness.status === "blocked_input" || readiness.status === "failed"
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
        <div class="card-value">${readiness.counts.critical}</div>
      </div>
      <div class="card">
        <div class="card-title">High Findings</div>
        <div class="card-value">${readiness.counts.high}</div>
      </div>
      <div class="card">
        <div class="card-title">Findings</div>
        <div class="card-value">${readiness.counts.findings}</div>
      </div>
      <div class="card">
        <div class="card-title">Unsupported Claims</div>
        <div class="card-value">${readiness.counts.unsupportedClaims}</div>
      </div>
      <div class="card">
        <div class="card-title">Risk Count</div>
        <div class="card-value">${readiness.counts.risks}</div>
      </div>
      <div class="card">
        <div class="card-title">Test Seeds</div>
        <div class="card-value">${readiness.counts.testSeeds}</div>
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

  if (readiness.failedConditions.length > 0) {
    html += `
    <div class="risk-actions" style="background:rgba(220,53,69,0.1);border-left-color:#dc3545">
      <strong>Failed Conditions:</strong>
      <ul>
        ${readiness.failedConditions.map((c) => `<li>${escapeHtml(`${c.id}: ${c.reason}`)}</li>`).join("\n")}
      </ul>
    </div>
`;
  }

  if (readiness.recommendedActions.length > 0) {
    html += `
    <div class="risk-actions" style="background:rgba(255,193,7,0.1);border-left-color:#ffc107">
      <strong>Recommended Actions:</strong>
      <ul>
        ${readiness.recommendedActions.map((a) => `<li>${escapeHtml(a)}</li>`).join("\n")}
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
