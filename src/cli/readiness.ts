/**
 * Readiness command - Release readiness evaluation
 *
 * Evaluates findings against policy to determine release readiness.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ensureDir } from "../core/file-utils.js";
import { EXIT, getOption, VERSION } from "./exit-codes.js";
import { loadPolicyFile, type CtgPolicy } from "../config/policy-loader.js";
import { evaluatePolicy, generateBlockingSummary, type PolicyEvaluationResult, type ReadinessStatus } from "../config/policy-evaluator.js";

import {
  FindingsArtifact,
  RiskRegisterArtifact,
  CTG_VERSION_V1ALPHA1,
} from "../types/artifacts.js";

const CTG_VERSION = CTG_VERSION_V1ALPHA1;

interface ReadinessOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

interface ReleaseReadinessArtifact {
  version: string;
  generated_at: string;
  run_id: string;
  repo: {
    root: string;
  };
  tool: {
    name: "code-to-gate";
    version: string;
    policy_id?: string;
    plugin_versions: Array<{ name: string; version: string; visibility: "public" | "private" }>;
  };
  artifact: "release-readiness";
  schema: "release-readiness@v1";
  status: "passed" | "passed_with_risk" | "needs_review" | "blocked_input" | "failed";
  completeness: "complete" | "partial";
  summary: string;
  counts: {
    findings: number;
    critical: number;
    high: number;
    risks: number;
    testSeeds: number;
    unsupportedClaims: number;
  };
  failedConditions: Array<{
    id: string;
    reason: string;
    matchedFindingIds?: string[];
    matchedRiskIds?: string[];
  }>;
  recommendedActions: string[];
  artifactRefs: {
    graph?: string;
    findings?: string;
    riskRegister?: string;
    invariants?: string;
    testSeeds?: string;
    audit?: string;
  };
}

/**
 * Map evaluation failed conditions to artifact format
 */
function mapFailedConditions(result: PolicyEvaluationResult): Array<{
  id: string;
  reason: string;
  matchedFindingIds?: string[];
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

export async function readinessCommand(args: string[], options: ReadinessOptions): Promise<number> {
  const repoArg = args[0];
  const policyPath = options.getOption(args, "--policy");
  const fromDir = options.getOption(args, "--from");
  const outDir = options.getOption(args, "--out") ?? ".qh";

  if (!repoArg || !policyPath) {
    console.error("usage: code-to-gate readiness <repo> --policy <file> [--from <dir>] --out <dir>");
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

    // Load findings from --from directory or create empty
    let findings: FindingsArtifact;

    if (fromDir && existsSync(path.resolve(cwd, fromDir, "findings.json"))) {
      const findingsPath = path.resolve(cwd, fromDir, "findings.json");
      const findingsContent = readFileSync(findingsPath, "utf8");
      findings = JSON.parse(findingsContent);
    } else {
      // Create empty findings artifact
      const now = new Date().toISOString();
      const runId = `readiness-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}`;

      findings = {
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
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };
    }

    // Evaluate findings against policy using policy-evaluator
    const evalResult = evaluatePolicy(findings.findings, policy);

    // Map failed conditions to artifact format
    const failedConditions = mapFailedConditions(evalResult);

    // Generate recommended actions
    const recommendedActions = generateRecommendedActions(evalResult);

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
      status: evalResult.status,
      completeness: findings.completeness,
      summary: getStatusSummary(evalResult.status, evalResult),
      counts: {
        findings: findings.findings.length,
        critical: evalResult.summary.severityCounts.critical,
        high: evalResult.summary.severityCounts.high,
        risks: 0,
        testSeeds: 0,
        unsupportedClaims: findings.unsupported_claims.length,
      },
      failedConditions,
      recommendedActions,
      artifactRefs: {
        findings: fromDir ? path.join(fromDir, "findings.json") : undefined,
        riskRegister: fromDir ? path.join(fromDir, "risk-register.yaml") : undefined,
      },
    };

    ensureDir(absoluteOutDir);

    // Write release-readiness.json
    const outputPath = path.join(absoluteOutDir, "release-readiness.json");
    writeFileSync(outputPath, JSON.stringify(readiness, null, 2) + "\n", "utf8");

    // Output summary
    console.log(
      JSON.stringify({
        tool: "code-to-gate",
        command: "readiness",
        policy: policy.policyId,
        status: evalResult.status,
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
    if (evalResult.status === "passed" || evalResult.status === "passed_with_risk") {
      return options.EXIT.OK;
    } else {
      return options.EXIT.READINESS_NOT_CLEAR;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.POLICY_FAILED;
  }
}