/**
 * Artifact comparison between runs
 *
 * Compares findings, risks, and readiness status between current and previous runs
 * Identifies new, resolved, unchanged, and modified items
 */

import {
  FindingsComparisonResult,
  RisksComparisonResult,
  ReadinessComparisonResult,
  FindingComparison,
  RiskComparison,
  type _RiskTrendAnalysis,
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
  type _Severity,
  CTG_VERSION,
} from "../types/artifacts.js";
import { detectRegressions, type _generateRegressionReport, RegressionConfig } from "./regression.js";
import { buildFingerprintLookupMap } from "../utils/fingerprint.js";
import {
  type _loadFindings,
  type _loadRisks,
  type _loadReadiness,
  type _discoverHistoricalRuns,
  buildFindingLookupMap,
  takeNextFinding,
  getFindingPrimaryPath,
  buildFindingsSummary,
  normalizeTitle,
  analyzeRiskTrends,
  generateRecommendations,
} from "./comparison-utils.js";

// Re-export loader functions for external use
export { loadFindings, loadRisks, loadReadiness, discoverHistoricalRuns, analyzeRiskTrends } from "./comparison-utils.js";

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
  // Priority: fingerprint > ruleId_path > ruleId_symbol
  const previousByFingerprint = buildFingerprintLookupMap(previousList);
  const previousByRuleIdPath = buildFindingLookupMap(previousList, "ruleId_path");
  const previousByRuleIdSymbol = buildFindingLookupMap(previousList, "ruleId_symbol");

  // Track matched previous findings
  const matchedPreviousIds = new Set<string>();

  // Process current findings
  for (const current of currentList) {
    const path = getFindingPrimaryPath(current);
    const symbols = current.affectedSymbols ?? [];

    // Try to match by fingerprint first (most stable)
    let previousMatch: Finding | undefined;
    let matchedOn: "fingerprint" | "ruleId_path" | "ruleId_symbol" | "fuzzy_match" = "fingerprint";

    if (current.fingerprint) {
      previousMatch = previousByFingerprint.get(current.fingerprint);
      if (previousMatch && !matchedPreviousIds.has(previousMatch.id)) {
        matchedOn = "fingerprint";
      } else {
        previousMatch = undefined;
      }
    }

    // Fallback: try to match by ruleId + path
    if (!previousMatch) {
      const keyPath = `${current.ruleId}:${path}`;
      previousMatch = takeNextFinding(previousByRuleIdPath, keyPath, matchedPreviousIds);
      if (previousMatch) {
        matchedOn = "ruleId_path";
      }
    }

    // Fallback: try to match by ruleId + symbol
    if (!previousMatch) {
      for (const symbol of symbols) {
        const keySymbol = `${current.ruleId}:${symbol}`;
        const found = takeNextFinding(previousByRuleIdSymbol, keySymbol, matchedPreviousIds);
        if (found) {
          previousMatch = found;
          matchedOn = "ruleId_symbol";
          break;
        }
      }
    }

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
