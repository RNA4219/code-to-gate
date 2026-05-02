/**
 * Report Viewer - Main HTML report generator
 *
 * Generates a self-contained static HTML file with:
 * - Embedded CSS (no external dependencies)
 * - Interactive findings explorer
 * - Graph visualization (Mermaid)
 * - Dark mode toggle
 * - Collapsible sections
 * - Filtering and search
 */

import { FindingsArtifact } from "../types/artifacts.js";
import { getAllStyles } from "./styles.js";
import { generateFindingsExplorer } from "./finding-viewer.js";
import {
  escapeHtml,
  LoadedArtifacts,
  generateHeader,
  generateTabsNav,
  generateRiskRegisterSection,
  generateTestSeedsSection,
  generateReadinessSection,
  generateGraphSection,
  generateFooter,
} from "./report-sections.js";
import { getReportJavaScript } from "./report-scripts.js";

const VERSION = "0.2.0";

// Re-export for external use
export { LoadedArtifacts, escapeHtml };

/**
 * Report viewer configuration
 */
export interface ReportViewerConfig {
  title?: string;
  showGraph?: boolean;
  showTabs?: boolean;
  darkModeDefault?: boolean;
  showRiskRegister?: boolean;
  showTestSeeds?: boolean;
  showReadiness?: boolean;
  findingsConfig?: {
    showFilters?: boolean;
    showSearch?: boolean;
    collapsibleEvidence?: boolean;
  };
}

/**
 * Generate complete HTML report
 */
export function generateReportHtml(
  artifacts: LoadedArtifacts,
  config: ReportViewerConfig = {}
): string {
  const styles = getAllStyles();
  const header = generateHeader(artifacts, config.title);
  const tabsNav = generateTabsNav(config);
  const findingsSection = generateFindingsExplorer(
    artifacts.findings || createEmptyFindings(),
    {
      showFilters: config.findingsConfig?.showFilters ?? true,
      showSearch: config.findingsConfig?.showSearch ?? true,
      collapsibleEvidence: config.findingsConfig?.collapsibleEvidence ?? true,
    }
  );
  const graphSection = config.showGraph
    ? generateGraphSection(artifacts.graph, artifacts.findings)
    : "";
  const riskSection = config.showRiskRegister
    ? generateRiskRegisterSection(artifacts.riskRegister)
    : "";
  const testSection = config.showTestSeeds
    ? generateTestSeedsSection(artifacts.testSeeds)
    : "";
  const readinessSection = config.showReadiness
    ? generateReadinessSection(artifacts.readiness)
    : "";
  const footer = generateFooter();
  const script = getReportJavaScript({ darkModeDefault: config.darkModeDefault });

  const runId = artifacts.findings?.run_id || "unknown";

  return `
<!DOCTYPE html>
<html lang="en" data-theme="${config.darkModeDefault ? "dark" : "light"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>code-to-gate Report - ${escapeHtml(runId)}</title>
  <style>
${styles}
  </style>
</head>
<body>
${header}
${tabsNav}
${findingsSection}
${graphSection}
${riskSection}
${testSection}
${readinessSection}
${footer}
${script}
</body>
</html>
`.trim();
}

/**
 * Create empty findings artifact for fallback
 */
function createEmptyFindings(): FindingsArtifact {
  return {
    findings: [],
    generated_at: new Date().toISOString(),
    run_id: "none",
    repo: { root: "unknown" },
    tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
    artifact: "findings",
    schema: "findings@v1",
    version: "ctg/v1alpha1",
    completeness: "complete",
    unsupported_claims: [],
  };
}

/**
 * Write HTML report to file
 */
export function writeReportHtml(
  outputPath: string,
  artifacts: LoadedArtifacts,
  config: ReportViewerConfig = {}
): void {
  const { writeFileSync } = require("node:fs");
  const html = generateReportHtml(artifacts, config);
  writeFileSync(outputPath, html, "utf8");
}

/**
 * Generate simplified report (findings only, no tabs)
 */
export function generateSimplifiedReport(
  findings: FindingsArtifact,
  config: ReportViewerConfig = {}
): string {
  return generateReportHtml({ findings }, { ...config, showTabs: false });
}