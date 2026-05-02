/**
 * Export Types - Type definitions for export targets
 */

import type { Severity } from "../types/artifacts.js";

// === V1 Schema Types (P0-02/P0-03 fix) ===

/**
 * Gatefield V1 Schema - Integration adapter output
 */
export interface GatefieldStaticResultV1 {
  version: "ctg.gatefield/v1";
  producer: "code-to-gate";
  run_id: string;
  artifact_hash: string;
  repo: {
    root: string;
    revision?: string;
    branch?: string;
  };
  status: "passed" | "warning" | "blocked_input" | "failed";
  summary: string;
  signals: Array<{
    id: string;
    kind: "sast" | "secret" | "quality" | "test_gap" | "release_risk";
    severity: Severity;
    confidence: number;
    finding_id: string;
    evidence: string[];
  }>;
  non_binding_gate_hint: "pass" | "hold" | "block";
}

/**
 * State Gate V1 Schema - Integration adapter output
 */
export interface StateGateEvidenceV1 {
  version: "ctg.state-gate/v1";
  producer: "code-to-gate";
  run_id: string;
  artifact_hash: string;
  release_readiness: {
    status: "passed" | "passed_with_risk" | "needs_review" | "blocked_input" | "failed";
    summary: string;
    failed_conditions: string[];
  };
  evidence_refs: Array<{
    artifact: "findings" | "risk-register" | "invariants" | "test-seeds" | "audit";
    path: string;
    hash: string;
  }>;
  approval_relevance: {
    requires_human_attention: boolean;
    reasons: string[];
  };
}

/**
 * Manual BB V1 Schema - Integration adapter output
 */
export interface ManualBbSeedV1 {
  version: "ctg.manual-bb/v1";
  producer: "code-to-gate";
  run_id: string;
  scope: {
    repo: string;
    changed_files: string[];
    affected_entrypoints: string[];
  };
  risk_seeds: Array<{
    id: string;
    title: string;
    severity: Severity;
    evidence: string[];
    suggested_test_intents: Array<"regression" | "boundary" | "negative" | "abuse" | "smoke" | "compatibility">;
  }>;
  invariant_seeds: Array<{
    id: string;
    statement: string;
    confidence: number;
    evidence: string[];
  }>;
  test_seed_refs: string[];
  known_gaps: string[];
  oracle_gaps: string[];
}

/**
 * Workflow Evidence V1 Schema - Integration adapter output
 */
export interface WorkflowEvidenceV1 {
  version: "ctg.workflow-evidence/v1";
  producer: "code-to-gate";
  run_id: string;
  intent_id?: string;
  evidence_type: "release-readiness" | "pr-risk-scan" | "quality-scan";
  subject: {
    repo: string;
    revision?: string;
    branch?: string;
  };
  artifacts: Array<{
    name: string;
    path: string;
    hash: string;
    schema: string;
  }>;
  summary: {
    status: string;
    critical_count: number;
    high_count: number;
    needs_review: boolean;
  };
}

// === Legacy V1alpha1 Types (deprecated) ===

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

export type ManualBbTestCase = ManualBbSeed["test_cases"][number];

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

export const SUPPORTED_TARGETS = ["gatefield", "state-gate", "manual-bb", "workflow-evidence", "sarif"];

/**
 * Map severity to SARIF level
 */
export function mapSeverityToSarifLevel(severity: Severity): "error" | "warning" | "note" {
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
 * Map finding category to signal kind
 */
export function mapCategoryToSignalKind(category: string): "sast" | "secret" | "quality" | "test_gap" | "release_risk" {
  if (category === "security" || category === "auth" || category === "data") {
    return "sast";
  }
  if (category === "testing") {
    return "test_gap";
  }
  if (category === "maintainability" || category === "compatibility") {
    return "quality";
  }
  return "release_risk";
}

/**
 * Map test intents based on rule and category
 */
export function mapToTestIntents(ruleId: string, category: string): Array<"regression" | "boundary" | "negative" | "abuse" | "smoke" | "compatibility"> {
  const intents: Array<"regression" | "boundary" | "negative" | "abuse" | "smoke" | "compatibility"> = [];

  // Security/auth findings need negative and abuse tests
  if (category === "security" || category === "auth") {
    intents.push("negative", "abuse");
  }

  // Payment findings need boundary tests
  if (category === "payment") {
    intents.push("boundary", "negative", "abuse");
  }

  // Validation findings need boundary tests
  if (category === "validation") {
    intents.push("boundary", "negative");
  }

  // Testing gaps need smoke tests
  if (category === "testing") {
    intents.push("smoke", "regression");
  }

  // Default fallback
  if (intents.length === 0) {
    intents.push("regression", "smoke");
  }

  return intents;
}