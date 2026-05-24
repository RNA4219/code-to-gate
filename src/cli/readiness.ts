/**
 * Readiness command - Release readiness evaluation
 *
 * Evaluates findings against policy to determine release readiness.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ensureDir } from "../core/file-utils.js";
import { EXIT, getOption, VERSION } from "./exit-codes.js";
import { loadPolicyFile, loadSuppressionFile, checkSuppressionExpiry, detectBroadSuppressions, type SuppressionEntry, type SuppressionExpiryWarning, type SuppressionClass } from "../config/policy-loader.js";
import { evaluatePolicy, generateBlockingSummary, type PolicyEvaluationResult, type ReadinessStatus } from "../config/policy-evaluator.js";
import { assessIntakeArtifact, type IntakeAssessment } from "./intake-artifact.js";

import {
  FindingsArtifact,
  Finding,
  Severity,
  CTG_VERSION,
  ReleaseReadinessArtifact,
} from "../types/artifacts.js";
import {
  generateSelfAnalysisDebtArtifact,
  writeSelfAnalysisDebtJson,
} from "../reporters/index.js";
import { countSuppressedByClass } from "../self-analysis/suppression-summary.js";

interface ReadinessOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

/**
 * Map evaluation failed conditions to artifact format
 */
function mapFailedConditions(result: PolicyEvaluationResult): Array<{
  id: string;
  reason: string;
  matchedFindingIds?: string[];
  matchedInputIds?: string[];
}> {
  return result.failedConditions.map((condition) => {
    let id: string;

    switch (condition.type) {
      case "severity_block":
        id = `BLOCKING_SEVERITY_${condition.severity?.toUpperCase() || "UNKNOWN"}`;
        break;
      case "category_block":
        id = `BLOCKING_CATEGORY_${condition.category?.toUpperCase() || "UNKNOWN"}`;
        break;
      case "rule_block":
        id = `BLOCKING_RULE_${condition.ruleId || "UNKNOWN"}`;
        break;
      case "count_threshold":
        id = `COUNT_THRESHOLD_${condition.severity?.toUpperCase() || "UNKNOWN"}`;
        break;
      case "low_confidence":
        id = `LOW_CONFIDENCE_${condition.findingId || "UNKNOWN"}`;
        break;
      default:
        id = "UNKNOWN_CONDITION";
    }

    return {
      id,
      reason: condition.message,
      matchedFindingIds: condition.findingId ? [condition.findingId] : undefined,
    };
  });
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
 * Generate recommended actions based on evaluation result
 */
function generateRecommendedActions(result: PolicyEvaluationResult): string[] {
  const actions: string[] = [];

  for (const condition of result.failedConditions) {
    if (condition.type === "severity_block" && condition.severity === "critical") {
      actions.push("Address all critical severity findings before release");
    }

    if (condition.type === "severity_block" && condition.severity === "high") {
      actions.push("Review and address high severity findings");
    }

    if (condition.type === "category_block" && condition.category === "auth") {
      actions.push("Review authentication findings - consider security impact");
    }

    if (condition.type === "category_block" && condition.category === "payment") {
      actions.push("Review payment-related findings - validate server-side price calculation");
    }

    if (condition.type === "category_block" && condition.category === "validation") {
      actions.push("Add missing server-side validation for user inputs");
    }

    if (condition.type === "category_block" && condition.category === "testing") {
      actions.push("Add tests for critical paths and untested functionality");
    }

    if (condition.type === "rule_block") {
      actions.push(`Address findings for blocking rule ${condition.ruleId}`);
    }
  }

  // Add general recommendations if no specific ones
  if (actions.length === 0 && result.summary.totalFindings > 0) {
    actions.push("Review findings and assess impact on release");
    actions.push("Consider addressing medium/low severity findings");
  }

  return actions;
}

/**
 * Get status summary message
 */
function getStatusSummary(status: ReadinessStatus, evalResult?: PolicyEvaluationResult): string {
  switch (status) {
    case "passed":
      return "All policy conditions met, release ready";
    case "passed_with_risk":
      return "Release possible with identified risks to address";
    case "needs_review":
      return "Release blocked pending review of findings";
    case "blocked_input":
      if (evalResult) {
        return generateBlockingSummary(evalResult.failedConditions, evalResult.blockedFindings);
      }
      return "Release blocked by critical findings";
    default:
      return "Unknown status";
  }
}

function mergeReadinessStatus(status: ReadinessStatus, intake?: IntakeAssessment): ReadinessStatus {
  if (intake && intake.blockingIssues.length > 0) {
    return "blocked_input";
  }
  return status;
}

function getMergedStatusSummary(
  status: ReadinessStatus,
  evalResult: PolicyEvaluationResult,
  intake?: IntakeAssessment
): string {
  if (intake && intake.blockingIssues.length > 0) {
    return `Blocked: ${intake.blockingIssues.length} critical intake issue(s) unresolved`;
  }
  return getStatusSummary(status, evalResult);
}

export async function readinessCommand(args: string[], options: ReadinessOptions): Promise<number> {
  const repoArg = args[0];
  const policyPath = options.getOption(args, "--policy");
  const fromDir = options.getOption(args, "--from");
  const outDir = options.getOption(args, "--out") ?? ".qh";
  const intakePath = options.getOption(args, "--intake");

  if (!repoArg || !policyPath || !fromDir) {
    console.error("usage: code-to-gate readiness <repo> --policy <file> --from <dir> [--out <dir>] [--intake <file>]");
    console.error("Note: --from is required. Run 'code-to-gate analyze' first to generate findings.json");
    return options.EXIT.USAGE_ERROR;
  }

  const cwd = process.cwd();
  const repoRoot = path.resolve(cwd, repoArg);
  const policyFile = path.resolve(cwd, policyPath);

  if (!existsSync(repoRoot)) {
    console.error(`repo does not exist: ${repoArg}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!statSync(repoRoot).isDirectory()) {
    console.error(`repo is not a directory: ${repoArg}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!existsSync(policyFile)) {
    console.error(`policy file not found: ${policyPath}`);
    return options.EXIT.USAGE_ERROR;
  }

  const absoluteIntakePath = intakePath ? path.resolve(cwd, intakePath) : undefined;
  if (absoluteIntakePath && !existsSync(absoluteIntakePath)) {
    console.error(`intake artifact not found: ${intakePath}`);
    return options.EXIT.USAGE_ERROR;
  }

  const absoluteOutDir = path.resolve(cwd, outDir);

  try {
    // Load policy using policy-loader
    const { policy, errors: policyErrors } = loadPolicyFile(policyPath, cwd);

    if (policyErrors.length > 0) {
      for (const error of policyErrors) {
        console.error(`Policy error: ${error}`);
      }
      if (!policy.policyId) {
        return options.EXIT.POLICY_FAILED;
      }
    }

    // Load suppressions if configured
    let suppressions: SuppressionEntry[] = [];
    let expiryWarnings: SuppressionExpiryWarning[] = [];
    if (policy.suppression?.file) {
      const suppressionFile = loadSuppressionFile(policy.suppression.file, cwd);
      suppressions = suppressionFile.suppressions;

      // Check for expired or expiring suppressions
      const warningDays = policy.suppression?.expiryWarningDays ?? 30;
      expiryWarnings = checkSuppressionExpiry(suppressions, warningDays);
    }

    // Load findings from --from directory (required)
    const findingsPath = path.resolve(cwd, fromDir, "findings.json");

    if (!existsSync(findingsPath)) {
      console.error(`findings.json not found in --from directory: ${fromDir}`);
      console.error("Run 'code-to-gate analyze' first to generate findings");
      return options.EXIT.POLICY_FAILED;
    }

    const findingsContent = readFileSync(findingsPath, "utf8");
    const findings: FindingsArtifact = JSON.parse(findingsContent);

    // Evaluate findings against policy using policy-evaluator
    const evalResult = evaluatePolicy(findings.findings, policy, suppressions);
    const intakeAssessment = absoluteIntakePath ? assessIntakeArtifact(absoluteIntakePath) : undefined;
    const readinessStatus = mergeReadinessStatus(evalResult.status, intakeAssessment);

    // Map failed conditions to artifact format
    const failedConditions = mapFailedConditions(evalResult);
    if (intakeAssessment) {
      for (const issue of intakeAssessment.blockingIssues) {
        failedConditions.push({
          id: `INTAKE_${issue.id}`,
          reason: issue.reason,
          matchedInputIds: [issue.id],
        });
      }
    }

    // Generate recommended actions (including expiry warnings)
    const recommendedActions = generateRecommendedActions(evalResult);

    // Add expiry warnings to recommended actions
    for (const warning of expiryWarnings) {
      if (warning.status === "expired") {
        recommendedActions.push(
          `WARNING: Suppression for ${warning.ruleId} at ${warning.path} expired ${warning.daysUntilExpiry} days ago. Review and update or remove.`
        );
      } else {
        recommendedActions.push(
          `WARNING: Suppression for ${warning.ruleId} at ${warning.path} expires in ${warning.daysUntilExpiry} days. Plan review before expiry.`
        );
      }
    }
    if (intakeAssessment) {
      recommendedActions.push(...intakeAssessment.recommendedActions);
    }

    // Calculate self-analysis summary for transparency
    const rawCounts = countBySeverity(findings.findings);
    const suppressedCounts = countBySeverity(evalResult.suppressedFindings);
    const broadSuppressions = detectBroadSuppressions(suppressions);
    const acceptedExceptionsByClass = countSuppressedByClass(suppressions, evalResult.suppressedFindings);

    // Add broad suppression review to recommended actions if present
    if (broadSuppressions.length > 0) {
      recommendedActions.push(
        `REVIEW REQUIRED: ${broadSuppressions.length} broad suppression(s) detected. Review path patterns for scope reduction.`
      );
    }

    // Build readiness artifact
    const now = new Date().toISOString();
    const runId = `readiness-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}`;

    const readiness: ReleaseReadinessArtifact = {
      version: CTG_VERSION,
      generated_at: now,
      run_id: runId,
      repo: { root: repoRoot },
      tool: {
        name: "code-to-gate",
        version: VERSION,
        policy_id: policy.policyId,
        plugin_versions: [],
      },
      artifact: "release-readiness",
      schema: "release-readiness@v1",
      status: readinessStatus,
      completeness: findings.completeness,
      summary: getMergedStatusSummary(readinessStatus, evalResult, intakeAssessment),
      counts: {
        findings: evalResult.summary.blockedCount + evalResult.summary.passedCount + evalResult.summary.lowConfidenceCount,
        critical: evalResult.summary.blockedCount > 0 ? rawCounts.critical - suppressedCounts.critical : 0,
        high: evalResult.summary.blockedCount > 0 ? rawCounts.high - suppressedCounts.high : 0,
        risks: 0,
        testSeeds: 0,
        unsupportedClaims: findings.unsupported_claims.length,
      },
      selfAnalysis: {
        rawCritical: rawCounts.critical,
        rawHigh: rawCounts.high,
        rawMedium: rawCounts.medium,
        rawLow: rawCounts.low,
        suppressedCritical: suppressedCounts.critical,
        suppressedHigh: suppressedCounts.high,
        suppressedMedium: suppressedCounts.medium,
        suppressedLow: suppressedCounts.low,
        broadSuppressions: broadSuppressions.length,
        acceptedExceptionsByClass,
      },
      failedConditions,
      recommendedActions,
      artifactRefs: {
        findings: fromDir ? path.join(fromDir, "findings.json") : undefined,
        riskRegister: fromDir ? path.join(fromDir, "risk-register.yaml") : undefined,
        intake: intakePath,
      },
    };

    ensureDir(absoluteOutDir);

    // Write release-readiness.json
    const outputPath = path.join(absoluteOutDir, "release-readiness.json");
    writeFileSync(outputPath, JSON.stringify(readiness, null, 2) + "\n", "utf8");

    // Generate self-analysis-debt.json for transparency
    if (suppressions.length > 0) {
      const selfAnalysisDebt = generateSelfAnalysisDebtArtifact(
        findings,
        suppressions,
        evalResult.suppressedFindings,
        repoRoot,
        runId
      );
      writeSelfAnalysisDebtJson(absoluteOutDir, selfAnalysisDebt);
    }

    // Output summary
    console.log(
      JSON.stringify({
        tool: "code-to-gate",
        command: "readiness",
        policy: policy.policyId,
        status: readinessStatus,
        artifact: path.relative(cwd, outputPath),
        summary: {
          findings: readiness.counts.findings,
          critical: readiness.counts.critical,
          high: readiness.counts.high,
          failed_conditions: failedConditions.length,
        },
      })
    );

    // Return exit code based on status
    if (readinessStatus === "passed" || readinessStatus === "passed_with_risk") {
      return options.EXIT.OK;
    } else {
      return options.EXIT.READINESS_NOT_CLEAR;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.POLICY_FAILED;
  }
}
