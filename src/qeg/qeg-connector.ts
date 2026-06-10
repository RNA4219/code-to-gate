import type { FindingsArtifact, ReleaseReadinessArtifact } from "../types/artifacts.js";
import type {
  ArtifactHash,
  QEGAssuranceFindingsSummary,
  QEGCodeToGateEvidence,
  QEGSchemaComplianceResult,
} from "./qeg-types.js";

const CTG_QEG_VERSION = "ctg.qeg-input/v1";

export function summarizeFindings(findings: FindingsArtifact): {
  total: number;
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
  by_rule: Record<string, number>;
} {
  const by_severity: Record<string, number> = {};
  const by_category: Record<string, number> = {};
  const by_rule: Record<string, number> = {};

  for (const finding of findings.findings) {
    by_severity[finding.severity] = (by_severity[finding.severity] ?? 0) + 1;
    by_category[finding.category] = (by_category[finding.category] ?? 0) + 1;
    by_rule[finding.ruleId] = (by_rule[finding.ruleId] ?? 0) + 1;
  }

  return { total: findings.findings.length, by_severity, by_category, by_rule };
}

export function generateQEGCodeToGateEvidence(
  findings: FindingsArtifact,
  readiness: ReleaseReadinessArtifact,
  schemaResults: QEGSchemaComplianceResult[],
  artifactDir: string,
  runId: string,
  commitSha?: string,
  artifactHashes: ArtifactHash[] = [],
  assuranceSummary?: QEGAssuranceFindingsSummary
): QEGCodeToGateEvidence {
  return {
    version: CTG_QEG_VERSION,
    producer: "code-to-gate",
    run_id: runId,
    commit_sha: commitSha,
    artifact_dir: artifactDir,
    findings_summary: summarizeFindings(findings),
    readiness_status: readiness.status,
    schema_compliance: schemaResults,
    quality_checks_actual: [{
      name: "assurance_inspection",
      status: assuranceSummary ? "pass" : "skipped",
      ...(assuranceSummary ? { evidence_path: "assurance-findings.json" } : {}),
      details: assuranceSummary
        ? `${assuranceSummary.total} review-required candidates recorded`
        : "assurance-findings.json was not provided",
    }],
    artifact_hashes: artifactHashes,
    ...(assuranceSummary ? { assurance_findings_summary: assuranceSummary } : {}),
  };
}

export function summarizeAssuranceFindings(findings: FindingsArtifact): QEGAssuranceFindingsSummary {
  const by_rule: Record<string, number> = {};
  for (const finding of findings.findings) {
    by_rule[finding.ruleId] = (by_rule[finding.ruleId] ?? 0) + 1;
  }
  return {
    total: findings.findings.length,
    unsupported_claims: findings.unsupported_claims.length,
    by_rule,
  };
}

export type { QEGSchemaComplianceResult } from "./qeg-types.js";
