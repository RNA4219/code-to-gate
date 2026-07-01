/**
 * Raw Findings Reporter - generates raw-findings.json
 *
 * Raw findings are all findings BEFORE suppression, with summary counts
 * for self-analysis transparency. Used to track suppressed findings count
 * and verify raw/effective/accepted counts consistency.
 */

import type { FindingsArtifact, Severity } from "../types/artifacts.js";
import { writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Raw findings artifact with summary counts
 * Uses Omit to avoid type conflict with FindingsArtifact's artifact field
 */
export type RawFindingsArtifact = Omit<FindingsArtifact, "artifact" | "schema"> & {
  artifact: "raw-findings";
  schema: "raw-findings@v1";
  bySeverity: Record<Severity, number>;
  byRule: Record<string, number>;
};

/**
 * Generate raw findings artifact from all findings (before suppression)
 */
export function generateRawFindingsArtifact(
  findings: FindingsArtifact,
  repoRoot: string,
  runId: string,
  toolVersion: string,
  policyId?: string
): RawFindingsArtifact {
  // Count by severity
  const bySeverity: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const f of findings.findings) {
    bySeverity[f.severity]++;
  }

  // Count by rule
  const byRule: Record<string, number> = {};
  for (const f of findings.findings) {
    byRule[f.ruleId] = (byRule[f.ruleId] || 0) + 1;
  }

  return {
    version: findings.version,
    generated_at: findings.generated_at,
    run_id: runId,
    repo: { ...findings.repo, root: repoRoot },
    tool: {
      name: "code-to-gate",
      version: toolVersion,
      plugin_versions: [],
      policy_id: policyId,
    },
    artifact: "raw-findings",
    schema: "raw-findings@v1",
    completeness: findings.findings.length > 0 ? "complete" : "partial",
    findings: findings.findings,
    unsupported_claims: findings.unsupported_claims,
    bySeverity,
    byRule,
  };
}

/**
 * Write raw-findings.json to output directory
 */
export function writeRawFindingsJson(outDir: string, artifact: RawFindingsArtifact): string {
  const filePath = path.join(outDir, "raw-findings.json");
  writeFileSync(filePath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  return filePath;
}
