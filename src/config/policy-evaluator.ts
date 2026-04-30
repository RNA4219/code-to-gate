/**
 * Policy evaluator - evaluates findings against policy thresholds
 * Based on docs/product-spec-v1.md section 5
 */

import type { Finding, Severity, FindingCategory } from "../types/artifacts.js";
import type { CtgPolicy, SuppressionEntry } from "./policy-loader.js";
import { isSuppressed } from "./policy-loader.js";

/**
 * Readiness status values
 */
export type ReadinessStatus =
  | "passed"
  | "passed_with_risk"
  | "needs_review"
  | "blocked_input";

/**
 * Failed condition details
 */
export interface FailedCondition {
  type: "severity_block" | "category_block" | "rule_block" | "count_threshold" | "low_confidence" | "suppressed_expired";
  severity?: Severity;
  category?: FindingCategory;
  ruleId?: string;
  findingId?: string;
  count?: number;
  threshold?: number;
  message: string;
}

/**
 * Policy evaluation result
 */
export interface PolicyEvaluationResult {
  status: ReadinessStatus;
  passedFindings: Finding[];
  blockedFindings: Finding[];
  suppressedFindings: Finding[];
  lowConfidenceFindings: Finding[];
  failedConditions: FailedCondition[];
  summary: {
    totalFindings: number;
    passedCount: number;
    blockedCount: number;
    suppressedCount: number;
    lowConfidenceCount: number;
    severityCounts: Record<Severity, number>;
    categoryCounts: Partial<Record<FindingCategory, number>>;
  };
}

/**
 * Severity order for comparison
 */
const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Category name mapping for policy
 */
export const CATEGORY_MAP: Record<FindingCategory, keyof CtgPolicy["blocking"]["category"]> = {
  auth: "auth",
  payment: "payment",
  validation: "validation",
  data: "data",
  config: "config",
  maintainability: "maintainability",
  testing: "testing",
  compatibility: "compatibility",
  "release-risk": "releaseRisk",
  security: "security",
};

/**
 * Check if a severity level is blocked by policy
 */
export function isSeverityBlocked(severity: Severity, blockingConfig: CtgPolicy["blocking"]["severity"]): boolean {
  return blockingConfig[severity] === true;
}

/**
 * Check if a category is blocked by policy
 */
export function isCategoryBlocked(category: FindingCategory, blockingConfig: CtgPolicy["blocking"]["category"]): boolean {
  const policyKey = CATEGORY_MAP[category];
  return blockingConfig[policyKey] === true;
}

/**
 * Check if a rule is blocked by policy
 */
export function isRuleBlocked(ruleId: string, blockingRules: CtgPolicy["blocking"]["rules"]): boolean {
  if (!blockingRules) return false;
  return blockingRules[ruleId] === true;
}

/**
 * Check if count threshold is exceeded
 */
function checkCountThreshold(
  findings: Finding[],
  countThreshold: CtgPolicy["blocking"]["countThreshold"]
): FailedCondition[] {
  const conditions: FailedCondition[] = [];

  if (!countThreshold) return conditions;

  // Count findings by severity
  const severityCounts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const finding of findings) {
    severityCounts[finding.severity]++;
  }

  // Check thresholds
  if (countThreshold.criticalMax !== undefined && severityCounts.critical > countThreshold.criticalMax) {
    conditions.push({
      type: "count_threshold",
      severity: "critical",
      count: severityCounts.critical,
      threshold: countThreshold.criticalMax,
      message: `Critical findings count (${severityCounts.critical}) exceeds threshold (${countThreshold.criticalMax})`,
    });
  }

  if (countThreshold.highMax !== undefined && severityCounts.high > countThreshold.highMax) {
    conditions.push({
      type: "count_threshold",
      severity: "high",
      count: severityCounts.high,
      threshold: countThreshold.highMax,
      message: `High findings count (${severityCounts.high}) exceeds threshold (${countThreshold.highMax})`,
    });
  }

  if (countThreshold.mediumMax !== undefined && severityCounts.medium > countThreshold.mediumMax) {
    conditions.push({
      type: "count_threshold",
      severity: "medium",
      count: severityCounts.medium,
      threshold: countThreshold.mediumMax,
      message: `Medium findings count (${severityCounts.medium}) exceeds threshold (${countThreshold.mediumMax})`,
    });
  }

  if (countThreshold.lowMax !== undefined && severityCounts.low > countThreshold.lowMax) {
    conditions.push({
      type: "count_threshold",
      severity: "low",
      count: severityCounts.low,
      threshold: countThreshold.lowMax,
      message: `Low findings count (${severityCounts.low}) exceeds threshold (${countThreshold.lowMax})`,
    });
  }

  return conditions;
}

/**
 * Determine readiness status from findings and conditions
 */
function determineReadinessStatus(
  blockedFindings: Finding[],
  lowConfidenceFindings: Finding[],
  failedConditions: FailedCondition[],
  partialAllowed: boolean
): ReadinessStatus {
  // If there are blocked findings (severity/category blocked), status is blocked_input
  if (blockedFindings.length > 0) {
    return "blocked_input";
  }

  // If count threshold exceeded, status is blocked_input
  const countThresholdFailed = failedConditions.some(c => c.type === "count_threshold");
  if (countThresholdFailed) {
    return "blocked_input";
  }

  // If low confidence findings and filterLow is enabled
  if (lowConfidenceFindings.length > 0 && !partialAllowed) {
    return "needs_review";
  }

  // If there are any findings but none blocked
  const hasAnyFindings = blockedFindings.length + lowConfidenceFindings.length > 0;
  if (hasAnyFindings && lowConfidenceFindings.length > 0) {
    return "passed_with_risk";
  }

  // All clear
  return "passed";
}

/**
 * Evaluate findings against policy
 *
 * @param findings - Array of findings to evaluate
 * @param policy - Policy configuration
 * @param suppressions - Array of suppression entries (optional)
 * @returns Policy evaluation result
 */
export function evaluatePolicy(
  findings: Finding[],
  policy: CtgPolicy,
  suppressions: SuppressionEntry[] = []
): PolicyEvaluationResult {
  const passedFindings: Finding[] = [];
  const blockedFindings: Finding[] = [];
  const suppressedFindings: Finding[] = [];
  const lowConfidenceFindings: Finding[] = [];
  const failedConditions: FailedCondition[] = [];

  const severityCounts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  const categoryCounts: Partial<Record<FindingCategory, number>> = {};

  // Process each finding
  for (const finding of findings) {
    // Count severity and category
    severityCounts[finding.severity]++;
    categoryCounts[finding.category] = (categoryCounts[finding.category] || 0) + 1;

    // Check suppression first
    const firstEvidence = finding.evidence[0];
    const findingPath = firstEvidence?.path || "";

    const suppressionResult = isSuppressed(finding.ruleId, findingPath, suppressions);
    if (suppressionResult.suppressed) {
      suppressedFindings.push(finding);
      continue;
    }

    // Check confidence threshold
    if (finding.confidence < policy.confidence.minConfidence) {
      lowConfidenceFindings.push(finding);
      failedConditions.push({
        type: "low_confidence",
        findingId: finding.id,
        ruleId: finding.ruleId,
        message: `Finding ${finding.id} has confidence ${finding.confidence} below threshold ${policy.confidence.minConfidence}`,
      });
      continue;
    }

    // Check all blocking conditions and record all reasons
    const blockingReasons: FailedCondition[] = [];
    let isBlocked = false;

    // Check severity blocking
    if (isSeverityBlocked(finding.severity, policy.blocking.severity)) {
      isBlocked = true;
      blockingReasons.push({
        type: "severity_block",
        severity: finding.severity,
        findingId: finding.id,
        ruleId: finding.ruleId,
        message: `Finding ${finding.id} blocked due to severity ${finding.severity}`,
      });
    }

    // Check rule blocking (only for high/critical severity)
    if (policy.blocking.rules && isRuleBlocked(finding.ruleId, policy.blocking.rules)) {
      if (finding.severity === "high" || finding.severity === "critical") {
        isBlocked = true;
        blockingReasons.push({
          type: "rule_block",
          ruleId: finding.ruleId,
          findingId: finding.id,
          message: `Finding ${finding.id} blocked due to rule ${finding.ruleId} with ${finding.severity} severity`,
        });
      }
    }

    // Check category blocking
    if (isCategoryBlocked(finding.category, policy.blocking.category)) {
      isBlocked = true;
      blockingReasons.push({
        type: "category_block",
        category: finding.category,
        findingId: finding.id,
        ruleId: finding.ruleId,
        message: `Finding ${finding.id} blocked due to category ${finding.category}`,
      });
    }

    // If any blocking condition matched, add to blocked findings and record all reasons
    if (isBlocked) {
      blockedFindings.push(finding);
      failedConditions.push(...blockingReasons);
      continue;
    }

    // Finding passed all checks
    passedFindings.push(finding);
  }

  // Check count thresholds (on non-suppressed findings)
  const nonSuppressedFindings = findings.filter(f => !suppressedFindings.includes(f));
  const countConditions = checkCountThreshold(nonSuppressedFindings, policy.blocking.countThreshold);
  failedConditions.push(...countConditions);

  // Determine final status
  const partialAllowed = policy.partial?.allowPartial ?? false;
  const status = determineReadinessStatus(
    blockedFindings,
    lowConfidenceFindings,
    failedConditions,
    partialAllowed
  );

  // Build summary
  const summary = {
    totalFindings: findings.length,
    passedCount: passedFindings.length,
    blockedCount: blockedFindings.length,
    suppressedCount: suppressedFindings.length,
    lowConfidenceCount: lowConfidenceFindings.length,
    severityCounts,
    categoryCounts,
  };

  return {
    status,
    passedFindings,
    blockedFindings,
    suppressedFindings,
    lowConfidenceFindings,
    failedConditions,
    summary,
  };
}

/**
 * Get exit code based on readiness status
 */
export function getExitCode(status: ReadinessStatus): number {
  switch (status) {
    case "passed":
      return 0;
    case "passed_with_risk":
      return 0;
    case "needs_review":
      return 1;
    case "blocked_input":
      return 1;
    default:
      return 1;
  }
}

/**
 * Check if readiness status is blocking (requires action)
 */
export function isBlockingStatus(status: ReadinessStatus): boolean {
  return status === "needs_review" || status === "blocked_input";
}

/**
 * Get status message for human-readable output
 */
export function getStatusMessage(status: ReadinessStatus): string {
  switch (status) {
    case "passed":
      return "All checks passed. Ready for release.";
    case "passed_with_risk":
      return "Passed with identified risks. Review recommended before release.";
    case "needs_review":
      return "Manual review required. Some findings need attention.";
    case "blocked_input":
      return "Blocked. Critical/high severity findings or threshold exceeded.";
    default:
      return "Unknown status.";
  }
}

/**
 * Generate specific blocking summary based on failed conditions
 */
export function generateBlockingSummary(
  failedConditions: FailedCondition[],
  blockedFindings: Finding[]
): string {
  if (blockedFindings.length === 0 && failedConditions.length === 0) {
    return "No blocking conditions";
  }

  // Count blocking types
  const severityBlocks: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  const categoryBlocks: Partial<Record<FindingCategory, number>> = {};
  const ruleBlocks: Record<string, number> = {};
  let countThresholdBlocks = 0;

  for (const condition of failedConditions) {
    if (condition.type === "severity_block" && condition.severity) {
      severityBlocks[condition.severity]++;
    } else if (condition.type === "category_block" && condition.category) {
      categoryBlocks[condition.category] = (categoryBlocks[condition.category] || 0) + 1;
    } else if (condition.type === "rule_block" && condition.ruleId) {
      ruleBlocks[condition.ruleId] = (ruleBlocks[condition.ruleId] || 0) + 1;
    } else if (condition.type === "count_threshold") {
      countThresholdBlocks++;
    }
  }

  // Build summary parts
  const parts: string[] = [];

  // Severity blocking
  const criticalCount = severityBlocks.critical;
  const highCount = severityBlocks.high;
  if (criticalCount > 0) {
    parts.push(`${criticalCount} critical severity findings`);
  }
  if (highCount > 0) {
    parts.push(`${highCount} high severity findings`);
  }

  // Category blocking (top categories)
  const topCategories = Object.entries(categoryBlocks)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  for (const [category, count] of topCategories) {
    if (count > 0) {
      parts.push(`${count} ${category} category findings`);
    }
  }

  // Rule blocking (top rules)
  const topRules = Object.entries(ruleBlocks)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  for (const [ruleId, count] of topRules) {
    if (count > 0) {
      parts.push(`${count} findings from rule ${ruleId}`);
    }
  }

  // Count threshold
  if (countThresholdBlocks > 0) {
    parts.push(`${countThresholdBlocks} count threshold(s) exceeded`);
  }

  if (parts.length === 0) {
    return `Blocked by ${blockedFindings.length} findings`;
  }

  return `Blocked: ${parts.join(", ")}`;
}

/**
 * Generate a brief evaluation summary for logging
 */
export function generateEvaluationSummary(result: PolicyEvaluationResult): string {
  const lines: string[] = [];

  lines.push(`Status: ${result.status}`);
  lines.push(`Total findings: ${result.summary.totalFindings}`);
  lines.push(`Blocked: ${result.summary.blockedCount}`);
  lines.push(`Suppressed: ${result.summary.suppressedCount}`);
  lines.push(`Low confidence: ${result.summary.lowConfidenceCount}`);
  lines.push(`Passed: ${result.summary.passedCount}`);

  if (result.failedConditions.length > 0) {
    lines.push(`Failed conditions: ${result.failedConditions.length}`);
    for (const condition of result.failedConditions.slice(0, 5)) {
      lines.push(`  - ${condition.message}`);
    }
    if (result.failedConditions.length > 5) {
      lines.push(`  ... and ${result.failedConditions.length - 5} more`);
    }
  }

  return lines.join("\n");
}