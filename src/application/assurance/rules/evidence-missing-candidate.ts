import type { AssuranceGraph, AssuranceNode } from "../assurance-graph.js";
import { getNodeById, type AssuranceEvidenceInput } from "../detection-rules.js";
import type { EvidenceValidationResult } from "./evidence-missing-validation.js";

export function buildEvidenceMissingTitle(result: EvidenceValidationResult): string {
  const reasonText: Record<string, string> = {
    missing_evidence: "Evidence missing",
    path_not_found: "Evidence path not found in repo",
    invalid_lines: "Evidence line range invalid",
    dangling_ref: "Dangling reference in artifact",
  };

  const sourceId = result.sourceFindingId || result.sourceRiskId ||
    result.sourceInvariantId || result.sourceTestSeedId || "unknown";

  const reason = result.reason ?? "unknown";
  return `${reasonText[reason] ?? "Evidence issue"} in ${result.sourceArtifact}: ${sourceId}`;
}

export function buildEvidenceMissingSummary(result: EvidenceValidationResult): string {
  const lines = buildReasonLines(result);

  lines.push(`Source artifact: ${result.sourceArtifact}`);

  if (result.sourceFindingId) lines.push(`Source finding: ${result.sourceFindingId}`);
  if (result.sourceRiskId) lines.push(`Source risk: ${result.sourceRiskId}`);
  if (result.sourceInvariantId) lines.push(`Source invariant: ${result.sourceInvariantId}`);
  if (result.sourceTestSeedId) lines.push(`Source test seed: ${result.sourceTestSeedId}`);

  return lines.join(" ");
}

export function buildEvidenceMissingCandidateEvidence(
  result: EvidenceValidationResult,
  graph: AssuranceGraph
): AssuranceEvidenceInput[] {
  const evidenceInputs: AssuranceEvidenceInput[] = [];

  if (result.evidence) {
    evidenceInputs.push({
      path: result.evidence.path || "unknown",
      kind: "external",
      externalRef: {
        tool: "code-to-gate",
        ruleId: result.reason,
      },
    });
  }

  const sourceNode = findSourceNode(graph, result);
  if (sourceNode && sourceNode.data.path) {
    evidenceInputs.push({
      path: sourceNode.data.path as string,
      kind: "external",
      externalRef: {
        tool: "code-to-gate",
        ruleId: `source-artifact:${result.sourceArtifact}`,
      },
    });
  }

  return evidenceInputs;
}

function buildReasonLines(result: EvidenceValidationResult): string[] {
  const lines: string[] = [];

  if (result.reason === "missing_evidence") {
    lines.push("Evidence has empty or missing path.");
  } else if (result.reason === "path_not_found") {
    lines.push(`Evidence path "${result.evidence?.path}" not found in repo-graph.json files.`);
  } else if (result.reason === "invalid_lines") {
    const ev = result.evidence;
    lines.push(`Evidence line range invalid: startLine=${ev?.startLine}, endLine=${ev?.endLine}.`);
    if (result.lineValidationDetail) {
      lines.push(`Detail: ${result.lineValidationDetail}.`);
    }
  } else if (result.reason === "dangling_ref") {
    lines.push("Graph edge references node that does not exist.");
  }

  return lines;
}

function findSourceNode(
  graph: AssuranceGraph,
  result: EvidenceValidationResult
): AssuranceNode | undefined {
  if (result.sourceFindingId) return getNodeById(graph, result.sourceFindingId);
  if (result.sourceRiskId) return getNodeById(graph, result.sourceRiskId);
  if (result.sourceInvariantId) return getNodeById(graph, result.sourceInvariantId);
  if (result.sourceTestSeedId) return getNodeById(graph, result.sourceTestSeedId);
  return undefined;
}
