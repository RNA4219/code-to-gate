import type {
  Finding,
  RiskSeed,
  TestSeed,
  Invariant,
  ReleaseReadinessArtifact,
  NormalizedRepoGraph,
} from "../../types/artifacts.js";

export interface RepoSymbol {
  id: string;
  name: string;
  kind: string;
  fileId?: string;
  exportStatus?: string;
  lines?: { start: number; end: number };
}

export interface RepoEntrypoint {
  id: string;
  name: string;
  kind: string;
  fileId?: string;
  symbolId?: string;
  riskLevel?: string;
  intent?: string;
  tags?: string[];
}

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

export const ARTIFACT_FILES = {
  findings: "findings.json",
  riskRegister: "risk-register.yaml",
  testSeeds: "test-seeds.json",
  invariants: "invariants.json",
  releaseReadiness: "release-readiness.json",
  repoGraph: "repo-graph.json",
  intake: "intake.json",
} as const;
