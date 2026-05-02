/**
 * Finding Viewer - Interactive finding explorer
 *
 * Generates HTML for findings with filtering, severity grouping,
 * and collapsible evidence display.
 */

import { Finding, Severity, FindingCategory, EvidenceRef, FindingsArtifact } from "../types/artifacts.js";
import {
  escapeHtml,
  sortFindingsBySeverity,
  countBySeverity,
  countByCategory,
  getUniqueCategories,
} from "./finding-viewer-utils.js";

// Re-export utility functions
export {
  escapeHtml,
  sortFindingsBySeverity,
  filterFindingsBySeverity,
  filterFindingsByCategory,
  searchFindings,
  getUniqueCategories,
  countBySeverity,
  countByCategory,
  getSeverityColor,
  getSeverityOrder,
} from "./finding-viewer-utils.js";

/**
 * Finding viewer configuration
 */
export interface FindingViewerConfig {
  showFilters?: boolean;
  showSearch?: boolean;
  defaultSeverityFilter?: Severity | "all";
  defaultCategoryFilter?: FindingCategory | "all";
  collapsibleEvidence?: boolean;
  maxEvidenceLength?: number;
}

/**
 * Generate evidence display HTML
 */
export function generateEvidenceHtml(
  evidence: EvidenceRef[],
  config: FindingViewerConfig = {}
): string {
  if (evidence.length === 0) {
    return '<div class="empty-state"><span class="empty-state-icon">-</span><p>No evidence available</p></div>';
  }

  let html = "";

  for (const ev of evidence) {
    const location = ev.startLine
      ? `${ev.path}:${ev.startLine}${ev.endLine ? `-${ev.endLine}` : ""}`
      : ev.path;

    const kindLabel = ev.kind.charAt(0).toUpperCase() + ev.kind.slice(1);

    html += `
<div class="evidence" data-evidence-id="${escapeHtml(ev.id)}">
  <div class="evidence-header">
    <span class="evidence-path">${escapeHtml(location)}</span>
    <span class="badge">${escapeHtml(kindLabel)}</span>
    <button class="evidence-expand" onclick="toggleEvidence('${escapeHtml(ev.id)}')">Expand</button>
  </div>
  <div class="evidence-content collapsed" id="evidence-${escapeHtml(ev.id)}">
    <div class="evidence-meta">
      <small>Kind: ${escapeHtml(ev.kind)} | ID: ${escapeHtml(ev.id)}</small>
    </div>
    ${ev.externalRef ? `
      <div class="evidence-external">
        <small>External: ${escapeHtml(ev.externalRef.tool)}${ev.externalRef.ruleId ? ` / ${escapeHtml(ev.externalRef.ruleId)}` : ""}</small>
      </div>
    ` : ""}
  </div>
</div>
`;
  }

  return html;
}

/**
 * Generate a single finding card HTML
 */
export function generateFindingCard(
  finding: Finding,
  index: number,
  config: FindingViewerConfig = {}
): string {
  const severityBadgeClass = `badge-${finding.severity}`;
  const evidenceHtml = generateEvidenceHtml(finding.evidence, config);

  return `
<div class="finding" data-finding-id="${escapeHtml(finding.id)}" data-severity="${finding.severity}" data-category="${finding.category}">
  <div class="collapsible">
    <div class="collapsible-header" onclick="toggleFinding('${escapeHtml(finding.id)}')">
      <div class="finding-header">
        <span class="badge ${severityBadgeClass}">${escapeHtml(finding.severity)}</span>
        <span class="finding-id">#${index + 1}</span>
        <span class="finding-title">${escapeHtml(finding.title)}</span>
      </div>
      <span class="collapsible-icon" id="icon-${escapeHtml(finding.id)}">&#9662;</span>
    </div>
    <div class="collapsible-content" id="content-${escapeHtml(finding.id)}">
      <div class="finding-body">
        <div class="finding-meta">
          <span class="finding-meta-label">Rule:</span>
          <span>${escapeHtml(finding.ruleId)}</span>
          <span class="finding-meta-label">Category:</span>
          <span>${escapeHtml(finding.category)}</span>
          <span class="finding-meta-label">Confidence:</span>
          <span>${finding.confidence.toFixed(2)}</span>
          ${finding.tags && finding.tags.length > 0 ? `
            <span class="finding-meta-label">Tags:</span>
            <span>${finding.tags.map((t) => escapeHtml(t)).join(", ")}</span>
          ` : ""}
          ${finding.affectedSymbols && finding.affectedSymbols.length > 0 ? `
            <span class="finding-meta-label">Symbols:</span>
            <span>${finding.affectedSymbols.map((s) => escapeHtml(s)).join(", ")}</span>
          ` : ""}
          ${finding.affectedEntrypoints && finding.affectedEntrypoints.length > 0 ? `
            <span class="finding-meta-label">Entrypoints:</span>
            <span>${finding.affectedEntrypoints.map((e) => escapeHtml(e)).join(", ")}</span>
          ` : ""}
        </div>
        <div class="finding-summary">
          <p>${escapeHtml(finding.summary)}</p>
        </div>
        ${evidenceHtml}
      </div>
    </div>
  </div>
</div>
`;
}

/**
 * Generate filter toolbar HTML
 */
export function generateFilterToolbar(
  findings: Finding[],
  config: FindingViewerConfig = {}
): string {
  if (!config.showFilters) return "";

  const severityCounts = countBySeverity(findings);
  const categories = getUniqueCategories(findings);
  const categoryCounts = countByCategory(findings);

  let severityFilters = `
<div class="toolbar-group">
  <span class="toolbar-label">Severity:</span>
  <button class="filter-btn active" data-filter="severity" data-value="all" onclick="filterFindings('severity', 'all')">
    All (${findings.length})
  </button>
`;

  const severities: Severity[] = ["critical", "high", "medium", "low"];
  for (const sev of severities) {
    const count = severityCounts[sev];
    if (count > 0) {
      severityFilters += `
  <button class="filter-btn" data-filter="severity" data-value="${sev}" onclick="filterFindings('severity', '${sev}')">
    ${sev.charAt(0).toUpperCase() + sev.slice(1)} (${count})
  </button>
`;
    }
  }
  severityFilters += "</div>";

  let categoryFilters = `
<div class="toolbar-group">
  <span class="toolbar-label">Category:</span>
  <button class="filter-btn active" data-filter="category" data-value="all" onclick="filterFindings('category', 'all')">
    All
  </button>
`;

  for (const cat of categories) {
    const count = categoryCounts[cat] || 0;
    categoryFilters += `
  <button class="filter-btn" data-filter="category" data-value="${cat}" onclick="filterFindings('category', '${cat}')">
    ${cat} (${count})
  </button>
`;
  }
  categoryFilters += "</div>";

  const searchInput = config.showSearch
    ? `
<div class="toolbar-group">
  <span class="toolbar-label">Search:</span>
  <input type="text" class="search-input" placeholder="Search findings..." onkeyup="searchFindings(this.value)">
</div>
`
    : "";

  return `
<div class="toolbar fade-in">
  ${severityFilters}
  ${categoryFilters}
  ${searchInput}
</div>
`;
}

/**
 * Generate the full findings explorer HTML
 */
export function generateFindingsExplorer(
  findingsArtifact: FindingsArtifact,
  config: FindingViewerConfig = {}
): string {
  const findings = sortFindingsBySeverity(findingsArtifact.findings);
  const filterToolbar = generateFilterToolbar(findings, config);
  const counts = countBySeverity(findings);

  // Generate summary cards
  let summaryCards = `
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
    <div class="card-title">Total</div>
    <div class="card-value">${findings.length}</div>
  </div>
</div>
`;

  // Generate severity distribution chart
  const total = findings.length;
  const criticalPct = total > 0 ? (counts.critical / total) * 100 : 0;
  const highPct = total > 0 ? (counts.high / total) * 100 : 0;
  const mediumPct = total > 0 ? (counts.medium / total) * 100 : 0;
  const lowPct = total > 0 ? (counts.low / total) * 100 : 0;

  const chart = `
<div class="severity-chart">
  <h3>Severity Distribution</h3>
  <div class="chart-bars">
    <div class="chart-bar chart-bar-critical" style="width: ${criticalPct}%"></div>
    <div class="chart-bar chart-bar-high" style="width: ${highPct}%"></div>
    <div class="chart-bar chart-bar-medium" style="width: ${mediumPct}%"></div>
    <div class="chart-bar chart-bar-low" style="width: ${lowPct}%"></div>
  </div>
  <div class="chart-labels">
    <span class="chart-label"><span class="chart-dot" style="background:var(--color-critical)"></span> Critical (${counts.critical})</span>
    <span class="chart-label"><span class="chart-dot" style="background:var(--color-high)"></span> High (${counts.high})</span>
    <span class="chart-label"><span class="chart-dot" style="background:var(--color-medium)"></span> Medium (${counts.medium})</span>
    <span class="chart-label"><span class="chart-dot" style="background:var(--color-low)"></span> Low (${counts.low})</span>
  </div>
</div>
`;

  // Generate findings list
  let findingsList = "";

  if (findings.length === 0) {
    findingsList = `
<div class="empty-state">
  <span class="empty-state-icon">&#10003;</span>
  <p>No findings detected</p>
</div>
`;
  } else {
    findingsList = `
<div class="section">
  <div class="section-title">
    <h2>Findings List</h2>
    <span class="section-count">${findings.length} findings</span>
  </div>
  <div id="findings-list">
`;

    for (let i = 0; i < findings.length; i++) {
      findingsList += generateFindingCard(findings[i], i, config);
    }

    findingsList += `
  </div>
</div>
`;
  }

  // JavaScript for interactivity
  const script = getFindingsScript();

  return `
<div id="findings-explorer" class="tab-content active">
  ${summaryCards}
  ${chart}
  ${filterToolbar}
  ${findingsList}
  ${script}
</div>
`;
}

/**
 * Get JavaScript for findings interactivity
 */
function getFindingsScript(): string {
  return `
<script>
// Finding filtering and interactivity
let currentSeverityFilter = 'all';
let currentCategoryFilter = 'all';
let currentSearchQuery = '';

function filterFindings(filterType, value) {
  // Update filter state
  if (filterType === 'severity') {
    currentSeverityFilter = value;
  } else if (filterType === 'category') {
    currentCategoryFilter = value;
  }

  // Update button states
  document.querySelectorAll('[data-filter="' + filterType + '"]').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.value === value) {
      btn.classList.add('active');
    }
  });

  applyFilters();
}

function searchFindings(query) {
  currentSearchQuery = query.toLowerCase();
  applyFilters();
}

function applyFilters() {
  document.querySelectorAll('.finding').forEach(el => {
    const severity = el.dataset.severity;
    const category = el.dataset.category;
    const title = el.querySelector('.finding-title').textContent.toLowerCase();

    let show = true;

    if (currentSeverityFilter !== 'all' && severity !== currentSeverityFilter) {
      show = false;
    }

    if (currentCategoryFilter !== 'all' && category !== currentCategoryFilter) {
      show = false;
    }

    if (currentSearchQuery && !title.includes(currentSearchQuery)) {
      show = false;
    }

    el.style.display = show ? 'block' : 'none';
  });

  // Update visible count
  const visibleCount = document.querySelectorAll('.finding[style="display: block"], .finding:not([style])').length;
  document.querySelector('.section-count').textContent = visibleCount + ' findings';
}

function toggleFinding(id) {
  const content = document.getElementById('content-' + id);
  const icon = document.getElementById('icon-' + id);

  if (content) {
    content.classList.toggle('active');
  }
  if (icon) {
    icon.classList.toggle('open');
  }
}

function toggleEvidence(id) {
  const el = document.getElementById('evidence-' + id);
  const btn = el.previousElementSibling.querySelector('.evidence-expand');

  if (el.classList.contains('collapsed')) {
    el.classList.remove('collapsed');
    btn.textContent = 'Collapse';
  } else {
    el.classList.add('collapsed');
    btn.textContent = 'Expand';
  }
}

// Initialize all findings visible
document.addEventListener('DOMContentLoaded', function() {
  applyFilters();
});
</script>
`;
}

/**
 * Generate severity-grouped findings section (alternative view)
 */
export function generateSeverityGroupedFindings(
  findingsArtifact: FindingsArtifact,
  config: FindingViewerConfig = {}
): string {
  const severities: Severity[] = ["critical", "high", "medium", "low"];
  let html = '<div class="section"><h2>Findings by Severity</h2>';

  for (const severity of severities) {
    const severityFindings = findingsArtifact.findings.filter(
      (f) => f.severity === severity
    );

    if (severityFindings.length === 0) continue;

    html += `
<div class="collapsible">
  <div class="collapsible-header" onclick="toggleSection('${severity}-section')">
    <span class="badge badge-${severity}">${escapeHtml(severity)}</span>
    <span>${severityFindings.length} findings</span>
    <span class="collapsible-icon" id="icon-${severity}-section">&#9662;</span>
  </div>
  <div class="collapsible-content" id="content-${severity}-section">
`;

    for (let i = 0; i < severityFindings.length; i++) {
      html += generateFindingCard(severityFindings[i], i, config);
    }

    html += "</div></div>";
  }

  html += "</div>";
  return html;
}

/**
 * Generate category-grouped findings section (alternative view)
 */
export function generateCategoryGroupedFindings(
  findingsArtifact: FindingsArtifact,
  config: FindingViewerConfig = {}
): string {
  const categories = getUniqueCategories(findingsArtifact.findings);
  let html = '<div class="section"><h2>Findings by Category</h2>';

  for (const category of categories) {
    const categoryFindings = findingsArtifact.findings.filter(
      (f) => f.category === category
    );

    html += `
<div class="collapsible">
  <div class="collapsible-header" onclick="toggleSection('${category}-section')">
    <span class="badge">${escapeHtml(category)}</span>
    <span>${categoryFindings.length} findings</span>
    <span class="collapsible-icon" id="icon-${category}-section">&#9662;</span>
  </div>
  <div class="collapsible-content" id="content-${category}-section">
`;

    for (let i = 0; i < categoryFindings.length; i++) {
      html += generateFindingCard(categoryFindings[i], i, config);
    }

    html += "</div></div>";
  }

  html += "</div>";
  return html;
}