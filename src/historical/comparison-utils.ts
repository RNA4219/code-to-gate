/**
 * Comparison Utilities - Loaders and helper functions for artifact comparison
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  RunReference,
  FindingComparison,
  FindingsComparisonResult,
  RisksComparisonResult,
  ReadinessComparisonResult,
  RiskTrendAnalysis,
  RiskTrendPoint,
} from "./types.js";
import {
  Finding,
  FindingsArtifact,
  RiskSeed,
  RiskRegisterArtifact,
  ReleaseReadinessArtifact,
  Severity,
  FindingCategory,
} from "../types/artifacts.js";
import { buildFingerprintLookupMap } from "../utils/fingerprint.js";

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
      } catch (e) {
        console.error(`[comparison-utils] Failed to parse risks JSON from ${risksJsonPath}: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    }
    return null;
  }

  try {
    const content = readFileSync(risksPath, "utf8");
    // Basic YAML parsing - simplified for JSON-like YAML
    return parseYamlLike(content) as RiskRegisterArtifact;
  } catch (e) {
    console.error(`[comparison-utils] Failed to parse risks YAML from ${risksPath}: ${e instanceof Error ? e.message : String(e)}`);
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
  } catch (e) {
    console.error(`[comparison-utils] Failed to load readiness from ${readinessPath}: ${e instanceof Error ? e.message : String(e)}`);
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
  } catch (e) {
    console.error(`[comparison-utils] Failed to discover historical runs in ${historyDir}: ${e instanceof Error ? e.message : String(e)}`);
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
 * Build lookup map for findings using fingerprint
 */
export function buildFingerprintMap(findings: Finding[]): Map<string, Finding> {
  return buildFingerprintLookupMap(findings);
}

/**
 * Build lookup map for findings
 */
export function buildFindingLookupMap(
  findings: Finding[],
  keyType: "ruleId_path" | "ruleId_symbol"
): Map<string, Finding[]> {
  const map = new Map<string, Finding[]>();

  for (const finding of findings) {
    if (keyType === "ruleId_path") {
      const filePath = getFindingPrimaryPath(finding);
      const key = `${finding.ruleId}:${filePath}`;
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

export function takeNextFinding(
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
export function getFindingPrimaryPath(finding: Finding): string {
  if (finding.evidence.length > 0) {
    return finding.evidence[0].path;
  }
  return "";
}

/**
 * Build findings comparison summary
 */
export function buildFindingsSummary(
  totalCurrent: number,
  totalPrevious: number,
  newFindings: FindingComparison[],
  resolvedFindings: FindingComparison[],
  unchangedFindings: FindingComparison[],
  modifiedFindings: FindingComparison[],
  regressions: FindingComparison[]
): {
  totalCurrent: number;
  totalPrevious: number;
  newCount: number;
  resolvedCount: number;
  unchangedCount: number;
  modifiedCount: number;
  regressionCount: number;
  bySeverity: Record<Severity, { new: number; resolved: number; unchanged: number }>;
  byCategory: Record<FindingCategory, { new: number; resolved: number; unchanged: number }>;
} {
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
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Simple YAML-like parser
 */
export function parseYamlLike(content: string): unknown {
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
 * Generate recommendations based on comparison results
 */
export function generateRecommendations(
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