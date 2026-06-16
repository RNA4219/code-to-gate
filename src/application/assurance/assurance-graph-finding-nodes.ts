import type { Finding, RiskSeed } from "../../types/artifacts.js";
import type { AssuranceNode } from "./assurance-graph-types.js";

export function normalizeFindingNodes(findings: Finding[]): AssuranceNode[] {
  const nodes: AssuranceNode[] = [];

  for (const finding of findings) {
    nodes.push({
      id: finding.id,
      kind: "finding",
      sourceArtifact: "findings.json",
      data: {
        ruleId: finding.ruleId,
        category: finding.category,
        severity: finding.severity,
        confidence: finding.confidence,
        title: finding.title,
        summary: finding.summary,
        tags: finding.tags,
        affectedSymbols: finding.affectedSymbols,
        affectedEntrypoints: finding.affectedEntrypoints,
      },
    });

    for (const evidence of finding.evidence) {
      nodes.push({
        id: evidence.id,
        kind: "evidence",
        sourceArtifact: "findings.json",
        data: {
          path: evidence.path,
          kind: evidence.kind,
          startLine: evidence.startLine,
          endLine: evidence.endLine,
          excerptHash: evidence.excerptHash,
          nodeId: evidence.nodeId,
          symbolId: evidence.symbolId,
          externalRef: evidence.externalRef,
          parentFindingId: finding.id,
        },
      });
    }
  }

  return nodes;
}

export function normalizeRiskNodes(risks: RiskSeed[]): AssuranceNode[] {
  const nodes: AssuranceNode[] = [];

  for (const risk of risks) {
    nodes.push({
      id: risk.id,
      kind: "risk",
      sourceArtifact: "risk-register.yaml",
      data: {
        title: risk.title,
        severity: risk.severity,
        likelihood: risk.likelihood,
        sourceFindingIds: risk.sourceFindingIds,
      },
    });

    if (risk.evidence) {
      for (const evidence of risk.evidence) {
        nodes.push({
          id: evidence.id || `risk-evidence-${risk.id}-${nodes.length}`,
          kind: "evidence",
          sourceArtifact: "risk-register.yaml",
          data: {
            path: evidence.path,
            kind: evidence.kind,
            parentRiskId: risk.id,
          },
        });
      }
    }
  }

  return nodes;
}
