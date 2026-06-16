export type {
  ArtifactCoverage,
  AssuranceArtifactBundle,
  AssuranceCoverage,
  AssuranceEdge,
  AssuranceEdgeKind,
  AssuranceGraph,
  AssuranceIntake,
  AssuranceIntent,
  AssuranceNode,
  AssuranceNodeKind,
  AssuranceRequirement,
} from "./assurance-graph-types.js";
export { buildAssuranceGraph } from "./assurance-graph-builder.js";

import type {
  AssuranceEdgeKind,
  AssuranceGraph,
  AssuranceNode,
  AssuranceNodeKind,
} from "./assurance-graph-types.js";

export function findNodesByKind(graph: AssuranceGraph, kind: AssuranceNodeKind): AssuranceNode[] {
  return graph.nodes.filter((node) => node.kind === kind);
}

export function findNodeById(graph: AssuranceGraph, id: string): AssuranceNode | undefined {
  return graph.nodes.find((node) => node.id === id);
}

export function findEdgesByKind(graph: AssuranceGraph, kind: AssuranceEdgeKind) {
  return graph.edges.filter((edge) => edge.kind === kind);
}

export function findEdgesFromNode(graph: AssuranceGraph, nodeId: string) {
  return graph.edges.filter((edge) => edge.sourceId === nodeId);
}

export function findEdgesToNode(graph: AssuranceGraph, nodeId: string) {
  return graph.edges.filter((edge) => edge.targetId === nodeId);
}

export function findConnectedNodes(
  graph: AssuranceGraph,
  nodeId: string,
  edgeKind: AssuranceEdgeKind
): AssuranceNode[] {
  const edges = findEdgesFromNode(graph, nodeId).filter((edge) => edge.kind === edgeKind);
  return edges
    .map((edge) => findNodeById(graph, edge.targetId))
    .filter((node): node is AssuranceNode => node !== undefined);
}
