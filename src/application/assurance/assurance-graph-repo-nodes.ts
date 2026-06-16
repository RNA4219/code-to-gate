import type { NormalizedRepoGraph } from "../../types/artifacts.js";
import {
  ARTIFACT_FILES,
  type AssuranceEdge,
  type AssuranceIntake,
  type AssuranceNode,
  type RepoEntrypoint,
  type RepoSymbol,
} from "./assurance-graph-types.js";
import { createEdgeId } from "./assurance-graph-edges.js";

export function normalizeRepoGraphNodes(repoGraph: NormalizedRepoGraph): AssuranceNode[] {
  const nodes: AssuranceNode[] = [];

  for (const file of repoGraph.files || []) {
    nodes.push({
      id: file.id || `file-${file.path}`,
      kind: "file",
      sourceArtifact: "repo-graph.json",
      data: {
        path: file.path,
        language: file.language,
        role: file.role,
        lineCount: file.lineCount,
      },
    });
  }

  for (const symbolRaw of repoGraph.symbols || []) {
    const symbol = symbolRaw as RepoSymbol;
    nodes.push({
      id: symbol.id,
      kind: "symbol",
      sourceArtifact: "repo-graph.json",
      data: {
        name: symbol.name,
        kind: symbol.kind,
        fileId: symbol.fileId,
        exportStatus: symbol.exportStatus,
        lines: symbol.lines,
      },
    });
  }

  for (const entrypointRaw of repoGraph.entrypoints || []) {
    const entrypoint = entrypointRaw as RepoEntrypoint;
    nodes.push({
      id: entrypoint.id,
      kind: "entrypoint",
      sourceArtifact: "repo-graph.json",
      data: {
        name: entrypoint.name,
        kind: entrypoint.kind,
        fileId: entrypoint.fileId,
        symbolId: entrypoint.symbolId,
        riskLevel: entrypoint.riskLevel,
        intent: entrypoint.intent,
        tags: entrypoint.tags,
      },
    });
  }

  return nodes;
}

export function normalizeIntake(
  intake: AssuranceIntake,
  existingNodes: AssuranceNode[]
): { nodes: AssuranceNode[]; edges: AssuranceEdge[] } {
  const nodes: AssuranceNode[] = [];
  const edges: AssuranceEdge[] = [];

  for (const requirement of intake.requirements ?? []) {
    nodes.push({
      id: requirement.id,
      kind: "requirement",
      sourceArtifact: ARTIFACT_FILES.intake,
      data: { title: requirement.title, status: requirement.status, scope: requirement.scope },
    });
  }
  for (const intent of intake.intents ?? []) {
    nodes.push({
      id: intent.id,
      kind: "intent",
      sourceArtifact: ARTIFACT_FILES.intake,
      data: { statement: intent.statement, scope: intent.scope },
    });
  }

  const scopeSources = [
    ...(intake.requirements ?? []).map((item) => ({ id: item.id, scope: item.scope })),
    ...(intake.intents ?? []).map((item) => ({ id: item.id, scope: item.scope })),
  ];
  for (const source of scopeSources) {
    for (const scope of source.scope ?? []) {
      const targetId = resolveScopeNodeId(scope, existingNodes);
      if (!targetId) continue;
      edges.push({
        id: createEdgeId(source.id, targetId, "affects"),
        kind: "affects",
        sourceId: source.id,
        targetId,
        sourceArtifact: ARTIFACT_FILES.intake,
      });
    }
  }

  return { nodes, edges };
}

function resolveScopeNodeId(scope: string, nodes: AssuranceNode[]): string | undefined {
  const directNode = nodes.find((node) => node.id === scope);
  if (directNode) return directNode.id;
  return nodes.find((node) => node.kind === "file" && node.data.path === scope)?.id;
}
