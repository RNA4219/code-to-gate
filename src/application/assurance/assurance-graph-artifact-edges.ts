import type { Invariant, NormalizedRepoGraph, TestSeed } from "../../types/artifacts.js";
import type { AssuranceEdge, RepoEntrypoint, RepoSymbol } from "./assurance-graph-types.js";
import { createEdgeId } from "./assurance-graph-edges.js";

export function normalizeTestSeedEdges(testSeeds: TestSeed[]): AssuranceEdge[] {
  const edges: AssuranceEdge[] = [];

  for (const seed of testSeeds) {
    for (const riskId of seed.sourceRiskIds || []) {
      edges.push({
        id: createEdgeId(seed.id, riskId, "tested-by"),
        kind: "tested-by",
        sourceId: seed.id,
        targetId: riskId,
        sourceArtifact: "test-seeds.json",
      });
    }

    for (const findingId of seed.sourceFindingIds || []) {
      edges.push({
        id: createEdgeId(seed.id, findingId, "derived-from"),
        kind: "derived-from",
        sourceId: seed.id,
        targetId: findingId,
        sourceArtifact: "test-seeds.json",
      });
    }
  }

  return edges;
}

export function normalizeInvariantEdges(invariants: Invariant[]): AssuranceEdge[] {
  const edges: AssuranceEdge[] = [];

  for (const invariant of invariants) {
    for (const findingId of invariant.sourceFindingIds || []) {
      edges.push({
        id: createEdgeId(invariant.id, findingId, "derived-from"),
        kind: "derived-from",
        sourceId: invariant.id,
        targetId: findingId,
        sourceArtifact: "invariants.json",
      });
    }
  }

  return edges;
}

export function normalizeRepoGraphEdges(repoGraph: NormalizedRepoGraph): AssuranceEdge[] {
  const edges: AssuranceEdge[] = [];

  for (const symbolRaw of repoGraph.symbols || []) {
    const symbol = symbolRaw as RepoSymbol;
    if (symbol.fileId) {
      edges.push({
        id: createEdgeId(symbol.id, symbol.fileId, "declares"),
        kind: "declares",
        sourceId: symbol.id,
        targetId: symbol.fileId,
        sourceArtifact: "repo-graph.json",
      });
    }
  }

  for (const entrypointRaw of repoGraph.entrypoints || []) {
    const entrypoint = entrypointRaw as RepoEntrypoint;
    if (entrypoint.fileId) {
      edges.push({
        id: createEdgeId(entrypoint.id, entrypoint.fileId, "maps-to"),
        kind: "maps-to",
        sourceId: entrypoint.id,
        targetId: entrypoint.fileId,
        sourceArtifact: "repo-graph.json",
      });
    }
    if (entrypoint.symbolId) {
      edges.push({
        id: createEdgeId(entrypoint.id, entrypoint.symbolId, "maps-to"),
        kind: "maps-to",
        sourceId: entrypoint.id,
        targetId: entrypoint.symbolId,
        sourceArtifact: "repo-graph.json",
      });
    }
  }

  return edges;
}
