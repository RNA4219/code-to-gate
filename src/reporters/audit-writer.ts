/**
 * Audit Writer - generates audit.json
 */

import {
  AuditArtifact,
  AuditInput,
  AuditPolicy,
  FindingsArtifact,
  NormalizedRepoGraph,
  CTG_VERSION,
} from "../types/artifacts.js";
import { VERSION } from "../cli/exit-codes.js";
import { CtgPolicy } from "../config/policy-loader.js";

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";

export function buildAuditArtifact(
  graph: NormalizedRepoGraph,
  findings: FindingsArtifact,
  policy: CtgPolicy | undefined,
  exitCode: number,
  exitStatus: string,
  exitReason: string
): AuditArtifact {
  const inputs: AuditInput[] = [];

  // Add source files from graph
  for (const file of graph.files) {
    inputs.push({
      path: file.path,
      hash: file.hash,
      kind: file.role === "test" ? "source" : file.role === "config" ? "config" : "source",
    });
  }

  // Build policy section
  const policySection: AuditPolicy = {
    id: policy?.policyId ?? "default",
    name: policy?.policyId,
    hash: policy ? createHash("sha256").update(JSON.stringify(policy)).digest("hex") : "none",
  };

  return {
    version: CTG_VERSION,
    generated_at: new Date().toISOString(),
    run_id: graph.run_id,
    repo: graph.repo,
    tool: {
      name: "code-to-gate",
      version: VERSION,
      policy_id: policy?.policyId,
      plugin_versions: [],
    },
    artifact: "audit",
    schema: "audit@v1",
    inputs,
    policy: policySection,
    exit: {
      code: exitCode,
      status: exitStatus,
      reason: exitReason,
    },
  };
}

/**
 * Write audit.json to output directory
 */
export function writeAuditJson(outDir: string, artifact: AuditArtifact): string {
  const filePath = path.join(outDir, "audit.json");
  writeFileSync(filePath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  return filePath;
}