/**
 * Viewer Module - Web viewer for code-to-gate reports
 *
 * Generates self-contained static HTML reports with:
 * - Interactive findings explorer
 * - Graph visualization (Mermaid)
 * - Dark mode toggle
 * - Collapsible sections
 * - Filtering and search
 * - Evidence display with code highlighting
 *
 * No external dependencies - all CSS and JS embedded.
 */

// Main report generator
export {
  generateReportHtml,
  writeReportHtml,
  generateSimplifiedReport,
  ReportViewerConfig,
  LoadedArtifacts,
} from "./report-viewer.js";

// Graph visualization
export {
  generateMermaidFlowchart,
  generateMermaidDependencyGraph,
  generateMermaidCallGraph,
  generateMermaidSequenceDiagram,
  generateGraphViewerSection,
  getMermaidJavaScript,
  GraphViewerConfig,
  GraphData,
} from "./graph-viewer.js";

// Finding explorer
export {
  generateFindingsExplorer,
  generateSeverityGroupedFindings,
  generateCategoryGroupedFindings,
  generateFindingCard,
  generateEvidenceHtml,
  generateFilterToolbar,
  FindingViewerConfig,
  sortFindingsBySeverity,
  filterFindingsBySeverity,
  filterFindingsByCategory,
  searchFindings,
  getUniqueCategories,
  countBySeverity,
  countByCategory,
  getSeverityColor,
  getSeverityOrder,
} from "./finding-viewer.js";

// Styles
export {
  getBaseStyles,
  getMermaidStyles,
  getAllStyles,
} from "./styles.js";