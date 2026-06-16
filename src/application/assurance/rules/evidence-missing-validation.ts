import type { EvidenceRef } from "../../../types/artifacts.js";
import type { AssuranceGraph, AssuranceNode } from "../assurance-graph.js";
import { findNodesByKind, nodeExists } from "../detection-rules.js";

export interface EvidenceForValidation {
  id: string;
  path: string;
  kind: EvidenceRef["kind"];
  startLine?: number;
  endLine?: number;
}

export interface EvidenceValidationResult {
  valid: boolean;
  reason?: "missing_evidence" | "path_not_found" | "invalid_lines" | "dangling_ref";
  evidence?: EvidenceForValidation;
  sourceFindingId?: string;
  sourceRiskId?: string;
  sourceInvariantId?: string;
  sourceTestSeedId?: string;
  sourceArtifact: string;
  lineValidationDetail?: string;
}

export function findEvidenceGaps(graph: AssuranceGraph): EvidenceValidationResult[] {
  return [
    ...validateEvidenceNodes(graph),
    ...findDanglingReferences(graph),
  ];
}

function validateEvidenceNodes(graph: AssuranceGraph): EvidenceValidationResult[] {
  const results: EvidenceValidationResult[] = [];
  const evidenceNodes = findNodesByKind(graph, "evidence");

  for (const evidenceNode of evidenceNodes) {
    const evidence = toEvidenceForValidation(evidenceNode);
    if (evidence.kind === "external") continue;

    const common = {
      evidence,
      sourceArtifact: evidenceNode.sourceArtifact,
      sourceFindingId: evidenceNode.data.parentFindingId as string,
      sourceRiskId: evidenceNode.data.parentRiskId as string,
      sourceInvariantId: evidenceNode.data.parentInvariantId as string,
      sourceTestSeedId: evidenceNode.data.parentTestSeedId as string,
    };

    if (!evidence.path || evidence.path.trim() === "") {
      results.push({ valid: false, reason: "missing_evidence", ...common });
      continue;
    }

    if (!pathExistsInRepoGraph(graph, evidence.path)) {
      results.push({ valid: false, reason: "path_not_found", ...common });
      continue;
    }

    const lineValidation = validateLineRange(graph, evidence);
    if (!lineValidation.valid) {
      results.push({
        valid: false,
        reason: "invalid_lines",
        lineValidationDetail: lineValidation.reason,
        ...common,
      });
    }
  }

  return results;
}

function findDanglingReferences(graph: AssuranceGraph): EvidenceValidationResult[] {
  const results: EvidenceValidationResult[] = [];

  for (const edge of graph.edges) {
    if (!nodeExists(graph, edge.sourceId)) {
      results.push({ valid: false, reason: "dangling_ref", sourceArtifact: edge.sourceArtifact });
    }

    if (!nodeExists(graph, edge.targetId)) {
      results.push({ valid: false, reason: "dangling_ref", sourceArtifact: edge.sourceArtifact });
    }
  }

  return results;
}

function toEvidenceForValidation(evidenceNode: AssuranceNode): EvidenceForValidation {
  return {
    id: evidenceNode.id,
    path: evidenceNode.data.path as string,
    kind: evidenceNode.data.kind as EvidenceRef["kind"],
    startLine: evidenceNode.data.startLine as number | undefined,
    endLine: evidenceNode.data.endLine as number | undefined,
  };
}

function pathExistsInRepoGraph(graph: AssuranceGraph, evidencePath: string): boolean {
  const fileNodes = findNodesByKind(graph, "file");
  const normalizedPath = evidencePath.replaceAll("\\", "/");

  return fileNodes.some((file) => {
    const filePath = (file.data.path as string)?.replaceAll("\\", "/");
    return filePath === normalizedPath;
  });
}

function validateLineRange(
  graph: AssuranceGraph,
  evidence: EvidenceForValidation
): { valid: boolean; reason?: string } {
  if (evidence.startLine === undefined || evidence.endLine === undefined) {
    return { valid: true };
  }

  if (evidence.startLine > evidence.endLine) {
    return { valid: false, reason: "startLine > endLine" };
  }

  if (evidence.startLine < 1 || evidence.endLine < 1) {
    return { valid: false, reason: "line < 1" };
  }

  const lineCount = getFileLineCount(graph, evidence.path);
  if (lineCount !== null && evidence.endLine > lineCount) {
    return { valid: false, reason: `endLine ${evidence.endLine} > file lineCount ${lineCount}` };
  }

  return { valid: true };
}

function getFileLineCount(graph: AssuranceGraph, evidencePath: string): number | null {
  const fileNodes = findNodesByKind(graph, "file");
  const normalizedPath = evidencePath.replaceAll("\\", "/");

  const fileNode = fileNodes.find((file) => {
    const filePath = (file.data.path as string)?.replaceAll("\\", "/");
    return filePath === normalizedPath;
  });

  if (!fileNode) return null;
  return (fileNode.data.lineCount as number) ?? null;
}
