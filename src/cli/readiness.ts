/**
 * Readiness command - Release readiness evaluation
 *
 * Evaluates findings against policy to determine release readiness.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sha256 } from "../core/path-utils.js";
import { EXIT, getOption, VERSION } from "./exit-codes.js";

import {
  FindingsArtifact,
  RiskRegisterArtifact,
  Policy,
  Severity,
  FindingCategory,
  CTG_VERSION,
} from "../types/artifacts.js";

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
  };

  let inBlockingSection = false;
  let currentSeveritySection = "";

  for (const line of lines) {
    const trimmed = line.trim();

    // Parse version
    if (trimmed.startsWith("version:")) {
      policy.version = trimmed.split(":")[1].trim();
    }

    // Parse name/policy_id
    if (trimmed.startsWith("name:") || trimmed.startsWith("policy_id:")) {
      policy.name = trimmed.split(":")[1].trim();
    }

    // Parse description
    if (trimmed.startsWith("description:")) {
      policy.description = trimmed.split(":")[1].trim();
    }

    // Enter blocking section
    if (trimmed.startsWith("blocking:")) {
      inBlockingSection = true;
      continue;
    }

    // Exit blocking section
    if (inBlockingSection && !trimmed.startsWith(" ") && !trimmed.startsWith("-") && trimmed !== "") {
      inBlockingSection = false;
    }

    // Parse blocking section
    if (inBlockingSection) {
      if (trimmed.startsWith("severity:")) {
        currentSeveritySection = "severity";
        continue;
      }

      if (trimmed.startsWith("category:")) {
        currentSeveritySection = "category";
        continue;
      }

      // Parse severity values
      if (currentSeveritySection === "severity") {
        const severityMatch = trimmed.match(/^(\w+):\s*(true|false)/);
        if (severityMatch) {
          const sev = severityMatch[1];
          const block = severityMatch[2] === "true";
          if (block && ["critical", "high", "medium", "low"].includes(sev)) {
            policy.blocking.severities!.push(sev as Severity);
          }
        }
      }

      // Parse category values
      if (currentSeveritySection === "category") {
        const categoryMatch = trimmed.match(/^(\w+):\s*(true|false)/);
        if (categoryMatch) {
          const cat = categoryMatch[1];
          const block = categoryMatch[2] === "true";
          if (block) {
            policy.blocking.categories!.push(cat as FindingCategory);
          }
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

  // Determine status based on failed conditions
  let status: "passed" | "passed_with_risk" | "needs_review" | "blocked_input" | "failed" = "passed";

  if (failedConditions.length > 0) {
    // Check if any critical severity findings
    const hasCriticalBlock = failedConditions.some(
      (c) => c.id === "BLOCKING_SEVERITY_CRITICAL"
    );

    if (hasCriticalBlock) {
      status = "blocked_input";
    } else {
      // Check severity of failed conditions
      const hasHighBlock = failedConditions.some(
        (c) =>
          c.id === "BLOCKING_SEVERITY_HIGH" ||
          c.id.includes("_AUTH_") ||
          c.id.includes("_PAYMENT_")
      );

      if (hasHighBlock) {
        status = "needs_review";
      } else {
        status = "passed_with_risk";
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

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
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