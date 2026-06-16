import type { AssuranceGraph, AssuranceNode } from "../assurance-graph.js";
import { findEdgesByKind, findNodesByKind, getNodeById } from "../detection-rules.js";

export interface EntrypointIntentResult {
  entrypointId: string;
  entrypointName: string;
  isCritical: boolean;
  isChanged: boolean;
  hasIntentTrace: boolean;
  traceDetails: string[];
}

export function analyzeEntrypointIntentRecoverability(graph: AssuranceGraph): EntrypointIntentResult[] {
  const results: EntrypointIntentResult[] = [];
  const entrypointNodes = findNodesByKind(graph, "entrypoint");

  for (const entrypointNode of entrypointNodes) {
    const entrypointId = entrypointNode.id;
    const entrypointName = entrypointNode.data.name as string || `Entrypoint ${entrypointId}`;

    results.push({
      entrypointId,
      entrypointName,
      isCritical: isCriticalEntrypoint(entrypointNode),
      isChanged: isChangedEntrypoint(graph, entrypointId),
      hasIntentTrace: hasIntentTraceability(graph, entrypointId),
      traceDetails: collectTraceDetails(graph, entrypointNode),
    });
  }

  return results;
}

function hasIntentTraceability(graph: AssuranceGraph, entrypointId: string): boolean {
  const entrypointNode = getNodeById(graph, entrypointId);
  if (!entrypointNode) return false;

  if (entrypointNode.data.intent as string | undefined) return true;

  const mapsToEdges = findEdgesByKind(graph, "maps-to");
  const hasIntentLink = mapsToEdges.some((edge) => {
    if (edge.sourceId !== entrypointId) return false;
    const targetNode = getNodeById(graph, edge.targetId);
    return targetNode?.kind === "intent" || targetNode?.kind === "requirement";
  });
  if (hasIntentLink) return true;

  const affectsEdges = findEdgesByKind(graph, "affects");
  const hasInvariantLink = affectsEdges.some((edge) => {
    if (edge.targetId !== entrypointId) return false;
    const sourceNode = getNodeById(graph, edge.sourceId);
    return sourceNode?.kind === "intent" ||
      sourceNode?.kind === "requirement" ||
      sourceNode?.kind === "invariant";
  });
  if (hasInvariantLink) return true;

  const testedByEdges = findEdgesByKind(graph, "tested-by");
  const hasTestLink = testedByEdges.some((edge) => {
    if (edge.targetId !== entrypointId) return false;
    const sourceNode = getNodeById(graph, edge.sourceId);
    return sourceNode?.kind === "test-seed";
  });
  if (hasTestLink) return true;

  const symbolId = entrypointNode.data.symbolId as string | undefined;
  if (!symbolId || !getNodeById(graph, symbolId)) return false;

  return testedByEdges.some((edge) => {
    if (edge.targetId !== symbolId) return false;
    const sourceNode = getNodeById(graph, edge.sourceId);
    return sourceNode?.kind === "test-seed";
  });
}

function collectTraceDetails(graph: AssuranceGraph, entrypointNode: AssuranceNode): string[] {
  const traceDetails: string[] = [];
  const entrypointId = entrypointNode.id;

  if (entrypointNode.data.intent as string | undefined) {
    traceDetails.push("has declared intent");
  }

  const requirementLinks = findEdgesByKind(graph, "maps-to").filter(
    (edge) => edge.sourceId === entrypointId
  );
  if (requirementLinks.length > 0) {
    traceDetails.push(`linked to ${requirementLinks.length} requirements`);
  }

  const invariantLinks = findEdgesByKind(graph, "affects").filter((edge) => {
    if (edge.targetId !== entrypointId) return false;
    const sourceNode = getNodeById(graph, edge.sourceId);
    return sourceNode?.kind === "invariant";
  });
  if (invariantLinks.length > 0) {
    traceDetails.push(`covered by ${invariantLinks.length} invariants`);
  }

  const testLinks = findEdgesByKind(graph, "tested-by").filter((edge) => {
    if (edge.targetId !== entrypointId) return false;
    const sourceNode = getNodeById(graph, edge.sourceId);
    return sourceNode?.kind === "test-seed";
  });
  if (testLinks.length > 0) {
    traceDetails.push(`tested by ${testLinks.length} tests`);
  }

  return traceDetails;
}

function isCriticalEntrypoint(entrypointNode: AssuranceNode): boolean {
  const riskLevel = entrypointNode.data.riskLevel as string | undefined;
  if (riskLevel === "critical" || riskLevel === "high") return true;

  const kind = entrypointNode.data.kind as string | undefined;
  if (kind === "business" || kind === "security") return true;

  const tags = entrypointNode.data.tags as string[] | undefined;
  return Boolean(tags && (
    tags.includes("critical-path") ||
    tags.includes("security-path") ||
    tags.includes("business-path")
  ));
}

function isChangedEntrypoint(graph: AssuranceGraph, entrypointId: string): boolean {
  return findEdgesByKind(graph, "changed-by").some((edge) => edge.targetId === entrypointId);
}
