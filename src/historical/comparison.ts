/**
 * Artifact comparison between runs
 *
 * Compares findings, risks, and readiness status between current and previous runs
 * Identifies new, resolved, unchanged, and modified items
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  FindingsComparisonResult,
  RisksComparisonResult,
  ReadinessComparisonResult,
  FindingComparison,
  RiskComparison,
  RiskTrendAnalysis,
  RiskTrendPoint,
  HistoricalSummaryReport,
  RunReference,
} from "./types.js";
import {
  Finding,
  FindingsArtifact,
  RiskSeed,
  RiskRegisterArtifact,
  ReleaseReadinessArtifact,
  Severity,
  FindingCategory,
  CTG_VERSION,
} from "../types/artifacts.js";
import { detectRegressions, generateRegressionReport, RegressionConfig } from "./regression.js";

/**
 * Load findings artifact from a directory
 */
export function loadFindings(artifactDir: string): FindingsArtifact | null {
  const findingsPath = path.join(artifactDir, "findings.json");

  if (!existsSync(findingsPath)) {
    return null;
  }

  try {
    const content = readFileSync(findingsPath, "utf8");
    return JSON.parse(content) as FindingsArtifact;
  } catch (error) {
    console.error(`Failed to load findings from ${findingsPath}: ${error}`);
    return null;
  }
}

/**
 * Load risk register artifact from a directory
 */
export function loadRisks(artifactDir: string): RiskRegisterArtifact | null {
  const risksPath = path.join(artifactDir, "risk-register.yaml");

  if (!existsSync(risksPath)) {
    // Try JSON version
    const risksJsonPath = path.join(artifactDir, "risk-register.json");
    if (existsSync(risksJsonPath)) {
      try {
        return JSON.parse(readFileSync(risksJsonPath, "utf8")) as RiskRegisterArtifact;
      } catch {
        return null;
      }
    }
    return null;
  }

  try {
    const content = readFileSync(risksPath, "utf8");
    // Basic YAML parsing - simplified for JSON-like YAML
    return parseYamlLike(content) as RiskRegisterArtifact;
  } catch {
    return null;
  }
}

/**
 * Load release readiness artifact from a directory
 */
export function loadReadiness(artifactDir: string): ReleaseReadinessArtifact | null {
  const readinessPath = path.join(artifactDir, "release-readiness.json");

  if (!existsSync(readinessPath)) {
    return null;
  }

  try {
    const content = readFileSync(readinessPath, "utf8");
    return JSON.parse(content) as ReleaseReadinessArtifact;
  } catch {
    return null;
  }
}

/**
 * Discover historical runs from a directory containing artifact directories
 */
export function discoverHistoricalRuns(historyDir: string): RunReference[] {
  if (!existsSync(historyDir)) {
    return [];
  }

  const runs: RunReference[] = [];

  try {
    const entries = readdirSync(historyDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const artifactDir = path.join(historyDir, entry.name);
      const runRef = getRunReference(artifactDir);

      if (runRef) {
        runs.push(runRef);
      }
    }
  } catch {
    return [];
  }

  // Sort by generated_at timestamp (newest first)
  runs.sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime());

  return runs;
}

/**
 * Get run reference from artifact directory (internal helper)
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
 * Compare findings between two runs
 */
export function compareFindings(
  currentFindings: FindingsArtifact | null,
  previousFindings: FindingsArtifact | null,
  regressionConfig?: RegressionConfig
): FindingsComparisonResult {
  const currentList = currentFindings?.findings ?? [];
  const previousList = previousFindings?.findings ?? [];

  const newFindings: FindingComparison[] = [];
  const resolvedFindings: FindingComparison[] = [];
  const unchangedFindings: FindingComparison[] = [];
  const modifiedFindings: FindingComparison[] = [];

  // Build lookup maps for previous findings
  const previousByRuleIdPath = buildFindingLookupMap(previousList, "ruleId_path");
  const previousByRuleIdSymbol = buildFindingLookupMap(previousList, "ruleId_symbol");

  // Track matched previous findings
  const matchedPreviousIds = new Set<string>();

  // Process current findings
  for (const current of currentList) {
    const path = getFindingPrimaryPath(current);
    const symbols = current.affectedSymbols ?? [];

    // Try to match by ruleId + path first
    const keyPath = `${current.ruleId}:${path}`;
    const matchedByPath = takeNextFinding(previousByRuleIdPath, keyPath, matchedPreviousIds);

    // Try to match by ruleId + symbol
    let matchedBySymbol: Finding | undefined;
    for (const symbol of symbols) {
      const keySymbol = `${current.ruleId}:${symbol}`;
      const found = takeNextFinding(previousByRuleIdSymbol, keySymbol, matchedPreviousIds);
      if (found) {
        matchedBySymbol = found;
        break;
      }
    }

    const previousMatch = matchedByPath ?? matchedBySymbol;
    const matchedOn = matchedByPath ? "ruleId_path" : matchedBySymbol ? "ruleId_symbol" : "fuzzy_match";

    if (previousMatch) {
      matchedPreviousIds.add(previousMatch.id);

      // Check if modified (severity or other attributes changed)
      const isModified =
        current.severity !== previousMatch.severity ||
        current.confidence !== previousMatch.confidence ||
        current.category !== previousMatch.category;

      const comparison: FindingComparison = {
        findingId: current.id,
        ruleId: current.ruleId,
        status: isModified ? "modified" : "unchanged",
        currentFinding: current,
        previousFinding: previousMatch,
        path,
        severity: current.severity,
        category: current.category,
        matchedOn,
      };

      if (isModified) {
        modifiedFindings.push(comparison);
      } else {
        unchangedFindings.push(comparison);
      }
    } else {
      // New finding (not matched in previous)
      newFindings.push({
        findingId: current.id,
        ruleId: current.ruleId,
        status: "new",
        currentFinding: current,
        path,
        severity: current.severity,
        category: current.category,
        matchedOn: "fuzzy_match",
      });
    }
  }

  // Find resolved findings (in previous but not matched with current)
  for (const previous of previousList) {
    if (!matchedPreviousIds.has(previous.id)) {
      resolvedFindings.push({
        findingId: previous.id,
        ruleId: previous.ruleId,
        status: "resolved",
        previousFinding: previous,
        path: getFindingPrimaryPath(previous),
        severity: previous.severity,
        category: previous.category,
        matchedOn: "fuzzy_match",
      });
    }
  }

  // Detect regressions
  const regressions = detectRegressions(
    newFindings,
    resolvedFindings,
    unchangedFindings,
    regressionConfig
  );

  // Build summary
  const summary = buildFindingsSummary(
    currentList.length,
    previousList.length,
    newFindings,
    resolvedFindings,
    unchangedFindings,
    modifiedFindings,
    regressions
  );

  return {
    new: newFindings,
    resolved: resolvedFindings,
    unchanged: unchangedFindings,
    modified: modifiedFindings,
    regressions,
    summary,
  };
}

/**
 * Compare risks between two runs
 */
export function compareRisks(
  currentRisks: RiskRegisterArtifact | null,
  previousRisks: RiskRegisterArtifact | null
): RisksComparisonResult {
  const currentList = currentRisks?.risks ?? [];
  const previousList = previousRisks?.risks ?? [];

  const newRisks: RiskComparison[] = [];
  const resolvedRisks: RiskComparison[] = [];
  const unchangedRisks: RiskComparison[] = [];
  const evolvedRisks: RiskComparison[] = [];

  // Build lookup for previous risks
  const previousByTitle = new Map<string, RiskSeed>();
  const previousBySourceFindings = new Map<string, RiskSeed>();

  for (const risk of previousList) {
    // Normalize title for matching
    const normalizedTitle = normalizeTitle(risk.title);
    previousByTitle.set(normalizedTitle, risk);

    // Map by source findings
    for (const sourceId of risk.sourceFindingIds) {
      previousBySourceFindings.set(sourceId, risk);
    }
  }

  const matchedPreviousIds = new Set<string>();

  // Process current risks
  for (const current of currentList) {
    let previousMatch: RiskSeed | undefined;
    let matchedOn: "title_similarity" | "source_findings" | "manual" = "title_similarity";

    // Try matching by source findings
    for (const sourceId of current.sourceFindingIds) {
      const found = previousBySourceFindings.get(sourceId);
      if (found) {
        previousMatch = found;
        matchedOn = "source_findings";
        break;
      }
    }

    // Try matching by title similarity
    if (!previousMatch) {
      const normalizedTitle = normalizeTitle(current.title);
      previousMatch = previousByTitle.get(normalizedTitle);
    }

    if (previousMatch) {
      matchedPreviousIds.add(previousMatch.id);

      // Check if evolved (severity or likelihood changed)
      const isEvolved =
        current.severity !== previousMatch.severity ||
        current.likelihood !== previousMatch.likelihood;

      const comparison: RiskComparison = {
        riskId: current.id,
        title: current.title,
        status: isEvolved ? "evolved" : "unchanged",
        currentRisk: current,
        previousRisk: previousMatch,
        severity: current.severity,
        likelihood: current.likelihood,
        matchedOn,
      };

      if (isEvolved) {
        evolvedRisks.push(comparison);
      } else {
        unchangedRisks.push(comparison);
      }
    } else {
      newRisks.push({
        riskId: current.id,
        title: current.title,
        status: "new",
        currentRisk: current,
        severity: current.severity,
        likelihood: current.likelihood,
        matchedOn: "title_similarity",
      });
    }
  }

  // Find resolved risks
  for (const previous of previousList) {
    if (!matchedPreviousIds.has(previous.id)) {
      resolvedRisks.push({
        riskId: previous.id,
        title: previous.title,
        status: "resolved",
        previousRisk: previous,
        severity: previous.severity,
        likelihood: previous.likelihood,
        matchedOn: "title_similarity",
      });
    }
  }

  return {
    new: newRisks,
    resolved: resolvedRisks,
    unchanged: unchangedRisks,
    evolved: evolvedRisks,
    summary: {
      totalCurrent: currentList.length,
      totalPrevious: previousList.length,
      newCount: newRisks.length,
      resolvedCount: resolvedRisks.length,
      unchangedCount: unchangedRisks.length,
      evolvedCount: evolvedRisks.length,
    },
  };
}

/**
 * Compare release readiness between two runs
 */
export function compareReadiness(
  currentReadiness: ReleaseReadinessArtifact | null,
  previousReadiness: ReleaseReadinessArtifact | null
): ReadinessComparisonResult | null {
  if (!currentReadiness || !previousReadiness) {
    return null;
  }

  const currentMetrics = currentReadiness.metrics;
  const previousMetrics = previousReadiness.metrics;

  const statusChanged = currentReadiness.status !== previousReadiness.status;
  const statusOrder = ["passed", "passed_with_risk", "needs_review", "blocked"];
  const currentStatusIndex = statusOrder.indexOf(currentReadiness.status);
  const previousStatusIndex = statusOrder.indexOf(previousReadiness.status);
  const statusImproved = currentStatusIndex < previousStatusIndex;
  const statusDegraded = currentStatusIndex > previousStatusIndex;

  return {
    currentStatus: currentReadiness.status,
    previousStatus: previousReadiness.status,
    statusChanged,
    statusImproved,
    statusDegraded,
    metricsComparison: {
      criticalFindings: {
        current: currentMetrics.criticalFindings,
        previous: previousMetrics.criticalFindings,
        change: currentMetrics.criticalFindings - previousMetrics.criticalFindings,
      },
      highFindings: {
        current: currentMetrics.highFindings,
        previous: previousMetrics.highFindings,
        change: currentMetrics.highFindings - previousMetrics.highFindings,
      },
      mediumFindings: {
        current: currentMetrics.mediumFindings,
        previous: previousMetrics.mediumFindings,
        change: currentMetrics.mediumFindings - previousMetrics.mediumFindings,
      },
      lowFindings: {
        current: currentMetrics.lowFindings,
        previous: previousMetrics.lowFindings,
        change: currentMetrics.lowFindings - previousMetrics.lowFindings,
      },
      riskCount: {
        current: currentMetrics.riskCount,
        previous: previousMetrics.riskCount,
        change: currentMetrics.riskCount - previousMetrics.riskCount,
      },
      testSeedCount: {
        current: currentMetrics.testSeedCount,
        previous: previousMetrics.testSeedCount,
        change: currentMetrics.testSeedCount - previousMetrics.testSeedCount,
      },
    },
  };
}

/**
 * Analyze risk trends from historical comparison
 */
export function analyzeRiskTrends(
  findingsComparison: FindingsComparisonResult,
  readinessComparison: ReadinessComparisonResult | null | undefined,
  historyPoints?: RiskTrendPoint[]
): RiskTrendAnalysis {
  const summary = findingsComparison.summary;

  // Calculate trend direction
  const newCritical = summary.bySeverity.critical?.new ?? 0;
  const resolvedCritical = summary.bySeverity.critical?.resolved ?? 0;
  const criticalChange = resolvedCritical - newCritical;

  const newHigh = summary.bySeverity.high?.new ?? 0;
  const resolvedHigh = summary.bySeverity.high?.resolved ?? 0;
  const highChange = resolvedHigh - newHigh;

  const totalChange = summary.resolvedCount - summary.newCount;

  // Calculate trend score (-1 to 1)
  let trendScore = 0;
  if (summary.totalPrevious > 0) {
    trendScore = totalChange / summary.totalPrevious;
    // Weight critical/high more heavily
    trendScore += (criticalChange * 0.3 + highChange * 0.2) / Math.max(summary.totalPrevious, 1);
  }

  const trendDirection =
    trendScore > 0.1 ? "improving" :
    trendScore < -0.1 ? "degrading" :
    "stable";

  const criticalTrend =
    criticalChange > 0 ? "decreasing" :
    criticalChange < 0 ? "increasing" :
    "stable";

  const highTrend =
    highChange > 0 ? "decreasing" :
    highChange < 0 ? "increasing" :
    "stable";

  // Calculate risk score change
  const severityWeights: Record<Severity, number> = {
    critical: 10,
    high: 5,
    medium: 2,
    low: 1,
  };

  let previousRiskScore = 0;
  let currentRiskScore = 0;

  for (const sev of ["critical", "high", "medium", "low"] as Severity[]) {
    previousRiskScore += (summary.bySeverity[sev]?.unchanged ?? 0) * severityWeights[sev];
    previousRiskScore += (summary.bySeverity[sev]?.resolved ?? 0) * severityWeights[sev];
    currentRiskScore += (summary.bySeverity[sev]?.unchanged ?? 0) * severityWeights[sev];
    currentRiskScore += (summary.bySeverity[sev]?.new ?? 0) * severityWeights[sev];
  }

  const riskScoreChange = currentRiskScore - previousRiskScore;

  // Calculate period if history points are provided
  let periodDays: number | undefined;
  if (historyPoints && historyPoints.length >= 2) {
    const first = new Date(historyPoints[0].generated_at);
    const last = new Date(historyPoints[historyPoints.length - 1].generated_at);
    periodDays = Math.round((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
  }

  return {
    trendDirection,
    trendScore,
    criticalTrend,
    highTrend,
    riskScoreChange,
    periodDays,
    historyPoints,
  };
}

/**
 * Generate historical summary report
 */
export function generateHistoricalReport(
  currentRun: RunReference,
  previousRun: RunReference,
  findingsComparison: FindingsComparisonResult,
  risksComparison?: RisksComparisonResult,
  readinessComparison?: ReadinessComparisonResult,
  trendHistory?: RiskTrendPoint[]
): HistoricalSummaryReport {
  const now = new Date().toISOString();
  const runId = `historical-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}`;

  const riskTrends = analyzeRiskTrends(findingsComparison, readinessComparison, trendHistory);

  // Generate recommendations
  const recommendations = generateRecommendations(
    findingsComparison,
    risksComparison,
    readinessComparison,
    riskTrends
  );

  return {
    version: CTG_VERSION,
    generated_at: now,
    run_id: runId,
    repo: {
      root: currentRun.artifact_dir,
      revision: currentRun.repo_revision,
      branch: currentRun.branch,
    },
    tool: {
      name: "code-to-gate",
      version: "0.2.0",
      plugin_versions: [],
    },
    artifact: "historical-comparison",
    schema: "historical-comparison@v1",
    completeness: "complete",
    currentRun,
    previousRun,
    findingsComparison,
    risksComparison,
    readinessComparison,
    riskTrends,
    recommendations,
    generated_by: "ctg-historical-v1",
  };
}

/**
 * Generate recommendations based on comparison results
 */
function generateRecommendations(
  findingsComparison: FindingsComparisonResult,
  risksComparison?: RisksComparisonResult,
  readinessComparison?: ReadinessComparisonResult,
  riskTrends?: RiskTrendAnalysis
): string[] {
  const recommendations: string[] = [];

  // Regression recommendations
  if (findingsComparison.regressions.length > 0) {
    recommendations.push(
      `Address ${findingsComparison.regressions.length} regression(s) detected. Prioritize resolving findings that reappeared after being fixed.`
    );
  }

  // New findings recommendations
  if (findingsComparison.new.length > 0) {
    const criticalNew = findingsComparison.new.filter(f => f.severity === "critical").length;
    const highNew = findingsComparison.new.filter(f => f.severity === "high").length;
    if (criticalNew > 0) {
      recommendations.push(`Investigate ${criticalNew} new critical finding(s) before release.`);
    }
    if (highNew > 0) {
      recommendations.push(`Review ${highNew} new high severity finding(s) for security impact.`);
    }
  }

  // Trend recommendations
  if (riskTrends?.trendDirection === "degrading") {
    recommendations.push(
      "Quality trend is degrading. Consider additional code review or testing before release."
    );
  }

  // Readiness recommendations
  if (readinessComparison?.statusDegraded) {
    recommendations.push(
      `Readiness status degraded from ${readinessComparison.previousStatus} to ${readinessComparison.currentStatus}. Review blockers and warnings.`
    );
  }

  // Risk recommendations
  if (risksComparison?.new && risksComparison.new.length > 0) {
    recommendations.push(
      `${risksComparison.new.length} new risk(s) identified. Evaluate impact and add mitigations.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("No critical issues detected. Continue monitoring quality metrics.");
  }

  return recommendations;
}

// === Helper Functions ===

/**
 * Build lookup map for findings
 */
function buildFindingLookupMap(
  findings: Finding[],
  keyType: "ruleId_path" | "ruleId_symbol"
): Map<string, Finding[]> {
  const map = new Map<string, Finding[]>();

  for (const finding of findings) {
    if (keyType === "ruleId_path") {
      const path = getFindingPrimaryPath(finding);
      const key = `${finding.ruleId}:${path}`;
      appendFinding(map, key, finding);
    } else {
      for (const symbol of finding.affectedSymbols ?? []) {
        const key = `${finding.ruleId}:${symbol}`;
        appendFinding(map, key, finding);
      }
    }
  }

  return map;
}

function appendFinding(map: Map<string, Finding[]>, key: string, finding: Finding): void {
  const entries = map.get(key);
  if (entries) {
    entries.push(finding);
  } else {
    map.set(key, [finding]);
  }
}

function takeNextFinding(
  map: Map<string, Finding[]>,
  key: string,
  alreadyMatchedIds: Set<string>
): Finding | undefined {
  const entries = map.get(key);
  if (!entries) {
    return undefined;
  }

  const index = entries.findIndex((finding) => !alreadyMatchedIds.has(finding.id));
  if (index === -1) {
    return undefined;
  }

  return entries.splice(index, 1)[0];
}

/**
 * Get primary path from finding evidence
 */
function getFindingPrimaryPath(finding: Finding): string {
  if (finding.evidence.length > 0) {
    return finding.evidence[0].path;
  }
  return "";
}

/**
 * Build findings comparison summary
 */
function buildFindingsSummary(
  totalCurrent: number,
  totalPrevious: number,
  newFindings: FindingComparison[],
  resolvedFindings: FindingComparison[],
  unchangedFindings: FindingComparison[],
  modifiedFindings: FindingComparison[],
  regressions: FindingComparison[]
): FindingsComparisonResult["summary"] {
  const bySeverity: Record<Severity, { new: number; resolved: number; unchanged: number }> = {
    critical: { new: 0, resolved: 0, unchanged: 0 },
    high: { new: 0, resolved: 0, unchanged: 0 },
    medium: { new: 0, resolved: 0, unchanged: 0 },
    low: { new: 0, resolved: 0, unchanged: 0 },
  };

  const byCategory: Record<FindingCategory, { new: number; resolved: number; unchanged: number }> = {
    auth: { new: 0, resolved: 0, unchanged: 0 },
    payment: { new: 0, resolved: 0, unchanged: 0 },
    validation: { new: 0, resolved: 0, unchanged: 0 },
    data: { new: 0, resolved: 0, unchanged: 0 },
    config: { new: 0, resolved: 0, unchanged: 0 },
    maintainability: { new: 0, resolved: 0, unchanged: 0 },
    testing: { new: 0, resolved: 0, unchanged: 0 },
    compatibility: { new: 0, resolved: 0, unchanged: 0 },
    "release-risk": { new: 0, resolved: 0, unchanged: 0 },
    security: { new: 0, resolved: 0, unchanged: 0 },
  };

  for (const f of newFindings) {
    bySeverity[f.severity].new++;
    byCategory[f.category].new++;
  }

  for (const f of resolvedFindings) {
    bySeverity[f.severity].resolved++;
    byCategory[f.category].resolved++;
  }

  for (const f of unchangedFindings) {
    bySeverity[f.severity].unchanged++;
    byCategory[f.category].unchanged++;
  }

  return {
    totalCurrent,
    totalPrevious,
    newCount: newFindings.length,
    resolvedCount: resolvedFindings.length,
    unchangedCount: unchangedFindings.length,
    modifiedCount: modifiedFindings.length,
    regressionCount: regressions.length,
    bySeverity,
    byCategory,
  };
}

/**
 * Normalize title for matching
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Simple YAML-like parser
 */
function parseYamlLike(content: string): unknown {
  let cleaned = content.replace(/^---\s*\n/, "").replace(/\n---\s*$/, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    const lines = cleaned.split("\n");
    const result: Record<string, unknown> = {};

    for (const line of lines) {
      const trimmed = line.trimEnd();
      if (trimmed === "" || trimmed.startsWith("#")) continue;

      const colonMatch = trimmed.match(/^(\w+):\s*(.*)$/);
      if (colonMatch) {
        const key = colonMatch[1];
        const value = colonMatch[2].trim();

        if (value === "") continue;

        if (value.startsWith("[") || value.startsWith("{")) {
          try {
            result[key] = JSON.parse(value);
          } catch {
            result[key] = value;
          }
        } else if (value.startsWith('"') && value.endsWith('"')) {
          result[key] = value.slice(1, -1);
        } else if (value === "null" || value === "true" || value === "false") {
          result[key] = value === "null" ? null : value === "true";
        } else if (!isNaN(Number(value))) {
          result[key] = Number(value);
        } else {
          result[key] = value;
        }
      }
    }

    return result;
  }
}
