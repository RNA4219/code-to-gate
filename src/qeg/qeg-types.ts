/**
 * Quality Evidence Graph (QEG) Types
 * Defines the schema for two-stage release gates
 */

export type QEGGateType = "pre_release_review" | "release_decision";
export type QEGDecisionStatus = "pass" | "fail" | "needs_review" | "blocked";

export interface QEGFindingsSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  byCategory: Record<string, number>;
  byRule: Record<string, number>;
}

export interface QEGSchemaComplianceResult {
  artifact: string;
  status: "ok" | "error";
  errors?: string[];
}

export interface QEGQualityCheck {
  name: string;
  status: "pass" | "fail" | "skip";
  details?: string;
}

export interface QEGEvidenceData {
  findings_summary: QEGFindingsSummary;
  readiness_status: "passed" | "passed_with_risk" | "needs_review" | "blocked_input" | "failed";
  schema_compliance: QEGSchemaComplianceResult[];
  quality_checks: QEGQualityCheck[];
}

export interface QEGGateDecision {
  status: QEGDecisionStatus;
  justification: string;
  required_approvals: string[];
  retention_period?: string;
  blocking_issues?: string[];
}

export interface QEGEvidence {
  version: string;
  gate_type: QEGGateType;
  evidence: QEGEvidenceData;
  decision: QEGGateDecision;
  metadata: {
    timestamp: string;
    actor: string;
    role: string;
    run_id: string;
  };
}

/**
 * QEG Configuration
 */
export interface QEGConfig {
  retentionDays: number;
  requiredApproverRoles: string[];
  roleSeparationRequired: boolean;
}

// === QEG Code-to-Gate Evidence (Evidence-only, no decision) ===

/**
 * Actual quality check result (not hardcoded)
 */
export interface QualityCheckActual {
  name: string;
  status: "pass" | "fail" | "skipped";
  evidence_path?: string;
  details: string;
}

/**
 * Artifact hash for evidence integrity
 */
export interface ArtifactHash {
  artifact: string;
  path: string;
  hash: string;
}

export type ProducerCheckConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "timed_out"
  | "action_required"
  | "skipped"
  | "unknown";

export interface ProducerCheckActual {
  id: string;
  producer: "code-to-gate";
  name: string;
  conclusion: ProducerCheckConclusion;
  readiness_status?: "passed" | "passed_with_risk" | "needs_review" | "blocked_input" | "failed";
  head_sha?: string;
  run_id?: string;
  source_refs?: Array<{
    id: string;
    path: string;
    label?: string;
  }>;
}

export interface QEGAssuranceFindingsSummary {
  total: number;
  unsupported_claims: number;
  by_rule: Record<string, number>;
}

/**
 * QEG Code-to-Gate Evidence - Evidence only, no decision
 * Decision is made by quality-evidence-graph repository exclusively
 */
export interface QEGCodeToGateEvidence {
  version: "ctg.qeg-input/v1";
  producer: "code-to-gate";
  run_id: string;
  commit_sha?: string;
  artifact_dir: string;

  // Evidence fields (no decision)
  findings_summary: {
    total: number;
    by_severity: Record<string, number>;
    by_category: Record<string, number>;
    by_rule: Record<string, number>;
  };

  readiness_status: string;
  schema_compliance: QEGSchemaComplianceResult[];

  quality_checks_actual: QualityCheckActual[];

  producer_checks?: ProducerCheckActual[];

  artifact_hashes: ArtifactHash[];

  /** Optional evidence from assurance inspect. Candidate presence is not a release decision. */
  assurance_findings_summary?: QEGAssuranceFindingsSummary;
}
