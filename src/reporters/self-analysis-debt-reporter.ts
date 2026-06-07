/**
 * Self-Analysis Debt Reporter
 * Generates self-analysis-debt.json artifact for transparency
 */

import {
  FindingsArtifact,
  Finding,
  Severity,
  CTG_VERSION,
} from "../types/artifacts.js";
import { writeFileSync } from "node:fs";
import path from "node:path";
import type { SuppressionClass, SuppressionEntry, BroadSuppression } from "../config/policy-loader.js";
import { detectBroadSuppressions } from "../config/policy-loader.js";
import { classifySuppressedFindings } from "../self-analysis/suppression-summary.js";
import { RawFindingsArtifact } from "./raw-findings-reporter.js";

/**
 * Self-analysis debt artifact structure
 */
export interface SelfAnalysisDebtArtifact {
  version: string;
  generated_at: string;
  run_id: string;
  repo: {
    root: string;
  };
  tool: {
    name: "code-to-gate";
    version: string;
  };
  artifact: "self-analysis-debt";
  schema: "self-analysis-debt@v1";

  rawFindings: {
    total: number;
    bySeverity: Record<Severity, number>;
  };

  effectiveFindings: {
    total: number;
    bySeverity: Record<Severity, number>;
  };

  acceptedExceptions: {
    total: number;
    bySeverity: Record<Severity, number>;
    byClass: Record<SuppressionClass, number>;
    details: Array<{
      ruleId: string;
      path: string;
      class: SuppressionClass;
      reason: string;
      severity: Severity;
    }>;
  };

  broadSuppressions: {
    total: number;
    items: BroadSuppression[];
    reviewRequired: boolean;
  };

  debtCandidates: {
    unsafeDelete: number;
    tryCatchSwallow: number;
    rawSql: number;
    largeModule: number;
  };

  recommendedActions: string[];
}

/**
 * Count findings by severity
 */
function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const finding of findings) {
    counts[finding.severity]++;
  }
  return counts;
}

/**
 * Generate self-analysis debt artifact
 * @param effectiveFindings - Findings after suppression (from findings.json)
 * @param suppressions - Suppression entries from policy
 * @param suppressedFindings - Findings that were suppressed
 * @param repoRoot - Repository root path
 * @param runId - Run identifier
 * @param toolVersion - Tool version string
 * @param rawFindingsArtifact - Optional raw findings (before suppression) from raw-findings.json
 */
export function generateSelfAnalysisDebtArtifact(
  effectiveFindings: FindingsArtifact,
  suppressions: SuppressionEntry[],
  suppressedFindings: Finding[],
  repoRoot: string,
  runId: string,
  toolVersion: string,
  rawFindingsArtifact?: RawFindingsArtifact
): SelfAnalysisDebtArtifact {
  const now = new Date().toISOString();

  // Raw counts: use raw-findings.json if available, otherwise effective findings
  const rawTotal = rawFindingsArtifact?.findings.length ?? effectiveFindings.findings.length;
  const rawCounts = rawFindingsArtifact?.bySeverity ?? countBySeverity(effectiveFindings.findings);

  // Effective counts (findings not suppressed)
  const effectiveFindingsFiltered = effectiveFindings.findings.filter(
    (f) => !suppressedFindings.includes(f) && f.ruleId !== "SUPPRESSION_DEBT" && f.ruleId !== "DEBT_MARKER"
  );
  const effectiveCounts = countBySeverity(effectiveFindingsFiltered);

  // Accepted exceptions counts
  const acceptedCounts = countBySeverity(suppressedFindings);

  // Count by class
  const byClass: Record<SuppressionClass, number> = {
    "self-reference": 0,
    "fixture-intentional": 0,
    "generated-artifact": 0,
    "accepted-design": 0,
    "temporary-debt": 0,
  };

  // Build accepted exceptions details
  const details: Array<{
    ruleId: string;
    path: string;
    class: SuppressionClass;
    reason: string;
    severity: Severity;
  }> = [];

  for (const item of classifySuppressedFindings(suppressions, suppressedFindings)) {
    byClass[item.class]++;
    details.push({
      ruleId: item.finding.ruleId,
      path: item.path,
      class: item.class,
      reason: item.suppression.reason,
      severity: item.finding.severity,
    });
  }

  // Detect broad suppressions
  const broadSuppressions = detectBroadSuppressions(suppressions);

  // Count debt candidates from effective findings
  const debtCandidates = {
    unsafeDelete: effectiveFindings.findings.filter((f) => f.ruleId === "UNSAFE_DELETE").length,
    tryCatchSwallow: effectiveFindings.findings.filter((f) => f.ruleId === "TRY_CATCH_SWALLOW").length,
    rawSql: effectiveFindings.findings.filter((f) => f.ruleId === "RAW_SQL").length,
    largeModule: effectiveFindings.findings.filter((f) => f.ruleId === "LARGE_MODULE").length,
  };

  // Generate recommended actions
  const recommendedActions: string[] = [];

  if (broadSuppressions.length > 0) {
    recommendedActions.push(
      `Review ${broadSuppressions.length} broad suppression(s) for scope reduction`
    );
  }

  if (byClass["temporary-debt"] > 0) {
    recommendedActions.push(
      `Plan repayment for ${byClass["temporary-debt"]} temporary debt item(s)`
    );
  }

  if (debtCandidates.unsafeDelete > 0) {
    recommendedActions.push(
      `Review ${debtCandidates.unsafeDelete} UNSAFE_DELETE finding(s) for safety guard`
    );
  }

  if (debtCandidates.tryCatchSwallow > 0) {
    recommendedActions.push(
      `Add logging or fallback contract to ${debtCandidates.tryCatchSwallow} TRY_CATCH_SWALLOW location(s)`
    );
  }

  return {
    version: CTG_VERSION,
    generated_at: now,
    run_id: runId,
    repo: { root: repoRoot },
    tool: {
      name: "code-to-gate",
      version: toolVersion,
    },
    artifact: "self-analysis-debt",
    schema: "self-analysis-debt@v1",
    rawFindings: {
      total: rawTotal,
      bySeverity: rawCounts,
    },
    effectiveFindings: {
      total: effectiveFindingsFiltered.length,
      bySeverity: effectiveCounts,
    },
    acceptedExceptions: {
      total: suppressedFindings.length,
      bySeverity: acceptedCounts,
      byClass,
      details,
    },
    broadSuppressions: {
      total: broadSuppressions.length,
      items: broadSuppressions,
      reviewRequired: broadSuppressions.length > 0,
    },
    debtCandidates,
    recommendedActions,
  };
}

/**
 * Write self-analysis-debt.json to output directory
 */
export function writeSelfAnalysisDebtJson(
  outDir: string,
  artifact: SelfAnalysisDebtArtifact
): string {
  const filePath = path.join(outDir, "self-analysis-debt.json");
  writeFileSync(filePath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  return filePath;
}
