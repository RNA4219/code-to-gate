import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type {
  EvidenceDagArtifact,
  EvidenceDagEdge,
  EvidenceDagEdgeType,
  EvidenceDagNode,
  EvidenceDagNodeType,
  FindingsArtifact,
  ReleaseReadinessArtifact,
} from "../types/artifacts.js";

export interface GenerateEvidenceDagOptions {
  artifactDir: string;
  cwd: string;
  version: string;
  ciEnv?: NodeJS.ProcessEnv;
}

interface ArtifactCandidate {
  name: string;
  file: string;
  schema: string;
  downstream?: boolean;
}

const ARTIFACT_CANDIDATES: ArtifactCandidate[] = [
  { name: "findings", file: "findings.json", schema: "findings@v1" },
  { name: "release-readiness", file: "release-readiness.json", schema: "release-readiness@v1" },
  { name: "audit", file: "audit.json", schema: "audit@v1" },
  { name: "risk-register", file: "risk-register.yaml", schema: "risk-register@v1" },
  { name: "test-seeds", file: "test-seeds.json", schema: "test-seeds@v1" },
  { name: "invariants", file: "invariants.json", schema: "invariants@v1" },
  { name: "diff-analysis", file: "diff-analysis.json", schema: "diff-analysis@v1" },
  { name: "test-plan", file: "test-plan.json", schema: "test-plan@v1" },
  { name: "pr-review", file: "pr-review.json", schema: "pr-review@v1", downstream: true },
  { name: "pr-review-comment", file: "pr-review.md", schema: "markdown", downstream: true },
  { name: "hosted-static-report", file: "hosted-static-report.json", schema: "hosted-static-report@v1", downstream: true },
  { name: "release-pack", file: "release-pack.json", schema: "release-pack@v1", downstream: true },
  { name: "qeg-code-to-gate", file: "qeg-code-to-gate.json", schema: "ctg.qeg-input/v1", downstream: true },
  { name: "manual-bb", file: "manual-bb.json", schema: "ctg.manual-bb/v1", downstream: true },
  { name: "manual-bb-seed", file: "manual-bb-seed.json", schema: "ctg.manual-bb/v1alpha1", downstream: true },
  { name: "gatefield", file: "gatefield.json", schema: "ctg.gatefield/v1", downstream: true },
  { name: "gatefield-static-result", file: "gatefield-static-result.json", schema: "ctg.gatefield/v1alpha1", downstream: true },
  { name: "state-gate", file: "state-gate.json", schema: "ctg.state-gate/v1", downstream: true },
  { name: "state-gate-evidence", file: "state-gate-evidence.json", schema: "ctg.state-gate/v1alpha1", downstream: true },
  { name: "workflow-evidence", file: "workflow.json", schema: "ctg.workflow-evidence/v1", downstream: true },
  { name: "workflow-evidence-legacy", file: "workflow-evidence.json", schema: "ctg.workflow-evidence/v1alpha1", downstream: true },
  { name: "sarif", file: "results.sarif", schema: "sarif-2.1.0", downstream: true },
];

function readJsonObject(filePath: string): Record<string, unknown> | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function sha256File(filePath: string): string {
  return `sha256:${createHash("sha256").update(readFileSync(filePath)).digest("hex")}`;
}

function relativePath(cwd: string, filePath: string): string {
  return path.relative(cwd, filePath) || path.basename(filePath);
}

function addNode(nodes: Map<string, EvidenceDagNode>, node: EvidenceDagNode): void {
  if (!nodes.has(node.id)) {
    nodes.set(node.id, node);
  }
}

function edgeId(source: string, type: EvidenceDagEdgeType, target: string): string {
  return `${source}|${type}|${target}`;
}

function addEdge(
  edges: Map<string, EvidenceDagEdge>,
  source: string,
  target: string,
  type: EvidenceDagEdgeType,
  metadata?: EvidenceDagEdge["metadata"]
): void {
  const id = edgeId(source, type, target);
  if (!edges.has(id)) {
    edges.set(id, { id, source, target, type, metadata });
  }
}

function metadata(
  value: Record<string, string | number | boolean | null | undefined>
): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Record<string, string | number | boolean | null>;
}

function addTypedNode(
  nodes: Map<string, EvidenceDagNode>,
  id: string,
  type: EvidenceDagNodeType,
  label: string,
  meta?: EvidenceDagNode["metadata"]
): void {
  addNode(nodes, { id, type, label, metadata: meta });
}

function artifactNodeId(name: string): string {
  return `artifact:${name}`;
}

function findingNodeId(id: string): string {
  return `finding:${id}`;
}

function ruleNodeId(ruleId: string): string {
  return `rule:${ruleId}`;
}

function verdictNodeId(status: string): string {
  return `verdict:${status}`;
}

function addArtifactNode(
  nodes: Map<string, EvidenceDagNode>,
  cwd: string,
  artifactDir: string,
  candidate: ArtifactCandidate
): boolean {
  const filePath = path.join(artifactDir, candidate.file);
  if (!existsSync(filePath)) {
    return false;
  }

  addTypedNode(
    nodes,
    artifactNodeId(candidate.name),
    "artifact",
    candidate.file,
    metadata({
      path: relativePath(cwd, filePath),
      schema: candidate.schema,
      hash: sha256File(filePath),
      downstream: candidate.downstream ?? false,
    })
  );
  return true;
}

function statusFromReadiness(readiness: ReleaseReadinessArtifact | Record<string, unknown>): string | undefined {
  const status = readiness.status;
  return typeof status === "string" ? status : undefined;
}

function inferFindingIdFromRiskSeed(seedId: string): string | undefined {
  return seedId.startsWith("risk-") ? seedId.slice("risk-".length) : undefined;
}

function addManualBbNodes(
  nodes: Map<string, EvidenceDagNode>,
  edges: Map<string, EvidenceDagEdge>,
  artifactDir: string
): void {
  const v1 = readJsonObject(path.join(artifactDir, "manual-bb.json"));
  const legacy = readJsonObject(path.join(artifactDir, "manual-bb-seed.json"));
  const manualBb = v1 ?? legacy;
  if (!manualBb) {
    return;
  }

  const riskSeeds = Array.isArray(manualBb.risk_seeds) ? manualBb.risk_seeds : [];
  for (const seed of riskSeeds) {
    if (!seed || typeof seed !== "object") {
      continue;
    }
    const item = seed as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id : undefined;
    if (!id) {
      continue;
    }
    const nodeId = `manual-test:${id}`;
    addTypedNode(nodes, nodeId, "manual-test", id);
    const findingId = inferFindingIdFromRiskSeed(id);
    if (findingId) {
      addEdge(edges, findingNodeId(findingId), nodeId, "requires_manual_oracle");
    }
  }

  const legacyCases = Array.isArray(manualBb.test_cases) ? manualBb.test_cases : [];
  for (const testCase of legacyCases) {
    if (!testCase || typeof testCase !== "object") {
      continue;
    }
    const item = testCase as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id : undefined;
    if (!id) {
      continue;
    }
    addTypedNode(nodes, `manual-test:${id}`, "manual-test", id);
  }
}

function addCiRunNode(
  nodes: Map<string, EvidenceDagNode>,
  edges: Map<string, EvidenceDagEdge>,
  env: NodeJS.ProcessEnv | undefined
): void {
  if (!env?.GITHUB_RUN_ID) {
    return;
  }

  const repo = env.GITHUB_REPOSITORY;
  const server = env.GITHUB_SERVER_URL ?? "https://github.com";
  const url = repo ? `${server}/${repo}/actions/runs/${env.GITHUB_RUN_ID}` : undefined;
  const nodeId = `ci-run:${env.GITHUB_RUN_ID}`;
  addTypedNode(
    nodes,
    nodeId,
    "ci-run",
    env.GITHUB_RUN_ID,
    metadata({
      url,
      sha: env.GITHUB_SHA,
      ref: env.GITHUB_REF,
    })
  );

  for (const node of nodes.values()) {
    if (node.type === "artifact") {
      addEdge(edges, nodeId, node.id, "generated_by");
    }
  }
}

function addPrCommentBacklinks(
  nodes: Map<string, EvidenceDagNode>,
  edges: Map<string, EvidenceDagEdge>,
  cwd: string,
  artifactDir: string
): void {
  const commentPath = path.join(artifactDir, "pr-review.md");
  if (!existsSync(commentPath)) {
    return;
  }

  const knownArtifacts = Array.from(nodes.values()).filter((node) => node.type === "artifact");
  const lines = readFileSync(commentPath, "utf8").split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const cited = knownArtifacts.filter((artifact) => {
      const artifactPath = typeof artifact.metadata?.path === "string" ? path.basename(artifact.metadata.path) : "";
      return line.includes(artifact.label) || (artifactPath.length > 0 && line.includes(artifactPath));
    });
    if (cited.length === 0) {
      continue;
    }

    const lineNumber = index + 1;
    const nodeId = `pr-comment-line:${lineNumber}`;
    addTypedNode(
      nodes,
      nodeId,
      "pr-comment-line",
      line.trim().slice(0, 96) || `pr-review.md:${lineNumber}`,
      metadata({
        path: relativePath(cwd, commentPath),
        line: lineNumber,
      })
    );

    for (const artifact of cited) {
      addEdge(edges, nodeId, artifact.id, "cites_artifact", metadata({
        line: lineNumber,
        sourcePath: relativePath(cwd, commentPath),
        artifactPath: typeof artifact.metadata?.path === "string" ? artifact.metadata.path : artifact.label,
      }));
    }
  }
}

export function generateEvidenceDagFromArtifacts(options: GenerateEvidenceDagOptions): EvidenceDagArtifact {
  const findingsPath = path.join(options.artifactDir, "findings.json");
  const findings = JSON.parse(readFileSync(findingsPath, "utf8")) as FindingsArtifact;
  const nodes = new Map<string, EvidenceDagNode>();
  const edges = new Map<string, EvidenceDagEdge>();

  addTypedNode(
    nodes,
    "requirement:QEOS-001",
    "requirement",
    "QEOS-001 Evidence DAG",
    metadata({ source: "docs/quality-evidence-os-requirements.md" })
  );

  for (const candidate of ARTIFACT_CANDIDATES) {
    addArtifactNode(nodes, options.cwd, options.artifactDir, candidate);
  }

  for (const finding of findings.findings) {
    const ruleId = ruleNodeId(finding.ruleId);
    const findingId = findingNodeId(finding.id);
    addTypedNode(nodes, ruleId, "rule", finding.ruleId, metadata({ category: finding.category }));
    addTypedNode(
      nodes,
      findingId,
      "finding",
      finding.title,
      metadata({
        severity: finding.severity,
        confidence: finding.confidence,
        ruleId: finding.ruleId,
      })
    );
    addEdge(edges, "requirement:QEOS-001", ruleId, "satisfies");
    addEdge(edges, ruleId, findingId, "generated_by");
    addEdge(edges, findingId, artifactNodeId("findings"), "evidenced_by");
  }

  for (const candidate of ARTIFACT_CANDIDATES.filter((item) => item.downstream)) {
    if (nodes.has(artifactNodeId(candidate.name))) {
      addEdge(edges, artifactNodeId("findings"), artifactNodeId(candidate.name), "exports_to");
    }
  }

  const readiness = readJsonObject(path.join(options.artifactDir, "release-readiness.json"));
  if (readiness) {
    const status = statusFromReadiness(readiness);
    if (status) {
      const verdictId = verdictNodeId(status);
      addTypedNode(nodes, verdictId, "verdict", status);
      addEdge(edges, artifactNodeId("release-readiness"), verdictId, "gated_by");
    }
  }

  if (nodes.has(artifactNodeId("qeg-code-to-gate"))) {
    addEdge(edges, artifactNodeId("release-readiness"), artifactNodeId("qeg-code-to-gate"), "exports_to");
  }

  addManualBbNodes(nodes, edges, options.artifactDir);
  addCiRunNode(nodes, edges, options.ciEnv);
  addPrCommentBacklinks(nodes, edges, options.cwd, options.artifactDir);

  const nodeList = Array.from(nodes.values());
  const edgeList = Array.from(edges.values());

  return {
    version: "ctg/v1",
    generated_at: new Date().toISOString(),
    run_id: findings.run_id,
    repo: findings.repo,
    tool: {
      name: "code-to-gate",
      version: options.version,
      plugin_versions: [],
    },
    artifact: "evidence-dag",
    schema: "evidence-dag@v1",
    completeness: nodes.has(artifactNodeId("release-readiness")) ? "complete" : "partial",
    nodes: nodeList,
    edges: edgeList,
    summary: {
      nodeCount: nodeList.length,
      edgeCount: edgeList.length,
      findings: findings.findings.length,
      artifacts: nodeList.filter((node) => node.type === "artifact").length,
      verdicts: nodeList.filter((node) => node.type === "verdict").length,
    },
  };
}
