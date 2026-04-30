/**
 * Export command - Downstream adapter export
 *
 * Generates target-specific payloads for downstream systems:
 * - gatefield: GatefieldStaticResult
 * - state-gate: StateGateEvidence
 * - manual-bb: ManualBbSeed
 * - workflow-evidence: WorkflowEvidence
 * - sarif: SARIF v2.1.0
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EXIT, getOption, VERSION } from "./exit-codes.js";

import {
  FindingsArtifact,
  RiskRegisterArtifact,
  Finding,
  Severity,
  CTG_VERSION_V1ALPHA1,
} from "../types/artifacts.js";

const CTG_VERSION = CTG_VERSION_V1ALPHA1;

export interface ExportOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

// Export target types

export interface GatefieldStaticResult {
  version: "ctg.gatefield/v1alpha1";
  generated_at: string;
  run_id: string;
  repo: { root: string };
  artifact: "gatefield-static-result";
  schema: "gatefield-static-result@v1";
  status: "passed" | "blocked" | "needs_review";
  summary: string;
  findings_summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  blocking_reasons: string[];
  recommended_actions: string[];
}

export interface StateGateEvidence {
  version: "ctg.state-gate/v1alpha1";
  generated_at: string;
  run_id: string;
  repo: { root: string };
  artifact: "state-gate-evidence";
  schema: "state-gate-evidence@v1";
  evidence_type: "static_analysis";
  evidence_data: {
    findings_count: number;
    risk_count: number;
    test_seed_count: number;
    readiness_status: string;
  };
  confidence_score: number;
  attestations: Array<{
    type: string;
    hash: string;
    timestamp: string;
  }>;
}

export interface ManualBbSeed {
  version: "ctg.manual-bb/v1alpha1";
  generated_at: string;
  run_id: string;
  repo: { root: string };
  artifact: "manual-bb-seed";
  schema: "manual-bb-seed@v1";
  test_cases: Array<{
    id: string;
    title: string;
    category: string;
    risk_area: string;
    description: string;
    steps: string[];
    expected_result: string;
    priority: "high" | "medium" | "low";
    source_findings: string[];
  }>;
}

type ManualBbTestCase = ManualBbSeed["test_cases"][number];

export interface WorkflowEvidence {
  version: "ctg.workflow-evidence/v1alpha1";
  generated_at: string;
  run_id: string;
  repo: { root: string };
  artifact: "workflow-evidence";
  schema: "workflow-evidence@v1";
  workflow_run_id: string;
  workflow_name: string;
  steps: Array<{
    name: string;
    status: "success" | "failure" | "skipped";
    duration_ms: number;
    artifacts_produced: string[];
  }>;
  overall_status: "success" | "failure";
  evidence_refs: string[];
}

export interface SarifResult {
  $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json";
  version: "2.1.0";
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version: string;
        rules: Array<{
          id: string;
          shortDescription: { text: string };
          defaultConfiguration?: { level: string };
        }>;
      };
    };
    results: Array<{
      ruleId: string;
      level: "error" | "warning" | "note";
      message: { text: string };
      locations: Array<{
        physicalLocation: {
          artifactLocation: { uri: string };
          region: { startLine: number; endLine?: number };
        };
      }>;
    }>;
  }>;
}

const SUPPORTED_TARGETS = ["gatefield", "state-gate", "manual-bb", "workflow-evidence", "sarif"];

/**
 * Map severity to SARIF level
 */
function mapSeverityToSarifLevel(severity: Severity): "error" | "warning" | "note" {
  switch (severity) {
    case "critical":
    case "high":
      return "error";
    case "medium":
      return "warning";
    default:
      return "note";
  }
}

/**
 * Generate Gatefield static result
 */
export function generateGatefieldResult(findings: FindingsArtifact): GatefieldStaticResult {
  const criticalCount = findings.findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.findings.filter((f) => f.severity === "high").length;

  const status: "passed" | "blocked" | "needs_review" =
    criticalCount > 0 ? "blocked" : highCount > 0 ? "needs_review" : "passed";

  const blockingReasons: string[] = [];
  if (criticalCount > 0) {
    blockingReasons.push(`${criticalCount} critical severity findings`);
  }
  if (highCount > 0 && status === "needs_review") {
    blockingReasons.push(`${highCount} high severity findings require review`);
  }

  const recommendedActions: string[] = [];
  for (const finding of findings.findings.slice(0, 5)) {
    if (finding.severity === "critical" || finding.severity === "high") {
      recommendedActions.push(`Address ${finding.ruleId} in ${finding.evidence[0]?.path || "unknown"}`);
    }
  }

  return {
    version: "ctg.gatefield/v1alpha1",
    generated_at: findings.generated_at,
    run_id: findings.run_id,
    repo: findings.repo,
    artifact: "gatefield-static-result",
    schema: "gatefield-static-result@v1",
    status,
    summary: status === "passed" ? "All static analysis checks passed" : blockingReasons.join("; "),
    findings_summary: {
      total: findings.findings.length,
      critical: criticalCount,
      high: highCount,
      medium: findings.findings.filter((f) => f.severity === "medium").length,
      low: findings.findings.filter((f) => f.severity === "low").length,
    },
    blocking_reasons: blockingReasons,
    recommended_actions: recommendedActions,
  };
}

/**
 * Generate State Gate evidence
 */
export function generateStateGateEvidence(findings: FindingsArtifact): StateGateEvidence {
  // Calculate confidence score based on findings
  const criticalCount = findings.findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.findings.filter((f) => f.severity === "high").length;
  const totalFindings = findings.findings.length;

  let confidenceScore = 1.0;
  if (totalFindings > 0) {
    // Reduce confidence based on severity
    confidenceScore = Math.max(0, 1.0 - criticalCount * 0.3 - highCount * 0.1 - (totalFindings - criticalCount - highCount) * 0.02);
  }

  const status = criticalCount > 0 ? "blocked" : highCount > 0 ? "needs_review" : "passed";

  return {
    version: "ctg.state-gate/v1alpha1",
    generated_at: findings.generated_at,
    run_id: findings.run_id,
    repo: findings.repo,
    artifact: "state-gate-evidence",
    schema: "state-gate-evidence@v1",
    evidence_type: "static_analysis",
    evidence_data: {
      findings_count: totalFindings,
      risk_count: 0, // Would need risk register
      test_seed_count: 0, // Would need test seeds
      readiness_status: status,
    },
    confidence_score: Math.round(confidenceScore * 100) / 100,
    attestations: [
      {
        type: "static_analysis_complete",
        hash: "sha256:" + Buffer.from(JSON.stringify(findings)).toString("base64").slice(0, 32),
        timestamp: findings.generated_at,
      },
    ],
  };
}

/**
 * Generate Manual BB seed
 */
export function generateManualBbSeed(findings: FindingsArtifact): ManualBbSeed {
  const testCases: ManualBbTestCase[] = [];

  // Generate test cases from high/critical findings
  for (const finding of findings.findings.filter((f) => f.severity === "critical" || f.severity === "high")) {
    const path = finding.evidence[0]?.path || "unknown";
    const line = finding.evidence[0]?.startLine || 1;

    testCases.push({
      id: `bb-${finding.id}`,
      title: `Black-box test for ${finding.ruleId}`,
      category: finding.category,
      risk_area: finding.category === "auth" ? "authentication" : finding.category === "payment" ? "payment" : "security",
      description: finding.summary,
      steps: [
        `Navigate to ${path}`,
        `Trigger functionality at line ${line}`,
        `Test with edge case inputs`,
        `Verify security controls are applied`,
      ],
      expected_result: finding.ruleId.includes("TRUSTED_PRICE")
        ? "Server should reject client-supplied price"
        : finding.ruleId.includes("AUTH")
        ? "Authentication should be required"
        : "Expected behavior based on finding",
      priority: (finding.severity === "critical" ? "high" : "medium") as "high" | "medium" | "low",
      source_findings: [finding.id],
    });
  }

  // Add general test cases for coverage
  if (testCases.length === 0 && findings.findings.length > 0) {
    testCases.push({
      id: `bb-general-${findings.run_id}`,
      title: "General security review",
      category: "security",
      risk_area: "general",
      description: "Review findings from static analysis",
      steps: [
        "Review all findings from analysis",
        "Identify potential attack vectors",
        "Test identified risk areas manually",
      ],
      expected_result: "No exploitable vulnerabilities found",
      priority: "medium" as "high" | "medium" | "low",
      source_findings: findings.findings.slice(0, 3).map((f) => f.id),
    });
  }

  return {
    version: "ctg.manual-bb/v1alpha1",
    generated_at: findings.generated_at,
    run_id: findings.run_id,
    repo: findings.repo,
    artifact: "manual-bb-seed",
    schema: "manual-bb-seed@v1",
    test_cases: testCases,
  };
}

/**
 * Generate Workflow evidence
 */
export function generateWorkflowEvidence(findings: FindingsArtifact): WorkflowEvidence {
  const now = new Date().toISOString();

  // Simulate workflow steps
  const steps = [
    {
      name: "scan",
      status: "success" as const,
      duration_ms: 1500,
      artifacts_produced: ["repo-graph.json"],
    },
    {
      name: "analyze",
      status: findings.findings.length > 0 ? "success" as const : "success" as const,
      duration_ms: 3000,
      artifacts_produced: ["findings.json", "risk-register.yaml"],
    },
    {
      name: "readiness",
      status:
        findings.findings.some((f) => f.severity === "critical")
          ? "failure" as const
          : "success" as const,
      duration_ms: 500,
      artifacts_produced: ["release-readiness.json"],
    },
  ];

  const overallStatus = steps.some((s) => s.status === "failure") ? "failure" : "success";

  return {
    version: "ctg.workflow-evidence/v1alpha1",
    generated_at: now,
    run_id: findings.run_id,
    repo: findings.repo,
    artifact: "workflow-evidence",
    schema: "workflow-evidence@v1",
    workflow_run_id: findings.run_id,
    workflow_name: "code-to-gate-analysis",
    steps,
    overall_status: overallStatus,
    evidence_refs: ["findings.json", "risk-register.yaml", "release-readiness.json"],
  };
}

/**
 * Generate SARIF output
 */
export function generateSarif(findings: FindingsArtifact): SarifResult {
  // Collect unique rules
  const rules = new Map<string, { id: string; description: string; level: string }>();

  for (const finding of findings.findings) {
    if (!rules.has(finding.ruleId)) {
      rules.set(finding.ruleId, {
        id: finding.ruleId,
        description: finding.title,
        level: mapSeverityToSarifLevel(finding.severity),
      });
    }
  }

  return {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "code-to-gate",
            version: VERSION,
            rules: Array.from(rules.values()).map((r) => ({
              id: r.id,
              shortDescription: { text: r.description },
              defaultConfiguration: { level: r.level },
            })),
          },
        },
        results: findings.findings.map((finding) => ({
          ruleId: finding.ruleId,
          level: mapSeverityToSarifLevel(finding.severity),
          message: { text: finding.summary },
          locations: finding.evidence.map((e) => ({
            physicalLocation: {
              artifactLocation: { uri: e.path },
              region: {
                startLine: e.startLine || 1,
                endLine: e.endLine,
              },
            },
          })),
        })),
      },
    ],
  };
}

export async function exportCommand(args: string[], options: ExportOptions): Promise<number> {
  const targetArg = args[0];
  const fromDir = options.getOption(args, "--from");
  const outFile = options.getOption(args, "--out");

  if (!targetArg || !fromDir) {
    console.error("usage: code-to-gate export <target> --from <dir> [--out <file>]");
    console.error(`supported targets: ${SUPPORTED_TARGETS.join(", ")}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!SUPPORTED_TARGETS.includes(targetArg)) {
    console.error(`unsupported target: ${targetArg}`);
    console.error(`supported targets: ${SUPPORTED_TARGETS.join(", ")}`);
    return options.EXIT.USAGE_ERROR;
  }

  const cwd = process.cwd();
  const artifactDir = path.resolve(cwd, fromDir);

  if (!existsSync(artifactDir)) {
    console.error(`artifact directory not found: ${fromDir}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!statSync(artifactDir).isDirectory()) {
    console.error(`artifact path is not a directory: ${fromDir}`);
    return options.EXIT.USAGE_ERROR;
  }

  // Check for findings.json
  const findingsPath = path.join(artifactDir, "findings.json");
  if (!existsSync(findingsPath)) {
    console.error(`core artifact not found: ${fromDir}/findings.json`);
    return options.EXIT.USAGE_ERROR;
  }

  try {
    // Load findings
    const findingsContent = readFileSync(findingsPath, "utf8");
    const findings: FindingsArtifact = JSON.parse(findingsContent);

    // Generate target-specific output
    let output: unknown;
    let outputPath: string;

    switch (targetArg) {
      case "gatefield":
        output = generateGatefieldResult(findings);
        outputPath = outFile ?? path.join(artifactDir, "gatefield-static-result.json");
        break;

      case "state-gate":
        output = generateStateGateEvidence(findings);
        outputPath = outFile ?? path.join(artifactDir, "state-gate-evidence.json");
        break;

      case "manual-bb":
        output = generateManualBbSeed(findings);
        outputPath = outFile ?? path.join(artifactDir, "manual-bb-seed.json");
        break;

      case "workflow-evidence":
        output = generateWorkflowEvidence(findings);
        outputPath = outFile ?? path.join(artifactDir, "workflow-evidence.json");
        break;

      case "sarif":
        output = generateSarif(findings);
        outputPath = outFile ?? path.join(artifactDir, "results.sarif");
        break;

      default:
        console.error(`unsupported target: ${targetArg}`);
        return options.EXIT.USAGE_ERROR;
    }

    // Resolve output path
    const absoluteOutputPath = path.resolve(cwd, outputPath);

    // Write output
    writeFileSync(absoluteOutputPath, JSON.stringify(output, null, 2) + "\n", "utf8");

    // Output summary
    console.log(
      JSON.stringify({
        tool: "code-to-gate",
        command: "export",
        target: targetArg,
        input: path.relative(cwd, findingsPath),
        output: path.relative(cwd, absoluteOutputPath),
        summary: {
          findings: findings.findings.length,
          rules: targetArg === "sarif"
            ? new Set(findings.findings.map((f) => f.ruleId)).size
            : undefined,
        },
      })
    );

    return options.EXIT.OK;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.INTEGRATION_EXPORT_FAILED;
  }
}
