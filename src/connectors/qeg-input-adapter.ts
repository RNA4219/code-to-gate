/**
 * Quality Evidence Graph Input Adapter
 * Loads code-to-gate evidence for QEG decision process
 *
 * NOTE: This adapter is designed to be copied/referenced by quality-evidence-graph repository.
 * code-to-gate generates evidence, quality-evidence-graph makes decisions.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// Types for QEG input evidence

/**
 * Evidence-only export from code-to-gate
 * No decision field - decision is made by quality-evidence-graph exclusively
 */
export interface QEGCodeToGateEvidence {
  version: "ctg.qeg-input/v1";
  producer: "code-to-gate";
  run_id: string;
  commit_sha?: string;
  artifact_dir: string;

  findings_summary: {
    total: number;
    by_severity: Record<string, number>;
    by_category: Record<string, number>;
    by_rule: Record<string, number>;
  };

  readiness_status: "passed" | "passed_with_risk" | "needs_review" | "blocked_input" | "failed";

  schema_compliance: Array<{
    artifact: string;
    status: "ok" | "error";
    errors?: string[];
  }>;

  quality_checks_actual: Array<{
    name: string;
    status: "pass" | "fail" | "skipped";
    evidence_path?: string;
    details: string;
  }>;

  artifact_hashes: Array<{
    artifact: string;
    path: string;
    hash: string;
  }>;
}

/**
 * External evidence from RanD (Research and Development)
 * To be defined by RanD system
 */
export interface RandEvidence {
  version: string;
  producer: "RanD";
  // Details to be defined by RanD integration
}

/**
 * External evidence from manual-bb-test-harness
 * To be defined by manual black-box testing system
 */
export interface ManualBbEvidence {
  version: string;
  producer: "manual-bb-test-harness";
  // Details to be defined by manual-bb integration
}

/**
 * QEG input requirements for each source
 */
export interface QEGInputRequirement {
  source: "code-to-gate" | "RanD" | "manual-bb-test-harness";
  artifact_path: string;
  required_artifacts: string[];
}

/**
 * Aggregated QEG inputs from all sources
 */
export interface QEGInputs {
  code_to_gate?: QEGCodeToGateEvidence;
  rand?: RandEvidence;
  manual_bb?: ManualBbEvidence;
}

/**
 * Load code-to-gate evidence from artifact directory
 *
 * @param artifactDir - Directory containing qeg-code-to-gate.json
 * @returns QEGCodeToGateEvidence or null if not found
 */
export function loadCodeToGateEvidence(artifactDir: string): QEGCodeToGateEvidence | null {
  const qegPath = path.join(artifactDir, "qeg-code-to-gate.json");

  if (!existsSync(qegPath)) {
    return null;
  }

  try {
    const content = readFileSync(qegPath, "utf8");
    const evidence = JSON.parse(content) as QEGCodeToGateEvidence;

    // Validate version identifier
    if (evidence.version !== "ctg.qeg-input/v1") {
      console.error(`Invalid QEG version: ${evidence.version}`);
      return null;
    }

    // Validate producer
    if (evidence.producer !== "code-to-gate") {
      console.error(`Invalid QEG producer: ${evidence.producer}`);
      return null;
    }

    return evidence;
  } catch (err) {
    console.error(`Failed to load QEG evidence: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Validate QEG inputs are complete for decision process
 *
 * @param inputs - Aggregated QEG inputs from all sources
 * @returns Validation result with missing sources
 */
export function validateQEGInputs(inputs: QEGInputs): {
  valid: boolean;
  missing: string[];
  ready_for_decision: boolean;
} {
  const missing: string[] = [];

  // Check code-to-gate input
  if (!inputs.code_to_gate) {
    missing.push("code-to-gate");
  }

  // Check RanD input
  if (!inputs.rand) {
    missing.push("RanD");
  }

  // Check manual-bb-test-harness input
  if (!inputs.manual_bb) {
    missing.push("manual-bb-test-harness");
  }

  // Basic readiness gate: code-to-gate only (Phase 1)
  // Release Go requires all 3 inputs + external approval (Phase 2)
  const ready_for_decision = missing.length === 0;

  // For basic gate, only code-to-gate is required
  const valid = inputs.code_to_gate !== undefined;

  return { valid, missing, ready_for_decision };
}

/**
 * Extract key metrics from code-to-gate evidence for decision process
 *
 * @param evidence - Code-to-gate evidence
 * @returns Summary metrics
 */
export function extractMetrics(evidence: QEGCodeToGateEvidence): {
  total_findings: number;
  critical_count: number;
  high_count: number;
  readiness_status: string;
  schema_valid: boolean;
  quality_checks_failed: number;
} {
  const criticalCount = evidence.findings_summary.by_severity["critical"] ?? 0;
  const highCount = evidence.findings_summary.by_severity["high"] ?? 0;

  const schemaValid = evidence.schema_compliance.every((r) => r.status === "ok");

  const qualityChecksFailed = evidence.quality_checks_actual.filter(
    (c) => c.status === "fail"
  ).length;

  return {
    total_findings: evidence.findings_summary.total,
    critical_count: criticalCount,
    high_count: highCount,
    readiness_status: evidence.readiness_status,
    schema_valid: schemaValid,
    quality_checks_failed: qualityChecksFailed,
  };
}