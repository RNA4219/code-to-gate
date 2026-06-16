import type { AssuranceEdgeKind } from "./assurance-graph-types.js";

export function createEdgeId(sourceId: string, targetId: string, kind: AssuranceEdgeKind): string {
  return `edge-${kind}-${sourceId}-${targetId}`;
}

export {
  normalizeFindingEdges,
  normalizeRiskEdges,
} from "./assurance-graph-finding-edges.js";
export {
  normalizeInvariantEdges,
  normalizeRepoGraphEdges,
  normalizeTestSeedEdges,
} from "./assurance-graph-artifact-edges.js";
