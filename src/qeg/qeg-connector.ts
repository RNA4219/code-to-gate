import type { FindingsArtifact, ReleaseReadinessArtifact } from "../types/artifacts.js";
import type {
  ArtifactHash,
  QEGAssuranceFindingsSummary,
  QEGCodeToGateEvidence,
  QEGSchemaComplianceResult,
  ProducerCheckActual,
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

export function readinessStatusToProducerConclusion(
  status: ReleaseReadinessArtifact["status"]
): ProducerCheckActual["conclusion"] {
  switch (status) {
    case "passed":
    case "passed_with_risk":
      return "success";
    case "needs_review":
      return "neutral";
    case "blocked_input":
    case "failed":
      return "failure";
    default:
      return "unknown";
  }
}

export function buildReadinessProducerCheck(
  readiness: ReleaseReadinessArtifact,
  runId: string,
  commitSha?: string
): ProducerCheckActual {
  return {
    id: "ctg:producer-check-release-readiness",
    producer: "code-to-gate",
    name: "release-readiness",
    conclusion: readinessStatusToProducerConclusion(readiness.status),
    readiness_status: readiness.status,
    ...(commitSha ? { head_sha: commitSha } : {}),
    run_id: `ctg:${runId}`,
    source_refs: [{
      id: "ctg:sr-release-readiness",
      path: "release-readiness.json",
      label: "code-to-gate release readiness verdict",
    }],
  };
}

export function generateQEGCodeToGateEvidence(
  findings: FindingsArtifact,
  readiness: ReleaseReadinessArtifact,
  schemaResults: QEGSchemaComplianceResult[],
  artifactDir: string,
  runId: string,
  commitSha?: string,
  artifactHashes: ArtifactHash[] = [],
  assuranceSummary?: QEGAssuranceFindingsSummary,
  producerChecks: ProducerCheckActual[] = [buildReadinessProducerCheck(readiness, runId, commitSha)]
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
    producer_checks: producerChecks,
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
