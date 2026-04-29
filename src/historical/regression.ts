/**
 * Regression detection for historical comparison
 *
 * Detects:
 * - Regressions: Findings that reappear after being resolved
 * - Reintroduced findings: Same ruleId on same path that was previously resolved
 * - Severity escalations: Unchanged findings that increased in severity
 */

import {
  FindingComparison,
  RegressionConfig,
  RegressionReport,
} from "./types.js";
import { Severity, Finding } from "../types/artifacts.js";

// Re-export RegressionConfig for convenience
export { RegressionConfig } from "./types.js";

/**
 * Default regression configuration
 */
export const DEFAULT_REGRESSION_CONFIG: RegressionConfig = {
  detectRegressions: true,
  severityThreshold: "medium",
  pathMatchRequired: true,
  allowResolvedThenReintroduced: true,
};

/**
 * Detect regressions from comparison results
 *
 * A regression is defined as:
 * 1. A finding with the same ruleId on the same path that was previously resolved
 * 2. A finding that was unchanged but severity increased
 * 3. A finding matching specific regression rules
 */
export function detectRegressions(
  newFindings: FindingComparison[],
  resolvedFindings: FindingComparison[],
  unchangedFindings: FindingComparison[],
  config?: RegressionConfig
): FindingComparison[] {
  const effectiveConfig = config ?? DEFAULT_REGRESSION_CONFIG;

  if (!effectiveConfig.detectRegressions) {
    return [];
  }

  const regressions: FindingComparison[] = [];

  // Severity order for threshold comparison
  const severityOrder: Severity[] = ["low", "medium", "high", "critical"];

  // Build map of resolved findings by ruleId + path
  const resolvedByRuleIdPath = new Map<string, FindingComparison>();
  for (const resolved of resolvedFindings) {
    const key = `${resolved.ruleId}:${resolved.path}`;
    resolvedByRuleIdPath.set(key, resolved);
  }

  // Check new findings for regressions (reintroduced)
  for (const newFinding of newFindings) {
    const key = `${newFinding.ruleId}:${newFinding.path}`;
    const wasResolved = resolvedByRuleIdPath.get(key);

    if (wasResolved && effectiveConfig.allowResolvedThenReintroduced) {
      // This finding was resolved and is now back - regression
      const severityThresholdIndex = severityOrder.indexOf(
        effectiveConfig.severityThreshold ?? "medium"
      );
      const findingSeverityIndex = severityOrder.indexOf(newFinding.severity);

      // Only count as regression if severity meets threshold
      if (findingSeverityIndex >= severityThresholdIndex) {
        regressions.push({
          ...newFinding,
          regression: true,
          status: "new",
        });
      }
    }

    // Check if it's a specific regression rule
    if (effectiveConfig.regressionRules?.includes(newFinding.ruleId)) {
      regressions.push({
        ...newFinding,
        regression: true,
        status: "new",
      });
    }
  }

  // Check unchanged findings for severity escalations
  for (const unchanged of unchangedFindings) {
    if (!unchanged.currentFinding || !unchanged.previousFinding) continue;

    const currentSeverityIndex = severityOrder.indexOf(unchanged.currentFinding.severity);
    const previousSeverityIndex = severityOrder.indexOf(unchanged.previousFinding.severity);

    if (currentSeverityIndex > previousSeverityIndex) {
      // Severity increased - this is a regression
      regressions.push({
        ...unchanged,
        regression: true,
        status: "modified",
      });
    }
  }

  return regressions;
}

/**
 * Generate a detailed regression report
 */
export function generateRegressionReport(
  newFindings: FindingComparison[],
  resolvedFindings: FindingComparison[],
  unchangedFindings: FindingComparison[],
  modifiedFindings: FindingComparison[],
  config?: RegressionConfig
): RegressionReport {
  const effectiveConfig = config ?? DEFAULT_REGRESSION_CONFIG;

  // Detect regressions
  const regressions = detectRegressions(newFindings, resolvedFindings, unchangedFindings, effectiveConfig);

  // Find potential regressions (same ruleId but different path)
  const potentialRegressions: FindingComparison[] = [];
  const resolvedRuleIds = new Set(resolvedFindings.map(f => f.ruleId));

  for (const newFinding of newFindings) {
    if (resolvedRuleIds.has(newFinding.ruleId) && !regressions.includes(newFinding)) {
      // Same ruleId but different path - potential regression
      potentialRegressions.push({
        ...newFinding,
        regression: false,
      });
    }
  }

  // Find reintroduced findings
  const reintroducedFindings: FindingComparison[] = [];
  const resolvedByRuleIdPath = new Map<string, FindingComparison>();

  for (const resolved of resolvedFindings) {
    const key = `${resolved.ruleId}:${resolved.path}`;
    resolvedByRuleIdPath.set(key, resolved);
  }

  for (const newFinding of newFindings) {
    const key = `${newFinding.ruleId}:${newFinding.path}`;
    if (resolvedByRuleIdPath.has(key)) {
      reintroducedFindings.push({
        ...newFinding,
        regression: true,
      });
    }
  }

  // Build by-ruleId summary
  const byRuleId: Record<string, number> = {};
  for (const regression of regressions) {
    byRuleId[regression.ruleId] = (byRuleId[regression.ruleId] ?? 0) + 1;
  }

  // Generate recommendations
  const recommendations: string[] = [];

  if (regressions.length > 0) {
    recommendations.push(
      `${regressions.length} regression(s) detected. These findings were previously resolved but have reappeared.`
    );

    // Prioritize by severity
    const criticalRegressions = regressions.filter(r => r.severity === "critical");
    const highRegressions = regressions.filter(r => r.severity === "high");

    if (criticalRegressions.length > 0) {
      recommendations.push(
        `Critical: ${criticalRegressions.length} critical regression(s) require immediate attention.`
      );
    }
    if (highRegressions.length > 0) {
      recommendations.push(
        `High priority: ${highRegressions.length} high severity regression(s) should be fixed before release.`
      );
    }
  }

  if (potentialRegressions.length > 0) {
    recommendations.push(
      `${potentialRegressions.length} potential regression(s) detected. Same rule triggered on different path than previously resolved finding.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("No regressions detected. Code quality is stable or improving.");
  }

  return {
    regressions,
    potentialRegressions,
    reintroducedFindings,
    summary: {
      regressionCount: regressions.length,
      potentialRegressionCount: potentialRegressions.length,
      reintroducedCount: reintroducedFindings.length,
      byRuleId,
    },
    recommendations,
  };
}

/**
 * Check if a finding is a regression
 */
export function isRegression(
  finding: FindingComparison,
  resolvedFindings: FindingComparison[],
  config?: RegressionConfig
): boolean {
  const effectiveConfig = config ?? DEFAULT_REGRESSION_CONFIG;

  if (!effectiveConfig.detectRegressions) {
    return false;
  }

  // Check if same ruleId + path was previously resolved
  const key = `${finding.ruleId}:${finding.path}`;
  const wasResolved = resolvedFindings.some(r => `${r.ruleId}:${r.path}` === key);

  if (wasResolved && effectiveConfig.allowResolvedThenReintroduced) {
    const severityThresholdIndex = ["low", "medium", "high", "critical"].indexOf(
      effectiveConfig.severityThreshold ?? "medium"
    );
    const findingSeverityIndex = ["low", "medium", "high", "critical"].indexOf(finding.severity);

    return findingSeverityIndex >= severityThresholdIndex;
  }

  // Check if it's a specific regression rule
  if (effectiveConfig.regressionRules?.includes(finding.ruleId)) {
    return true;
  }

  return false;
}

/**
 * Calculate regression risk score
 *
 * Weight regressions more heavily than new findings
 */
export function calculateRegressionRiskScore(
  regressions: FindingComparison[],
  severityWeights?: Record<Severity, number>
): number {
  const weights = severityWeights ?? {
    critical: 20, // Higher weight for regressions
    high: 10,
    medium: 5,
    low: 2,
  };

  let score = 0;
  for (const regression of regressions) {
    score += weights[regression.severity];
  }

  return score;
}

/**
 * Get regression summary by ruleId
 */
export function getRegressionSummaryByRuleId(
  regressions: FindingComparison[]
): Record<string, { count: number; paths: string[]; severities: Severity[] }> {
  const summary: Record<string, { count: number; paths: string[]; severities: Severity[] }> = {};

  for (const regression of regressions) {
    if (!summary[regression.ruleId]) {
      summary[regression.ruleId] = {
        count: 0,
        paths: [],
        severities: [],
      };
    }

    summary[regression.ruleId].count++;
    if (regression.path) {
      summary[regression.ruleId].paths.push(regression.path);
    }
    summary[regression.ruleId].severities.push(regression.severity);
  }

  return summary;
}

/**
 * Check if there are critical regressions that should block release
 */
export function hasBlockingRegressions(
  regressions: FindingComparison[],
  blockingThreshold?: Severity
): boolean {
  const threshold = blockingThreshold ?? "high";
  const severityOrder: Severity[] = ["low", "medium", "high", "critical"];
  const thresholdIndex = severityOrder.indexOf(threshold);

  return regressions.some(r => {
    const severityIndex = severityOrder.indexOf(r.severity);
    return severityIndex >= thresholdIndex;
  });
}