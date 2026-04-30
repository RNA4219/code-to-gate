/**
 * Viewer command - Generate static HTML web viewer
 *
 * Creates a self-contained HTML file for viewing analysis results.
 * No external dependencies - all CSS and JavaScript are embedded.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import * as path from "node:path";

import {
  FindingsArtifact,
  RiskRegisterArtifact,
  TestSeedsArtifact,
  ReleaseReadinessArtifact,
} from "../types/artifacts.js";
import { NormalizedRepoGraph } from "../types/graph.js";
import {
  generateReportHtml,
  LoadedArtifacts,
  ReportViewerConfig,
} from "../viewer/index.js";

const VERSION = "1.0.0";

export interface ExitCodes {
  OK: number;
  READINESS_NOT_CLEAR: number;
  USAGE_ERROR: number;
  SCAN_FAILED: number;
  LLM_FAILED: number;
  POLICY_FAILED: number;
  PLUGIN_FAILED: number;
  SCHEMA_FAILED: number;
  IMPORT_FAILED: number;
  INTEGRATION_EXPORT_FAILED: number;
  INTERNAL_ERROR: number;
}

export interface ViewerOptions {
  VERSION: string;
  EXIT: ExitCodes;
  getOption: (args: string[], name: string) => string | undefined;
}

/**
 * Load artifacts from a directory
 */
function loadArtifactsFromDir(artifactDir: string): LoadedArtifacts {
  const artifacts: LoadedArtifacts = {};

  // Load findings.json
  const findingsPath = path.join(artifactDir, "findings.json");
  if (existsSync(findingsPath)) {
    try {
      const content = readFileSync(findingsPath, "utf8");
      artifacts.findings = JSON.parse(content) as FindingsArtifact;
    } catch (error) {
      console.error(`Warning: Failed to load findings.json: ${error}`);
    }
  }

  // Load risk-register.yaml (try JSON first)
  const riskRegisterJsonPath = path.join(artifactDir, "risk-register.json");
  const riskRegisterYamlPath = path.join(artifactDir, "risk-register.yaml");

  if (existsSync(riskRegisterJsonPath)) {
    try {
      const content = readFileSync(riskRegisterJsonPath, "utf8");
      artifacts.riskRegister = JSON.parse(content) as RiskRegisterArtifact;
    } catch (error) {
      console.error(`Warning: Failed to load risk-register.json: ${error}`);
    }
  } else if (existsSync(riskRegisterYamlPath)) {
    // YAML parsing would require yaml library, skip for MVP
    console.error("Warning: YAML risk-register not supported in MVP - use JSON export");
  }

  // Load test-seeds.json
  const testSeedsPath = path.join(artifactDir, "test-seeds.json");
  if (existsSync(testSeedsPath)) {
    try {
      const content = readFileSync(testSeedsPath, "utf8");
      artifacts.testSeeds = JSON.parse(content) as TestSeedsArtifact;
    } catch (error) {
      console.error(`Warning: Failed to load test-seeds.json: ${error}`);
    }
  }

  // Load release-readiness.json
  const readinessPath = path.join(artifactDir, "release-readiness.json");
  if (existsSync(readinessPath)) {
    try {
      const content = readFileSync(readinessPath, "utf8");
      artifacts.readiness = JSON.parse(content) as ReleaseReadinessArtifact;
    } catch (error) {
      console.error(`Warning: Failed to load release-readiness.json: ${error}`);
    }
  }

  // Load repo-graph.json
  const graphPath = path.join(artifactDir, "repo-graph.json");
  if (existsSync(graphPath)) {
    try {
      const content = readFileSync(graphPath, "utf8");
      artifacts.graph = JSON.parse(content) as NormalizedRepoGraph;
    } catch (error) {
      console.error(`Warning: Failed to load repo-graph.json: ${error}`);
    }
  }

  return artifacts;
}

/**
 * Viewer command implementation
 */
export async function viewerCommand(
  args: string[],
  options: ViewerOptions
): Promise<number> {
  const fromDir = options.getOption(args, "--from");
  const outFile = options.getOption(args, "--out");
  const titleOpt = options.getOption(args, "--title");
  const darkModeOpt = options.getOption(args, "--dark");

  if (!fromDir) {
    console.error("usage: code-to-gate viewer --from <dir> [--out <file>] [--title <title>] [--dark]");
    console.error("");
    console.error("Options:");
    console.error("  --from <dir>    Input artifact directory (required)");
    console.error("  --out <file>    Output HTML file (default: viewer-report.html)");
    console.error("  --title <title> Report title (default: code-to-gate Analysis Report)");
    console.error("  --dark          Enable dark mode by default");
    return options.EXIT.USAGE_ERROR;
  }

  const cwd = process.cwd();
  const artifactDir = path.resolve(cwd, fromDir);

  // Validate input directory
  if (!existsSync(artifactDir)) {
    console.error(`artifact directory not found: ${fromDir}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!statSync(artifactDir).isDirectory()) {
    console.error(`artifact path is not a directory: ${fromDir}`);
    return options.EXIT.USAGE_ERROR;
  }

  // Load artifacts
  console.error(`Loading artifacts from: ${artifactDir}`);
  const artifacts = loadArtifactsFromDir(artifactDir);

  // Check if we have any artifacts
  if (!artifacts.findings) {
    console.error(`Warning: No findings.json found in ${fromDir}`);
    console.error(`Generating report with empty findings`);
  }

  // Configure report
  const config: ReportViewerConfig = {
    title: titleOpt || "code-to-gate Analysis Report",
    showGraph: !!artifacts.graph,
    showTabs: true,
    darkModeDefault: darkModeOpt === "true" || darkModeOpt === "1",
    showRiskRegister: !!artifacts.riskRegister,
    showTestSeeds: !!artifacts.testSeeds,
    showReadiness: !!artifacts.readiness,
    findingsConfig: {
      showFilters: true,
      showSearch: true,
      collapsibleEvidence: true,
    },
  };

  // Generate report
  console.error("Generating HTML report...");
  const html = generateReportHtml(artifacts, config);

  // Determine output path
  const outputPath = outFile
    ? path.resolve(cwd, outFile)
    : path.join(artifactDir, "viewer-report.html");

  // Write output
  writeFileSync(outputPath, html, "utf8");

  // Output summary
  const summary = {
    tool: "code-to-gate",
    command: "viewer",
    version: VERSION,
    input: path.relative(cwd, artifactDir),
    output: path.relative(cwd, outputPath),
    artifacts: {
      findings: artifacts.findings?.findings?.length || 0,
      risks: artifacts.riskRegister?.risks?.length || 0,
      testSeeds: artifacts.testSeeds?.seeds?.length || 0,
      readiness: artifacts.readiness?.status || "none",
      graph: artifacts.graph?.symbols?.length || 0,
    },
    config: {
      title: config.title,
      darkMode: config.darkModeDefault,
      tabs: config.showTabs,
    },
  };

  console.log(JSON.stringify(summary, null, 2));

  return options.EXIT.OK;
}