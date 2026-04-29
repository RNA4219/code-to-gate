/**
 * Historical CLI command
 *
 * Compare artifacts between runs to identify:
 * - New findings
 * - Resolved findings
 * - Unchanged findings
 * - Regressions
 *
 * Usage:
 *   code-to-gate historical --current <dir> --previous <dir> --out <file>
 */

import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EXIT, getOption, VERSION } from "./exit-codes.js";

import {
  HistoricalOptions,
  HistoricalSummaryReport,
  RunReference,
  RiskTrendPoint,
} from "../historical/types.js";

import {
  loadFindings,
  loadRisks,
  loadReadiness,
  compareFindings,
  compareRisks,
  compareReadiness,
  analyzeRiskTrends,
  generateHistoricalReport,
} from "../historical/comparison.js";

import {
  discoverHistoricalRuns,
} from "../historical/baseline.js";

import {
  DEFAULT_REGRESSION_CONFIG,
  generateRegressionReport,
} from "../historical/regression.js";

interface HistoricalCommandOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

/**
 * Get run reference from artifact directory
 */
function getRunReference(artifactDir: string): RunReference | null {
  const findings = loadFindings(artifactDir);

  if (!findings) {
    return null;
  }

  return {
    run_id: findings.run_id,
    generated_at: findings.generated_at,
    artifact_dir: artifactDir,
    repo_revision: findings.repo.revision,
    branch: findings.repo.branch,
  };
}

/**
 * Load trend history points from a history directory
 */
function loadTrendHistory(historyDir: string, currentTimestamp: string): RiskTrendPoint[] {
  if (!existsSync(historyDir)) {
    return [];
  }

  const runs = discoverHistoricalRuns(historyDir);
  const points: RiskTrendPoint[] = [];
  const currentTime = new Date(currentTimestamp).getTime();

  for (const run of runs) {
    const runTime = new Date(run.generated_at).getTime();
    // Only include runs before current timestamp
    if (runTime >= currentTime) continue;

    const findings = loadFindings(run.artifact_dir);
    const readiness = loadReadiness(run.artifact_dir);

    if (!findings) continue;

    const criticalFindings = findings.findings.filter(f => f.severity === "critical").length;
    const highFindings = findings.findings.filter(f => f.severity === "high").length;
    const mediumFindings = findings.findings.filter(f => f.severity === "medium").length;
    const lowFindings = findings.findings.filter(f => f.severity === "low").length;

    const risks = loadRisks(run.artifact_dir);
    const riskCount = risks?.risks.length ?? 0;

    points.push({
      run_id: run.run_id,
      generated_at: run.generated_at,
      criticalFindings,
      highFindings,
      mediumFindings,
      lowFindings,
      totalFindings: findings.findings.length,
      riskCount,
      readinessStatus: readiness?.status ?? "needs_review",
    });
  }

  // Sort by date (oldest first)
  points.sort((a, b) => new Date(a.generated_at).getTime() - new Date(b.generated_at).getTime());

  return points;
}

/**
 * Historical command implementation
 */
export async function historicalCommand(
  args: string[],
  options: HistoricalCommandOptions
): Promise<number> {
  const currentDir = options.getOption(args, "--current");
  const previousDir = options.getOption(args, "--previous");
  const outFile = options.getOption(args, "--out");
  const historyDir = options.getOption(args, "--history");

  if (!currentDir || !previousDir) {
    console.error("usage: code-to-gate historical --current <dir> --previous <dir> [--out <file>] [--history <dir>]");
    console.error("");
    console.error("Options:");
    console.error("  --current <dir>   Current run artifact directory (required)");
    console.error("  --previous <dir>  Previous run artifact directory (required)");
    console.error("  --out <file>      Output file for historical comparison report");
    console.error("  --history <dir>   Directory containing historical runs for trend analysis");
    console.error("");
    console.error("Examples:");
    console.error("  code-to-gate historical --current .qh --previous .qh-prev");
    console.error("  code-to-gate historical --current run-2024-01-15 --previous baseline --out comparison.json");
    return options.EXIT.USAGE_ERROR;
  }

  const cwd = process.cwd();
  const absoluteCurrentDir = path.resolve(cwd, currentDir);
  const absolutePreviousDir = path.resolve(cwd, previousDir);

  // Validate directories exist
  if (!existsSync(absoluteCurrentDir)) {
    console.error(`current directory does not exist: ${currentDir}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!statSync(absoluteCurrentDir).isDirectory()) {
    console.error(`current path is not a directory: ${currentDir}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!existsSync(absolutePreviousDir)) {
    console.error(`previous directory does not exist: ${previousDir}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!statSync(absolutePreviousDir).isDirectory()) {
    console.error(`previous path is not a directory: ${previousDir}`);
    return options.EXIT.USAGE_ERROR;
  }

  // Load artifacts
  const currentFindings = loadFindings(absoluteCurrentDir);
  const previousFindings = loadFindings(absolutePreviousDir);

  if (!currentFindings) {
    console.error(`no findings.json found in current directory: ${currentDir}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!previousFindings) {
    console.error(`no findings.json found in previous directory: ${previousDir}`);
    return options.EXIT.USAGE_ERROR;
  }

  // Get run references
  const currentRun = getRunReference(absoluteCurrentDir);
  const previousRun = getRunReference(absolutePreviousDir);

  if (!currentRun || !previousRun) {
    console.error("failed to load run references");
    return options.EXIT.INTERNAL_ERROR;
  }

  // Compare findings
  const findingsComparison = compareFindings(
    currentFindings,
    previousFindings,
    DEFAULT_REGRESSION_CONFIG
  );

  // Compare risks if available
  const currentRisks = loadRisks(absoluteCurrentDir);
  const previousRisks = loadRisks(absolutePreviousDir);
  const risksComparison = currentRisks && previousRisks
    ? compareRisks(currentRisks, previousRisks)
    : undefined;

  // Compare readiness if available
  const currentReadiness = loadReadiness(absoluteCurrentDir);
  const previousReadiness = loadReadiness(absolutePreviousDir);
  const readinessComparison = currentReadiness && previousReadiness
    ? compareReadiness(currentReadiness, previousReadiness) ?? undefined
    : undefined;

  // Load trend history if history directory is provided
  let trendHistory: RiskTrendPoint[] | undefined;
  if (historyDir) {
    const absoluteHistoryDir = path.resolve(cwd, historyDir);
    if (existsSync(absoluteHistoryDir)) {
      trendHistory = loadTrendHistory(absoluteHistoryDir, currentRun.generated_at);
    }
  }

  // Generate historical report
  const report = generateHistoricalReport(
    currentRun,
    previousRun,
    findingsComparison,
    risksComparison,
    readinessComparison,
    trendHistory
  );

  // Generate regression report for additional insights
  const regressionReport = generateRegressionReport(
    findingsComparison.new,
    findingsComparison.resolved,
    findingsComparison.unchanged,
    findingsComparison.modified,
    DEFAULT_REGRESSION_CONFIG
  );

  // Determine output path
  const outputPath = outFile
    ? path.resolve(cwd, outFile)
    : path.join(absoluteCurrentDir, "historical-comparison.json");

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Write report
  writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  // Output summary
  const summary = {
    tool: "code-to-gate",
    command: "historical",
    run_id: report.run_id,
    current_run: currentRun.run_id,
    previous_run: previousRun.run_id,
    output: path.relative(cwd, outputPath),
    findings: {
      new: findingsComparison.summary.newCount,
      resolved: findingsComparison.summary.resolvedCount,
      unchanged: findingsComparison.summary.unchangedCount,
      modified: findingsComparison.summary.modifiedCount,
      regressions: findingsComparison.summary.regressionCount,
    },
    trend: {
      direction: report.riskTrends.trendDirection,
      score: report.riskTrends.trendScore,
      critical_trend: report.riskTrends.criticalTrend,
      high_trend: report.riskTrends.highTrend,
    },
    recommendations: report.recommendations,
  };

  console.log(JSON.stringify(summary, null, 2));

  // Return exit code based on regressions
  if (findingsComparison.regressions.length > 0) {
    const hasCriticalRegression = findingsComparison.regressions.some(
      r => r.severity === "critical"
    );
    if (hasCriticalRegression) {
      return options.EXIT.READINESS_NOT_CLEAR;
    }
  }

  return options.EXIT.OK;
}