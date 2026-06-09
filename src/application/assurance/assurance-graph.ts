import type {
  Finding,
  RiskSeed,
  TestSeed,
  Invariant,
  ReleaseReadinessArtifact,
  NormalizedRepoGraph,
} from "../../types/artifacts.js";

// Local interfaces for repo-graph internal structure
interface RepoSymbol {
  id: string;
  name: string;
  kind: string;
  fileId?: string;
  exportStatus?: string;
  lines?: { start: number; end: number };
}

interface RepoEntrypoint {
  id: string;
  name: string;
  kind: string;
  fileId?: string;
  symbolId?: string;
  riskLevel?: string;
  intent?: string;
  tags?: string[];
}

// ============================================================================
// AssuranceGraph Types (runtime internal, not public schema)
// ============================================================================

export type AssuranceNodeKind =
  | "requirement"
  | "intent"
  | "finding"
  | "risk"
  | "invariant"
  | "test-seed"
  | "evidence"
  | "file"
  | "symbol"
  | "entrypoint"
  | "readiness-condition";

export type AssuranceEdgeKind =
  | "declares"
  | "derived-from"
  | "supported-by"
  | "tested-by"
  | "maps-to"
  | "affects"
  | "changed-by";

export interface AssuranceNode {
  id: string;
  kind: AssuranceNodeKind;
  sourceArtifact: string;
  data: Record<string, unknown>;
}

export interface AssuranceEdge {
  id: string;
  kind: AssuranceEdgeKind;
  sourceId: string;
  targetId: string;
  sourceArtifact: string;
}

export interface ArtifactCoverage {
  artifact: string;
  loaded: boolean;
  recordCount: number;
  error?: string;
}

export interface AssuranceCoverage {
  artifacts: ArtifactCoverage[];
  loadedArtifacts: string[];
  missingArtifacts: string[];
  partialInput: boolean;
  totalNodes: number;
  totalEdges: number;
}

export interface AssuranceGraph {
  nodes: AssuranceNode[];
  edges: AssuranceEdge[];
  coverage: AssuranceCoverage;
}

// ============================================================================
// Artifact Loading
// ============================================================================

export interface AssuranceArtifactBundle {
  findings?: Finding[];
  riskRegister?: RiskSeed[];
  testSeeds?: TestSeed[];
  invariants?: Invariant[];
  releaseReadiness?: ReleaseReadinessArtifact;
  repoGraph?: NormalizedRepoGraph;
  intake?: AssuranceIntake;
}

export interface AssuranceRequirement {
  id: string;
  title: string;
  status?: string;
  scope?: string[];
}

export interface AssuranceIntent {
  id: string;
  statement: string;
  scope?: string[];
}

export interface AssuranceIntake {
  requirements?: AssuranceRequirement[];
  intents?: AssuranceIntent[];
}

const ARTIFACT_FILES = {
  findings: "findings.json",
  riskRegister: "risk-register.yaml",
  testSeeds: "test-seeds.json",
  invariants: "invariants.json",
  releaseReadiness: "release-readiness.json",
  repoGraph: "repo-graph.json",
  intake: "intake.json",
} as const;

// ============================================================================
// Node Normalization
// ============================================================================

function normalizeFindingNodes(findings: Finding[]): AssuranceNode[] {
  const nodes: AssuranceNode[] = [];

  for (const finding of findings) {
    // Finding node
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

    // Evidence nodes
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

function normalizeRiskNodes(risks: RiskSeed[]): AssuranceNode[] {
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

    // Evidence nodes for risks
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

function normalizeTestSeedNodes(testSeeds: TestSeed[]): AssuranceNode[] {
  const nodes: AssuranceNode[] = [];

  for (const seed of testSeeds) {
    nodes.push({
      id: seed.id,
      kind: "test-seed",
      sourceArtifact: "test-seeds.json",
      data: {
        title: seed.title,
        intent: seed.intent,
        sourceRiskIds: seed.sourceRiskIds,
        sourceFindingIds: seed.sourceFindingIds,
        suggestedLevel: seed.suggestedLevel,
      },
    });

    if (seed.evidence) {
      for (const evidence of seed.evidence) {
        nodes.push({
          id: evidence.id || `test-seed-evidence-${seed.id}-${nodes.length}`,
          kind: "evidence",
          sourceArtifact: "test-seeds.json",
          data: {
            path: evidence.path,
            kind: evidence.kind,
            parentTestSeedId: seed.id,
          },
        });
      }
    }
  }

  return nodes;
}

function normalizeInvariantNodes(invariants: Invariant[]): AssuranceNode[] {
  const nodes: AssuranceNode[] = [];

  for (const invariant of invariants) {
    nodes.push({
      id: invariant.id,
      kind: "invariant",
      sourceArtifact: "invariants.json",
      data: {
        statement: invariant.statement,
        kind: invariant.kind,
        sourceFindingIds: invariant.sourceFindingIds,
        tags: invariant.tags,
      },
    });

    if (invariant.evidence) {
      for (const evidence of invariant.evidence) {
        nodes.push({
          id: evidence.id || `invariant-evidence-${invariant.id}-${nodes.length}`,
          kind: "evidence",
          sourceArtifact: "invariants.json",
          data: {
            path: evidence.path,
            kind: evidence.kind,
            parentInvariantId: invariant.id,
          },
        });
      }
    }
  }

  return nodes;
}

function normalizeReadinessNodes(readiness: ReleaseReadinessArtifact): AssuranceNode[] {
  const nodes: AssuranceNode[] = [];

  // Single readiness-condition node
  nodes.push({
    id: "release-readiness-condition",
    kind: "readiness-condition",
    sourceArtifact: "release-readiness.json",
    data: {
      status: readiness.status,
      completeness: readiness.completeness,
      failedConditions: readiness.failedConditions,
      counts: readiness.counts,
      artifactRefs: readiness.artifactRefs,
    },
  });

  return nodes;
}

function normalizeRepoGraphNodes(repoGraph: NormalizedRepoGraph): AssuranceNode[] {
  const nodes: AssuranceNode[] = [];

  // File nodes
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

  // Symbol nodes
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

  // Entrypoint nodes
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

function resolveScopeNodeId(scope: string, nodes: AssuranceNode[]): string | undefined {
  const directNode = nodes.find((node) => node.id === scope);
  if (directNode) return directNode.id;
  return nodes.find((node) => node.kind === "file" && node.data.path === scope)?.id;
}

function normalizeIntake(
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

// ============================================================================
// Edge Normalization
// ============================================================================

function createEdgeId(sourceId: string, targetId: string, kind: AssuranceEdgeKind): string {
  return `edge-${kind}-${sourceId}-${targetId}`;
}

function normalizeFindingEdges(findings: Finding[]): AssuranceEdge[] {
  const edges: AssuranceEdge[] = [];

  for (const finding of findings) {
    // Finding -> Evidence edges (supported-by)
    for (const evidence of finding.evidence) {
      edges.push({
        id: createEdgeId(finding.id, evidence.id, "supported-by"),
        kind: "supported-by",
        sourceId: finding.id,
        targetId: evidence.id,
        sourceArtifact: "findings.json",
      });
    }

    // Finding -> Symbol edges (affects)
    for (const symbolId of finding.affectedSymbols || []) {
      edges.push({
        id: createEdgeId(finding.id, symbolId, "affects"),
        kind: "affects",
        sourceId: finding.id,
        targetId: symbolId,
        sourceArtifact: "findings.json",
      });
    }

    // Finding -> Entrypoint edges (affects)
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

function normalizeRiskEdges(risks: RiskSeed[]): AssuranceEdge[] {
  const edges: AssuranceEdge[] = [];

  for (const risk of risks) {
    // Risk -> Finding edges (derived-from)
    for (const findingId of risk.sourceFindingIds || []) {
      edges.push({
        id: createEdgeId(risk.id, findingId, "derived-from"),
        kind: "derived-from",
        sourceId: risk.id,
        targetId: findingId,
        sourceArtifact: "risk-register.yaml",
      });
    }

    // Risk -> Evidence edges (supported-by)
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

function normalizeTestSeedEdges(testSeeds: TestSeed[]): AssuranceEdge[] {
  const edges: AssuranceEdge[] = [];

  for (const seed of testSeeds) {
    // TestSeed -> Risk edges (tested-by)
    for (const riskId of seed.sourceRiskIds || []) {
      edges.push({
        id: createEdgeId(seed.id, riskId, "tested-by"),
        kind: "tested-by",
        sourceId: seed.id,
        targetId: riskId,
        sourceArtifact: "test-seeds.json",
      });
    }

    // TestSeed -> Finding edges (derived-from)
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

function normalizeInvariantEdges(invariants: Invariant[]): AssuranceEdge[] {
  const edges: AssuranceEdge[] = [];

  for (const invariant of invariants) {
    // Invariant -> Finding edges (derived-from)
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

function normalizeRepoGraphEdges(repoGraph: NormalizedRepoGraph): AssuranceEdge[] {
  const edges: AssuranceEdge[] = [];

  // Symbol -> File edges (declares)
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

  // Entrypoint -> File/Symbol edges (maps-to)
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

// ============================================================================
// Coverage Tracking
// ============================================================================

function buildCoverage(bundle: AssuranceArtifactBundle): AssuranceCoverage {
  const artifacts: ArtifactCoverage[] = [];
  const loadedArtifacts: string[] = [];
  const missingArtifacts: string[] = [];

  const artifactChecks = [
    { file: ARTIFACT_FILES.findings, data: bundle.findings },
    { file: ARTIFACT_FILES.riskRegister, data: bundle.riskRegister },
    { file: ARTIFACT_FILES.testSeeds, data: bundle.testSeeds },
    { file: ARTIFACT_FILES.invariants, data: bundle.invariants },
    { file: ARTIFACT_FILES.releaseReadiness, data: bundle.releaseReadiness },
    { file: ARTIFACT_FILES.repoGraph, data: bundle.repoGraph },
    { file: ARTIFACT_FILES.intake, data: bundle.intake },
  ] as const;

  for (const check of artifactChecks) {
    const recordCount = check.data
      ? Array.isArray(check.data)
        ? check.data.length
        : 1
      : 0;

    artifacts.push({
      artifact: check.file,
      loaded: check.data !== undefined,
      recordCount,
    });

    if (check.data !== undefined) {
      loadedArtifacts.push(check.file);
    } else {
      missingArtifacts.push(check.file);
    }
  }

  // partialInput = missing any artifact
  const partialInput = missingArtifacts.length > 0;

  return {
    artifacts,
    loadedArtifacts,
    missingArtifacts,
    partialInput,
    totalNodes: 0,  // Will be set after node normalization
    totalEdges: 0,  // Will be set after edge normalization
  };
}

// ============================================================================
// Graph Builder
// ============================================================================

export function buildAssuranceGraph(bundle: AssuranceArtifactBundle): AssuranceGraph {
  const coverage = buildCoverage(bundle);

  const nodes: AssuranceNode[] = [];
  const edges: AssuranceEdge[] = [];

  // Normalize all artifacts into nodes
  if (bundle.findings) {
    nodes.push(...normalizeFindingNodes(bundle.findings));
    edges.push(...normalizeFindingEdges(bundle.findings));
  }

  if (bundle.riskRegister) {
    nodes.push(...normalizeRiskNodes(bundle.riskRegister));
    edges.push(...normalizeRiskEdges(bundle.riskRegister));
  }

  if (bundle.testSeeds) {
    nodes.push(...normalizeTestSeedNodes(bundle.testSeeds));
    edges.push(...normalizeTestSeedEdges(bundle.testSeeds));
  }

  if (bundle.invariants) {
    nodes.push(...normalizeInvariantNodes(bundle.invariants));
    edges.push(...normalizeInvariantEdges(bundle.invariants));
  }

  if (bundle.releaseReadiness) {
    nodes.push(...normalizeReadinessNodes(bundle.releaseReadiness));
  }

  if (bundle.repoGraph) {
    nodes.push(...normalizeRepoGraphNodes(bundle.repoGraph));
    edges.push(...normalizeRepoGraphEdges(bundle.repoGraph));
  }

  if (bundle.intake) {
    const normalizedIntake = normalizeIntake(bundle.intake, nodes);
    nodes.push(...normalizedIntake.nodes);
    edges.push(...normalizedIntake.edges);
  }

  // Update coverage totals
  coverage.totalNodes = nodes.length;
  coverage.totalEdges = edges.length;

  return {
    nodes,
    edges,
    coverage,
  };
}

// ============================================================================
// Graph Query Helpers
// ============================================================================

export function findNodesByKind(graph: AssuranceGraph, kind: AssuranceNodeKind): AssuranceNode[] {
  return graph.nodes.filter(node => node.kind === kind);
}

export function findNodeById(graph: AssuranceGraph, id: string): AssuranceNode | undefined {
  return graph.nodes.find(node => node.id === id);
}

export function findEdgesByKind(graph: AssuranceGraph, kind: AssuranceEdgeKind): AssuranceEdge[] {
  return graph.edges.filter(edge => edge.kind === kind);
}

export function findEdgesFromNode(graph: AssuranceGraph, nodeId: string): AssuranceEdge[] {
  return graph.edges.filter(edge => edge.sourceId === nodeId);
}

export function findEdgesToNode(graph: AssuranceGraph, nodeId: string): AssuranceEdge[] {
  return graph.edges.filter(edge => edge.targetId === nodeId);
}

export function findConnectedNodes(
  graph: AssuranceGraph,
  nodeId: string,
  edgeKind: AssuranceEdgeKind
): AssuranceNode[] {
  const edges = findEdgesFromNode(graph, nodeId).filter(e => e.kind === edgeKind);
  return edges
    .map(edge => findNodeById(graph, edge.targetId))
    .filter((node): node is AssuranceNode => node !== undefined);
}
