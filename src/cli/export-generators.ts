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
  type GatefieldStaticResultV1,
  type StateGateEvidenceV1,
  type ManualBbSeedV1,
  type WorkflowEvidenceV1,
  mapSeverityToSarifLevel,
  mapCategoryToSignalKind,
  mapToTestIntents,
} from "./export-types.js";

// === V1 Generators (P0-02/P0-03 fix) ===

/**
 * Generate artifact hash from content
 */
function generateArtifactHash(content: object): string {
  return "sha256:" + Buffer.from(JSON.stringify(content)).toString("base64").slice(0, 32);
}

/**
 * Generate Gatefield V1 result
 */
export function generateGatefieldResultV1(findings: FindingsArtifact): GatefieldStaticResultV1 {
  const criticalCount = findings.findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.findings.filter((f) => f.severity === "high").length;

  const status: "passed" | "warning" | "blocked_input" | "failed" =
    criticalCount > 0 ? "blocked_input" : highCount > 0 ? "warning" : "passed";

  // Map findings to signals
  const signals = findings.findings.map((f) => ({
    id: `signal-${f.id}`,
    kind: mapCategoryToSignalKind(f.category),
    severity: f.severity,
    confidence: f.confidence,
    finding_id: f.id,
    evidence: f.evidence.map((e) => `${e.path}:${e.startLine || "?"}`),
  }));

  // Determine gate hint
  const non_binding_gate_hint: "pass" | "hold" | "block" =
    criticalCount > 0 ? "block" : highCount > 0 ? "hold" : "pass";

  const summary = status === "passed"
    ? "All static analysis checks passed"
    : `${criticalCount} critical, ${highCount} high severity findings`;

  return {
    version: "ctg.gatefield/v1",
    producer: "code-to-gate",
    run_id: findings.run_id,
    artifact_hash: generateArtifactHash(findings),
    repo: {
      root: findings.repo.root,
    },
    status,
    summary,
    signals,
    non_binding_gate_hint,
  };
}

/**
 * Generate State Gate V1 evidence
 */
export function generateStateGateEvidenceV1(findings: FindingsArtifact): StateGateEvidenceV1 {
  const criticalCount = findings.findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.findings.filter((f) => f.severity === "high").length;

  const status: "passed" | "passed_with_risk" | "needs_review" | "blocked_input" | "failed" =
    criticalCount > 0 ? "blocked_input" : highCount > 0 ? "needs_review" : "passed";

  const failed_conditions: string[] = [];
  if (criticalCount > 0) {
    failed_conditions.push(`BLOCKING_SEVERITY_CRITICAL:${criticalCount}`);
  }
  if (highCount > 0) {
    failed_conditions.push(`BLOCKING_SEVERITY_HIGH:${highCount}`);
  }

  // Generate evidence refs
  const evidence_refs: Array<{
    artifact: "findings" | "risk-register" | "invariants" | "test-seeds" | "audit";
    path: string;
    hash: string;
  }> = [
    {
      artifact: "findings",
      path: "findings.json",
      hash: generateArtifactHash(findings),
    },
  ];

  const requires_human_attention = status === "needs_review" || status === "blocked_input";
  const reasons: string[] = [];
  if (criticalCount > 0) {
    reasons.push("Critical severity findings require review");
  }
  if (highCount > 0) {
    reasons.push("High severity findings need assessment");
  }

  return {
    version: "ctg.state-gate/v1",
    producer: "code-to-gate",
    run_id: findings.run_id,
    artifact_hash: generateArtifactHash(findings),
    release_readiness: {
      status,
      summary: status === "passed" ? "Release ready" : failed_conditions.join("; "),
      failed_conditions,
    },
    evidence_refs,
    approval_relevance: {
      requires_human_attention,
      reasons,
    },
  };
}

/**
 * Generate Manual BB V1 seed
 */
export function generateManualBbSeedV1(findings: FindingsArtifact): ManualBbSeedV1 {
  // Generate risk seeds from high/critical findings
  const risk_seeds = findings.findings
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .map((f) => ({
      id: `risk-${f.id}`,
      title: f.title,
      severity: f.severity,
      evidence: f.evidence.map((e) => `${e.path}:${e.startLine || "?"}`),
      suggested_test_intents: mapToTestIntents(f.ruleId, f.category),
    }));

  // Generate invariant seeds from confidence patterns
  const invariant_seeds: Array<{
    id: string;
    statement: string;
    confidence: number;
    evidence: string[];
  }> = [];

  // Add known gaps for oracle-less findings
  const known_gaps: string[] = [];
  const oracle_gaps: string[] = [];
  for (const f of findings.findings) {
    if (f.confidence < 0.7) {
      known_gaps.push(`Low confidence finding: ${f.ruleId} at ${f.evidence[0]?.path}`);
    }
    // Oracle gaps: findings that cannot be automatically verified
    if (f.category === "maintainability" || f.category === "testing") {
      oracle_gaps.push(`Manual verification needed: ${f.ruleId} at ${f.evidence[0]?.path}`);
    }
    // Auth findings often need manual pen-testing verification
    if (f.category === "auth" && f.ruleId === "WEAK_AUTH_GUARD") {
      oracle_gaps.push(`Pen-test verification: ${f.title} at ${f.evidence[0]?.path}`);
    }
  }

  // Extract affected entrypoints from evidence
  const affected_entrypoints = findings.findings
    .filter((f) => f.category === "testing")
    .map((f) => f.evidence[0]?.path || "unknown");

  return {
    version: "ctg.manual-bb/v1",
    producer: "code-to-gate",
    run_id: findings.run_id,
    scope: {
      repo: findings.repo.root,
      changed_files: [], // Requires diff mode
      affected_entrypoints,
    },
    risk_seeds,
    invariant_seeds,
    test_seed_refs: [], // Requires test-seeds artifact
    known_gaps,
    oracle_gaps,
  };
}

/**
 * Generate Workflow V1 evidence
 */
export function generateWorkflowEvidenceV1(findings: FindingsArtifact): WorkflowEvidenceV1 {
  const criticalCount = findings.findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.findings.filter((f) => f.severity === "high").length;

  const artifacts: Array<{
    name: string;
    path: string;
    hash: string;
    schema: string;
  }> = [
    {
      name: "findings",
      path: "findings.json",
      hash: generateArtifactHash(findings),
      schema: "findings@v1",
    },
  ];

  const needs_review = criticalCount > 0 || highCount > 0;
  const status = criticalCount > 0 ? "blocked" : highCount > 0 ? "needs_review" : "passed";

  return {
    version: "ctg.workflow-evidence/v1",
    producer: "code-to-gate",
    run_id: findings.run_id,
    evidence_type: "pr-risk-scan",
    subject: {
      repo: findings.repo.root,
    },
    artifacts,
    summary: {
      status,
      critical_count: criticalCount,
      high_count: highCount,
      needs_review,
    },
  };
}

// === Legacy V1alpha1 Generators (deprecated) ===

/**
 * Generate Gatefield static result (v1alpha1 - deprecated)
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
 * Generate State Gate evidence (v1alpha1 - deprecated)
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
 * Generate Manual BB seed (v1alpha1 - deprecated)
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
 * Generate Workflow evidence (v1alpha1 - deprecated)
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