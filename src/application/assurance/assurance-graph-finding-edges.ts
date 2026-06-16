import type { Finding, RiskSeed } from "../../types/artifacts.js";
import type { AssuranceEdge } from "./assurance-graph-types.js";
import { createEdgeId } from "./assurance-graph-edges.js";

export function normalizeFindingEdges(findings: Finding[]): AssuranceEdge[] {
  const edges: AssuranceEdge[] = [];

  for (const finding of findings) {
    for (const evidence of finding.evidence) {
      edges.push({
        id: createEdgeId(finding.id, evidence.id, "supported-by"),
        kind: "supported-by",
        sourceId: finding.id,
        targetId: evidence.id,
        sourceArtifact: "findings.json",
      });
    }

    for (const symbolId of finding.affectedSymbols || []) {
      edges.push({
        id: createEdgeId(finding.id, symbolId, "affects"),
        kind: "affects",
        sourceId: finding.id,
        targetId: symbolId,
        sourceArtifact: "findings.json",
      });
    }

    for (const entrypointId of finding.affectedEntrypoints || []) {
      edges.push({
        id: createEdgeId(finding.id, entrypointId, "affects"),
        kind: "affects",
        sourceId: finding.id,
        targetId: entrypointId,
        sourceArtifact: "findings.json",
      });
    }
  }

  return edges;
}

export function normalizeRiskEdges(risks: RiskSeed[]): AssuranceEdge[] {
  const edges: AssuranceEdge[] = [];

  for (const risk of risks) {
    for (const findingId of risk.sourceFindingIds || []) {
      edges.push({
        id: createEdgeId(risk.id, findingId, "derived-from"),
        kind: "derived-from",
        sourceId: risk.id,
        targetId: findingId,
        sourceArtifact: "risk-register.yaml",
      });
    }

    if (risk.evidence) {
      for (const evidence of risk.evidence) {
        edges.push({
          id: createEdgeId(risk.id, evidence.id || `risk-evidence-${risk.id}`, "supported-by"),
          kind: "supported-by",
          sourceId: risk.id,
          targetId: evidence.id || `risk-evidence-${risk.id}`,
          sourceArtifact: "risk-register.yaml",
        });
      }
    }
  }

  return edges;
}
