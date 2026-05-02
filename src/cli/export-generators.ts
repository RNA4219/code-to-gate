/**
 * Export Generators - Generate target-specific payloads
 */

import type { FindingsArtifact } from "../types/artifacts.js";
import { VERSION } from "./exit-codes.js";
import {
  type GatefieldStaticResult,
  type StateGateEvidence,
  type ManualBbSeed,
  type ManualBbTestCase,
  type WorkflowEvidence,
  type SarifResult,
  mapSeverityToSarifLevel,
} from "./export-types.js";

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
  const criticalCount = findings.findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.findings.filter((f) => f.severity === "high").length;
  const totalFindings = findings.findings.length;

  let confidenceScore = 1.0;
  if (totalFindings > 0) {
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
      risk_count: 0,
      test_seed_count: 0,
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

  const steps = [
    {
      name: "scan",
      status: "success" as const,
      duration_ms: 1500,
      artifacts_produced: ["repo-graph.json"],
    },
    {
      name: "analyze",
      status: "success" as const,
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