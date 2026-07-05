/**
 * Viewer command - Generate static HTML web viewer
 *
 * Creates a self-contained HTML file for viewing analysis results.
 * No external dependencies - all CSS and JavaScript are embedded.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import * as path from "node:path";

import { VERSION } from "./exit-codes.js";
import {
  FindingsArtifact,
  RiskRegisterArtifact,
  TestSeedsArtifact,
  ReleaseReadinessArtifact,
  EvidenceDagArtifact,
  HostedStaticReportArtifact,
  HostedStaticReportTarget,
} from "../types/artifacts.js";
import type { RedactionProfile, RedactionSummary } from "../types/artifacts.js";
import {
  createRedactionSummary,
  parseRedactionProfileOption,
} from "../redaction/redaction-profile.js";
import type { HistoricalSummaryReport } from "../historical/types.js";
import { NormalizedRepoGraph } from "../types/graph.js";
import type { QEGCodeToGateEvidence } from "../qeg/qeg-types.js";
import {
  generateReportHtml,
  LoadedArtifacts,
  ReportViewerConfig,
} from "../viewer/index.js";

const HOSTED_SOURCE_FILES = [
  { id: "findings", file: "findings.json" },
  { id: "risk-register", file: "risk-register.json" },
  { id: "risk-register", file: "risk-register.yaml" },
  { id: "test-seeds", file: "test-seeds.json" },
  { id: "release-readiness", file: "release-readiness.json" },
  { id: "repo-graph", file: "repo-graph.json" },
  { id: "historical-comparison", file: "historical-comparison.json" },
  { id: "qeg-code-to-gate", file: "qeg-code-to-gate.json" },
  { id: "evidence-dag", file: "evidence-dag.json" },
] as const;

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

  const historicalPath = path.join(artifactDir, "historical-comparison.json");
  if (existsSync(historicalPath)) {
    try {
      const content = readFileSync(historicalPath, "utf8");
      artifacts.historicalComparison = JSON.parse(content) as HistoricalSummaryReport;
    } catch (error) {
      console.error(`Warning: Failed to load historical-comparison.json: ${error}`);
    }
  }

  const qegPath = path.join(artifactDir, "qeg-code-to-gate.json");
  if (existsSync(qegPath)) {
    try {
      const content = readFileSync(qegPath, "utf8");
      artifacts.qegEvidence = JSON.parse(content) as QEGCodeToGateEvidence;
    } catch (error) {
      console.error(`Warning: Failed to load qeg-code-to-gate.json: ${error}`);
    }
  }

  const evidenceDagPath = path.join(artifactDir, "evidence-dag.json");
  if (existsSync(evidenceDagPath)) {
    try {
      const content = readFileSync(evidenceDagPath, "utf8");
      artifacts.evidenceDag = JSON.parse(content) as EvidenceDagArtifact;
    } catch (error) {
      console.error(`Warning: Failed to load evidence-dag.json: ${error}`);
    }
  }

  return artifacts;
}

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function relativeToCwd(cwd: string, filePath: string): string {
  return path.relative(cwd, filePath) || ".";
}

function readJsonObject(filePath: string): Record<string, unknown> | null {
  if (!filePath.endsWith(".json")) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseHostedTarget(value: string | undefined): HostedStaticReportTarget | null {
  if (!value) {
    return "generic-static";
  }
  if (value === "github-pages" || value === "artifact-preview" || value === "generic-static") {
    return value;
  }
  return null;
}

function chooseRunId(artifacts: LoadedArtifacts): string {
  return (
    artifacts.findings?.run_id ||
    artifacts.readiness?.run_id ||
    artifacts.graph?.run_id ||
    artifacts.historicalComparison?.run_id ||
    artifacts.evidenceDag?.run_id ||
    artifacts.qegEvidence?.run_id ||
    `viewer-report-${Date.now()}`
  );
}

function chooseRepoRoot(artifacts: LoadedArtifacts, artifactDir: string): string {
  return (
    artifacts.findings?.repo?.root ||
    artifacts.readiness?.repo?.root ||
    artifacts.graph?.repo?.root ||
    artifacts.historicalComparison?.repo?.root ||
    artifacts.evidenceDag?.repo?.root ||
    artifactDir
  );
}

function collectHostedSourceArtifacts(artifactDir: string, cwd: string): HostedStaticReportArtifact["sourceArtifacts"] {
  const entries: HostedStaticReportArtifact["sourceArtifacts"] = [];

  for (const source of HOSTED_SOURCE_FILES) {
    const filePath = path.join(artifactDir, source.file);
    if (!existsSync(filePath)) {
      continue;
    }

    const content = readFileSync(filePath);
    const stats = statSync(filePath);
    const parsed = readJsonObject(filePath);
    const schemaValue = parsed?.schema ?? parsed?.version;
    const generatedAt = typeof parsed?.generated_at === "string" ? parsed.generated_at : undefined;

    entries.push({
      id: source.id,
      file: relativeToCwd(cwd, filePath),
      schema: typeof schemaValue === "string" ? schemaValue : undefined,
      hashSha256: sha256(content),
      sizeBytes: stats.size,
      generatedAt,
    });
  }

  return entries;
}

function createHostedStaticReportManifest(input: {
  artifacts: LoadedArtifacts;
  artifactDir: string;
  outputPath: string;
  html: string;
  cwd: string;
  version: string;
  target: HostedStaticReportTarget;
  publicUrl?: string;
  redactionProfile: RedactionProfile;
  redactionSummary: RedactionSummary;
}): HostedStaticReportArtifact {
  const htmlBytes = Buffer.from(input.html, "utf8");

  return {
    version: "ctg/v1",
    generated_at: new Date().toISOString(),
    run_id: chooseRunId(input.artifacts),
    repo: { root: chooseRepoRoot(input.artifacts, input.artifactDir) },
    tool: { name: "code-to-gate", version: input.version, plugin_versions: [] },
    artifact: "hosted-static-report",
    schema: "hosted-static-report@v1",
    completeness: "complete",
    target: input.target,
    publicUrl: input.publicUrl,
    redactionProfile: input.redactionProfile,
    redactionSummary: input.redactionSummary,
    html: {
      path: relativeToCwd(input.cwd, input.outputPath),
      hashSha256: sha256(htmlBytes),
      sizeBytes: htmlBytes.byteLength,
      singleFile: true,
      externalAssets: [],
    },
    sourceArtifacts: collectHostedSourceArtifacts(input.artifactDir, input.cwd),
    security: {
      selfContained: true,
      externalNetworkRequired: false,
      inlineAssets: true,
    },
    compatibleHosts: ["github-pages", "artifact-preview", "generic-static"],
    generated_by: "ctg-viewer-hosted-v1",
  };
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
  const hosted = args.includes("--hosted");
  const publicUrl = options.getOption(args, "--public-url");
  const hostedTarget = parseHostedTarget(options.getOption(args, "--hosted-target"));
  let redactionProfile: RedactionProfile;
  try {
    redactionProfile = parseRedactionProfileOption(options.getOption(args, "--redaction-profile"));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.USAGE_ERROR;
  }
  const redactionSummary = createRedactionSummary(redactionProfile);

  if (!hostedTarget) {
    console.error("invalid --hosted-target; expected github-pages, artifact-preview, or generic-static");
    return options.EXIT.USAGE_ERROR;
  }

  if (!fromDir) {
    console.error("usage: code-to-gate viewer --from <dir> [--out <file>] [--title <title>] [--dark] [--hosted] [--public-url <url>] [--hosted-target <target>] [--redaction-profile <public|private|regulated>]");
    console.error("");
    console.error("Options:");
    console.error("  --from <dir>    Input artifact directory (required)");
    console.error("  --out <file>    Output HTML file (default: viewer-report.html)");
    console.error("  --title <title> Report title (default: code-to-gate Analysis Report)");
    console.error("  --dark          Enable dark mode by default");
    console.error("  --hosted        Write hosted-static-report.json next to the HTML output");
    console.error("  --public-url    Expected URL after publishing the HTML");
    console.error("  --hosted-target Static host target: github-pages, artifact-preview, generic-static");
    console.error("  --redaction-profile Output redaction profile: public, private, regulated");
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
    darkModeDefault: args.includes("--dark") || darkModeOpt === "true" || darkModeOpt === "1",
    showRiskRegister: !!artifacts.riskRegister,
    showTestSeeds: !!artifacts.testSeeds,
    showReadiness: !!artifacts.readiness,
    showHistorical: !!artifacts.historicalComparison,
    showQeg: !!artifacts.qegEvidence || !!artifacts.evidenceDag,
    redactionProfile,
    redactionSummary,
    findingsConfig: {
      showFilters: true,
      showSearch: true,
      collapsibleEvidence: true,
      maxRenderedFindings: 1000,
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
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html, "utf8");

  let hostedManifestPath: string | undefined;
  let hostedManifest: HostedStaticReportArtifact | undefined;
  if (hosted) {
    hostedManifestPath = path.join(path.dirname(outputPath), "hosted-static-report.json");
    hostedManifest = createHostedStaticReportManifest({
      artifacts,
      artifactDir,
      outputPath,
      html,
      cwd,
      version: options.VERSION,
      target: hostedTarget,
      publicUrl,
      redactionProfile,
      redactionSummary,
    });
    writeFileSync(hostedManifestPath, JSON.stringify(hostedManifest, null, 2) + "\n", "utf8");
  }

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
      historical: artifacts.historicalComparison ? "loaded" : "none",
      qeg: artifacts.qegEvidence ? "loaded" : "none",
      evidenceDag: artifacts.evidenceDag?.summary.nodeCount || 0,
    },
    config: {
      title: config.title,
      darkMode: config.darkModeDefault,
      tabs: config.showTabs,
    },
    hosted: hostedManifest && hostedManifestPath ? {
      manifest: path.relative(cwd, hostedManifestPath),
      target: hostedManifest.target,
      publicUrl: hostedManifest.publicUrl,
      htmlHashSha256: hostedManifest.html.hashSha256,
      sourceArtifacts: hostedManifest.sourceArtifacts.length,
      redactionProfile: hostedManifest.redactionProfile?.name,
      redactionWarnings: hostedManifest.redactionSummary?.warnings.length,
    } : undefined,
  };

  console.log(JSON.stringify(summary, null, 2));

  return options.EXIT.OK;
}
