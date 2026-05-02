/**
 * Export Types - Type definitions for export targets
 */

import type { Severity } from "../types/artifacts.js";

/**
 * Export target types
 */

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