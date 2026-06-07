/**
 * QEG Connector - Quality Evidence Graph export module
 * Generates evidence-only exports for quality-evidence-graph decision process
 * Core principle: code-to-gate generates evidence, quality-evidence-graph makes decisions
 */

import {
  QEGSchemaComplianceResult,
  QEGCodeToGateEvidence,
  QualityCheckActual,
  ArtifactHash,
} from "./qeg-types.js";
import { FindingsArtifact } from "../types/artifacts.js";
import { ReleaseReadinessArtifact } from "../types/artifacts.js";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const CTG_QEG_VERSION = "ctg.qeg-input/v1";

/**
 * Summarize findings for QEG evidence
 */
export function summarizeFindings(findings: FindingsArtifact): {
  total: number;
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
  by_rule: Record<string, number>;
} {
  const total = findings.findings.length;
  const by_severity: Record<string, number> = {};
  const by_category: Record<string, number> = {};
  const by_rule: Record<string, number> = {};

  for (const f of findings.findings) {
    by_severity[f.severity] = (by_severity[f.severity] || 0) + 1;
    by_category[f.category] = (by_category[f.category] || 0) + 1;
    by_rule[f.ruleId] = (by_rule[f.ruleId] || 0) + 1;
  }

  return {
    total,
    by_severity,
    by_category,
    by_rule,
  };
}

/**
 * Compute SHA-256 hash of artifact file
 */
function computeArtifactHash(filePath: string): string {
  const content = readFileSync(filePath);
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

/**
 * Generate artifact hashes for evidence integrity
 */
export function generateArtifactHashes(artifactDir: string): ArtifactHash[] {
  const artifacts = [
    "findings.json",
    "release-readiness.json",
    "repo-graph.json",
    "audit.json",
    "risk-register.yaml",
    "test-seeds.json",
    "invariants.json",
  ];

  const hashes: ArtifactHash[] = [];

  for (const artifact of artifacts) {
    const filePath = path.join(artifactDir, artifact);
    if (existsSync(filePath)) {
      hashes.push({
        artifact,
        path: filePath,
        hash: computeArtifactHash(filePath),
      });
    }
  }

  return hashes;
}

/**
 * Generate QEG Code-to-Gate Evidence (evidence only, no decision)
 * Decision is made by quality-evidence-graph repository exclusively
 */
export function generateQEGCodeToGateEvidence(
  findings: FindingsArtifact,
  readiness: ReleaseReadinessArtifact,
  schemaResults: QEGSchemaComplianceResult[],
  artifactDir: string,
  runId: string,
  commitSha?: string
): QEGCodeToGateEvidence {
  const findingsSummary = summarizeFindings(findings);
  const artifactHashes = generateArtifactHashes(artifactDir);

  // Only include checks backed by an actual result artifact.
  const qualityChecksActual: QualityCheckActual[] = [];

  return {
    version: CTG_QEG_VERSION,
    producer: "code-to-gate",
    run_id: runId,
    commit_sha: commitSha,
    artifact_dir: artifactDir,
    findings_summary: findingsSummary,
    readiness_status: readiness.status,
    schema_compliance: schemaResults,
    quality_checks_actual: qualityChecksActual,
    artifact_hashes: artifactHashes,
  };
}

/**
 * Write QEG Code-to-Gate evidence to file
 */
export function writeQEGCodeToGateEvidence(outDir: string, evidence: QEGCodeToGateEvidence): string {
  const filePath = path.join(outDir, "qeg-code-to-gate.json");
  writeFileSync(filePath, JSON.stringify(evidence, null, 2), "utf8");
  return filePath;
}

/**
 * Load QEG Code-to-Gate evidence from file
 */
export function loadQEGCodeToGateEvidence(dir: string): QEGCodeToGateEvidence | null {
  const filePath = path.join(dir, "qeg-code-to-gate.json");

  try {
    const content = readFileSync(filePath, "utf8");
    return JSON.parse(content) as QEGCodeToGateEvidence;
  } catch {
    return null;
  }
}

// === Legacy types preserved for backward compatibility ===

// These are kept for any existing integrations but deprecated
// New code should use QEGCodeToGateEvidence

export type { QEGSchemaComplianceResult } from "./qeg-types.js";
