import type {
  Invariant,
  ReleaseReadinessArtifact,
  TestSeed,
} from "../../types/artifacts.js";
import type { AssuranceNode } from "./assurance-graph-types.js";

export function normalizeTestSeedNodes(testSeeds: TestSeed[]): AssuranceNode[] {
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

export function normalizeInvariantNodes(invariants: Invariant[]): AssuranceNode[] {
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

export function normalizeReadinessNodes(readiness: ReleaseReadinessArtifact): AssuranceNode[] {
  return [{
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
  }];
}
