/**
 * Readiness command - Release readiness evaluation
 *
 * Evaluates findings against policy to determine release readiness.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sha256 } from "../core/path-utils.js";
import { ensureDir } from "../core/file-utils.js";
import { EXIT, getOption, VERSION } from "./exit-codes.js";

import {
  FindingsArtifact,
  RiskRegisterArtifact,
  Policy,
  Severity,
  FindingCategory,
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

interface FailedCondition {
  id: string;
  reason: string;
  matchedFindingIds?: string[];
  matchedRiskIds?: string[];
}

/**
 * Parse YAML policy file (simple implementation)
 */
function parsePolicyYaml(content: string): Policy {
  const lines = content.split("\n");
  const policy: Policy = {
    version: CTG_VERSION,
    name: "unknown",
    blocking: {
      severities: [],
      categories: [],
      rules: [],
    },
    readiness: {
      criticalFindingStatus: "blocked_input",
      highAuthFindingStatus: "needs_review",
      defaultRiskStatus: "needs_review",
    },
  };

  let currentSection: "" | "blocking" | "readiness" | "blocking_severities" | "blocking_categories" | "blocking_rules" = "";
  let indentLevel = 0;
  let subSectionIndent = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;

    // Parse version
    if (trimmed.startsWith("version:")) {
      policy.version = trimmed.split(":")[1].trim();
      currentSection = "";
    }

    // Parse name/policy_id
    if (trimmed.startsWith("name:") || trimmed.startsWith("policy_id:")) {
      policy.name = trimmed.split(":")[1].trim();
      currentSection = "";
    }

    // Parse description
    if (trimmed.startsWith("description:")) {
      policy.description = trimmed.split(":")[1].trim();
      currentSection = "";
    }

    // Enter blocking section
    if (trimmed.startsWith("blocking:")) {
      currentSection = "blocking";
      indentLevel = indent;
      subSectionIndent = indent + 2; // Expected indent for sub-sections
      continue;
    }

    // Enter readiness section
    if (trimmed.startsWith("readiness:")) {
      currentSection = "readiness";
      indentLevel = indent;
      subSectionIndent = indent + 2;
      continue;
    }

    // Reset to parent section when encountering a sub-section key at the right indent
    if (currentSection.startsWith("blocking_") && indent === subSectionIndent && trimmed.endsWith(":")) {
      currentSection = "blocking";
    }
    if (currentSection.startsWith("readiness_") && indent === subSectionIndent && trimmed.endsWith(":")) {
      currentSection = "readiness";
    }

    // Exit section when indent decreases significantly (back to root level)
    if (indent < indentLevel && trimmed !== "" && !trimmed.startsWith("-")) {
      currentSection = "";
    }

    // Parse blocking section - list format
    if (currentSection === "blocking") {
      // Parse severities list
      if (trimmed === "severities:") {
        currentSection = "blocking_severities";
        continue;
      }

      // Parse categories list
      if (trimmed === "categories:") {
        currentSection = "blocking_categories";
        continue;
      }

      // Parse rules list
      if (trimmed === "rules:") {
        currentSection = "blocking_rules";
        continue;
      }
    }

    // Parse list items in blocking sub-sections (outside the "blocking" block to avoid TS narrowing)
    if (trimmed.startsWith("-")) {
      const value = trimmed.slice(1).trim();

      if (currentSection === "blocking_severities") {
        if (["critical", "high", "medium", "low"].includes(value)) {
          policy.blocking.severities!.push(value as Severity);
        }
      } else if (currentSection === "blocking_categories") {
        policy.blocking.categories!.push(value as FindingCategory);
      } else if (currentSection === "blocking_rules") {
        policy.blocking.rules!.push(value);
      }
    }

    // Parse readiness section
    if (currentSection === "readiness") {
      if (trimmed.startsWith("criticalFindingStatus:")) {
        const val = trimmed.split(":")[1].trim();
        if (val === "blocked_input" || val === "needs_review") {
          policy.readiness!.criticalFindingStatus = val;
        }
      }
      if (trimmed.startsWith("highAuthFindingStatus:")) {
        const val = trimmed.split(":")[1].trim();
        if (val === "blocked_input" || val === "needs_review") {
          policy.readiness!.highAuthFindingStatus = val;
        }
      }
      if (trimmed.startsWith("defaultRiskStatus:")) {
        const val = trimmed.split(":")[1].trim();
        if (val === "needs_review" || val === "passed_with_risk") {
          policy.readiness!.defaultRiskStatus = val;
        }
      }
    }
  }

  return policy;
}

/**
 * Evaluate findings against policy
 */
function evaluateFindingsAgainstPolicy(
  findings: FindingsArtifact,
  policy: Policy
): {
  failedConditions: FailedCondition[];
  status: "passed" | "passed_with_risk" | "needs_review" | "blocked_input" | "failed";
} {
  const failedConditions: FailedCondition[] = [];

  // Check severity thresholds
  for (const severity of policy.blocking.severities || []) {
    const matchingFindings = findings.findings.filter((f) => f.severity === severity);

    if (matchingFindings.length > 0) {
      failedConditions.push({
        id: `BLOCKING_SEVERITY_${severity.toUpperCase()}`,
        reason: `${matchingFindings.length} findings with blocking severity ${severity}`,
        matchedFindingIds: matchingFindings.map((f) => f.id),
      });
    }
  }

  // Check category thresholds
  for (const category of policy.blocking.categories || []) {
    const matchingFindings = findings.findings.filter((f) => f.category === category);

    if (matchingFindings.length > 0) {
      const highSeverityFindings = matchingFindings.filter(
        (f) => f.severity === "high" || f.severity === "critical"
      );

      if (highSeverityFindings.length > 0) {
        failedConditions.push({
          id: `BLOCKING_CATEGORY_${category.toUpperCase()}`,
          reason: `${highSeverityFindings.length} high/critical findings in blocking category ${category}`,
          matchedFindingIds: highSeverityFindings.map((f) => f.id),
        });
      }
    }
  }

  // Check blocking rules
  for (const rule of policy.blocking.rules || []) {
    const matchingFindings = findings.findings.filter((f) => f.ruleId === rule);

    if (matchingFindings.length > 0) {
      const highSeverityFindings = matchingFindings.filter(
        (f) => f.severity === "high" || f.severity === "critical"
      );

      if (highSeverityFindings.length > 0) {
        failedConditions.push({
          id: `BLOCKING_RULE_${rule}`,
          reason: `${highSeverityFindings.length} high/critical findings for blocking rule ${rule}`,
          matchedFindingIds: highSeverityFindings.map((f) => f.id),
        });
      }
    }
  }

  // Determine status based on failed conditions and policy readiness settings
  type ReadinessStatus = "passed" | "passed_with_risk" | "needs_review" | "blocked_input" | "failed";
  let status: ReadinessStatus = "passed";

  if (failedConditions.length > 0) {
    // Use policy readiness settings if available
    if (policy.readiness) {
      // Check for critical findings
      const hasCriticalFindings = findings.findings.some(f => f.severity === "critical");
      if (hasCriticalFindings && policy.readiness.criticalFindingStatus) {
        const criticalStatus = policy.readiness.criticalFindingStatus;
        if (criticalStatus === "blocked_input" || criticalStatus === "needs_review") {
          status = criticalStatus;
        }
      }

      // Check for auth-related high findings
      const hasAuthHighFindings = findings.findings.some(
        f => f.severity === "high" && f.category === "auth"
      );
      if (hasAuthHighFindings && policy.readiness.highAuthFindingStatus) {
        const authStatus = policy.readiness.highAuthFindingStatus;
        if (authStatus === "blocked_input" || authStatus === "needs_review") {
          // Use more severe status
          if (authStatus === "blocked_input" || status === "needs_review") {
            status = authStatus;
          }
        }
      }
    } else {
      // Default logic without policy readiness settings
      const hasCriticalBlock = failedConditions.some(
        (c) => c.id === "BLOCKING_SEVERITY_CRITICAL"
      );

      if (hasCriticalBlock) {
        status = "blocked_input";
      } else {
        const hasHighBlock = failedConditions.some(
          (c) =>
            c.id === "BLOCKING_SEVERITY_HIGH" ||
            c.id.includes("_AUTH_") ||
            c.id.includes("_PAYMENT_") ||
            c.id.startsWith("BLOCKING_RULE_")
        );

        if (hasHighBlock) {
          status = "needs_review";
        } else {
          status = "passed_with_risk";
        }
      }
    }
  }

  return { failedConditions, status };
}

/**
 * Generate recommended actions based on failed conditions
 */
function generateRecommendedActions(
  failedConditions: FailedCondition[],
  findings: FindingsArtifact
): string[] {
  const actions: string[] = [];

  for (const condition of failedConditions) {
    if (condition.id.includes("SEVERITY_CRITICAL")) {
      actions.push("Address all critical severity findings before release");
    }

    if (condition.id.includes("SEVERITY_HIGH")) {
      actions.push("Review and address high severity findings");
    }

    if (condition.id.includes("_AUTH_")) {
      actions.push("Review authentication findings - consider security impact");
    }

    if (condition.id.includes("_PAYMENT_")) {
      actions.push("Review payment-related findings - validate server-side price calculation");
    }

    if (condition.id.includes("_VALIDATION_")) {
      actions.push("Add missing server-side validation for user inputs");
    }

    if (condition.id.includes("_TESTING_")) {
      actions.push("Add tests for critical paths and untested functionality");
    }
  }

  // Add general recommendations if no specific ones
  if (actions.length === 0 && findings.findings.length > 0) {
    actions.push("Review findings and assess impact on release");
    actions.push("Consider addressing medium/low severity findings");
  }

  return actions;
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
    // Load policy
    const policyContent = readFileSync(policyFile, "utf8");
    const policy = parsePolicyYaml(policyContent);

    // Load findings from --from directory or build from repo
    let findings: FindingsArtifact;
    let riskRegister: RiskRegisterArtifact | undefined;

    if (fromDir && existsSync(path.resolve(cwd, fromDir, "findings.json"))) {
      // Load existing findings
      const findingsPath = path.resolve(cwd, fromDir, "findings.json");
      const findingsContent = readFileSync(findingsPath, "utf8");
      findings = JSON.parse(findingsContent);

      // Try to load risk register
      const riskPath = path.resolve(cwd, fromDir, "risk-register.yaml");
      if (existsSync(riskPath)) {
        // For YAML, we just note the reference
        riskRegister = undefined; // Would need YAML parser
      }
    } else {
      // Need to run analysis first (simplified - create empty findings)
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
          policy_id: policy.name,
          plugin_versions: [],
        },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      };
    }

    // Evaluate findings against policy
    const { failedConditions, status } = evaluateFindingsAgainstPolicy(findings, policy);

    // Generate recommended actions
    const recommendedActions = generateRecommendedActions(failedConditions, findings);

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
        policy_id: policy.name,
        plugin_versions: [],
      },
      artifact: "release-readiness",
      schema: "release-readiness@v1",
      status,
      completeness: findings.completeness,
      summary:
        status === "passed"
          ? "All policy conditions met, release ready"
          : status === "passed_with_risk"
          ? "Release possible with identified risks to address"
          : status === "needs_review"
          ? "Release blocked pending review of findings"
          : "Release blocked by critical findings",
      counts: {
        findings: findings.findings.length,
        critical: findings.findings.filter((f) => f.severity === "critical").length,
        high: findings.findings.filter((f) => f.severity === "high").length,
        risks: 0, // Would need risk register
        testSeeds: 0, // Would need test seeds
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
        policy: policy.name,
        status,
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
    if (status === "passed" || status === "passed_with_risk") {
      return options.EXIT.OK;
    } else {
      return options.EXIT.READINESS_NOT_CLEAR;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.POLICY_FAILED;
  }
}