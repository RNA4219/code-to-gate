import {
  ARTIFACT_FILES,
  type ArtifactCoverage,
  type AssuranceArtifactBundle,
  type AssuranceCoverage,
  type AssuranceEdge,
  type AssuranceGraph,
  type AssuranceNode,
} from "./assurance-graph-types.js";
import {
  normalizeFindingEdges,
  normalizeInvariantEdges,
  normalizeRepoGraphEdges,
  normalizeRiskEdges,
  normalizeTestSeedEdges,
} from "./assurance-graph-edges.js";
import {
  normalizeFindingNodes,
  normalizeIntake,
  normalizeInvariantNodes,
  normalizeReadinessNodes,
  normalizeRepoGraphNodes,
  normalizeRiskNodes,
  normalizeTestSeedNodes,
} from "./assurance-graph-nodes.js";

export function buildAssuranceGraph(bundle: AssuranceArtifactBundle): AssuranceGraph {
  const coverage = buildCoverage(bundle);

  const nodes: AssuranceNode[] = [];
  const edges: AssuranceEdge[] = [];

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

  coverage.totalNodes = nodes.length;
  coverage.totalEdges = edges.length;

  return { nodes, edges, coverage };
}

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

  return {
    artifacts,
    loadedArtifacts,
    missingArtifacts,
    partialInput: missingArtifacts.length > 0,
    totalNodes: 0,
    totalEdges: 0,
  };
}
