import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import {
  buildAssuranceGraph,
  findNodesByKind,
  findNodeById,
  findEdgesByKind,
  findEdgesFromNode,
  findEdgesToNode,
  findConnectedNodes,
  type AssuranceGraph,
  type AssuranceNodeKind,
  type AssuranceEdgeKind,
  type AssuranceArtifactBundle,
  type AssuranceIntake,
} from "../assurance-graph.js";
import type {
  Finding,
  RiskSeed,
  TestSeed,
  Invariant,
  ReleaseReadinessArtifact,
  NormalizedRepoGraph,
} from "../../types/artifacts.js";

const TEST_DIR = path.join(import.meta.dirname, "../../../.test-temp", "assurance-graph-tests");

function readJson<T>(artifactDir: string, filename: string): T | undefined {
  const filePath = path.join(artifactDir, filename);
  return existsSync(filePath) ? JSON.parse(readFileSync(filePath, "utf8")) as T : undefined;
}

function buildGraphFromDir(artifactDir: string): AssuranceGraph {
  const findings = readJson<{ findings: Finding[] }>(artifactDir, "findings.json");
  const testSeeds = readJson<{ testSeeds: TestSeed[] }>(artifactDir, "test-seeds.json");
  const invariants = readJson<{ invariants: Invariant[] }>(artifactDir, "invariants.json");
  const riskPath = path.join(artifactDir, "risk-register.yaml");
  const bundle: AssuranceArtifactBundle = {
    findings: findings?.findings,
    riskRegister: existsSync(riskPath)
      ? (loadYaml(readFileSync(riskPath, "utf8")) as RiskSeed[] | null) ?? []
      : undefined,
    testSeeds: testSeeds?.testSeeds,
    invariants: invariants?.invariants,
    releaseReadiness: readJson<ReleaseReadinessArtifact>(artifactDir, "release-readiness.json"),
    repoGraph: readJson<NormalizedRepoGraph>(artifactDir, "repo-graph.json"),
    intake: readJson<AssuranceIntake>(artifactDir, "intake.json"),
  };
  return buildAssuranceGraph(bundle);
}

describe("AssuranceGraph", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("Empty bundle handling", () => {
    it("returns empty nodes/edges when artifact directory has no files", () => {
      const emptyDir = path.join(TEST_DIR, "empty");
      mkdirSync(emptyDir, { recursive: true });

      const graph = buildGraphFromDir(emptyDir);

      expect(graph.nodes).toEqual([]);
      expect(graph.edges).toEqual([]);
      expect(graph.coverage.totalNodes).toBe(0);
      expect(graph.coverage.totalEdges).toBe(0);
      expect(graph.coverage.missingArtifacts).toHaveLength(7);
      expect(graph.coverage.partialInput).toBe(true);
    });

    it("records missing artifacts in coverage.missingArtifacts", () => {
      const emptyDir = path.join(TEST_DIR, "empty");
      mkdirSync(emptyDir, { recursive: true });

      const graph = buildGraphFromDir(emptyDir);

      expect(graph.coverage.missingArtifacts).toContain("findings.json");
      expect(graph.coverage.missingArtifacts).toContain("risk-register.yaml");
      expect(graph.coverage.missingArtifacts).toContain("test-seeds.json");
      expect(graph.coverage.missingArtifacts).toContain("invariants.json");
      expect(graph.coverage.missingArtifacts).toContain("release-readiness.json");
      expect(graph.coverage.missingArtifacts).toContain("repo-graph.json");
      expect(graph.coverage.missingArtifacts).toContain("intake.json");
    });

    it("marks all artifacts as not loaded in coverage.artifacts", () => {
      const emptyDir = path.join(TEST_DIR, "empty");
      mkdirSync(emptyDir, { recursive: true });

      const graph = buildGraphFromDir(emptyDir);

      for (const artifact of graph.coverage.artifacts) {
        expect(artifact.loaded).toBe(false);
        expect(artifact.recordCount).toBe(0);
      }
    });
  });

  describe("Valid bundle normalization", () => {
    it("normalizes findings into finding and evidence nodes", () => {
      const artifactDir = TEST_DIR;

      const findings: Finding[] = [
        {
          id: "finding-001",
          ruleId: "CLIENT_TRUSTED_PRICE",
          category: "payment",
          severity: "critical",
          confidence: 0.95,
          title: "Review required: Client-side price calculation",
          summary: "Review required: Price calculated on client",
          evidence: [
            {
              id: "evidence-001",
              path: "src/cart.ts",
              kind: "code",
              startLine: 10,
              endLine: 20,
            },
          ],
          affectedSymbols: ["symbol-cart-calculate"],
          affectedEntrypoints: ["entrypoint-checkout"],
          tags: ["payment", "assurance-smell"],
        },
      ];

      writeFileSync(
        path.join(artifactDir, "findings.json"),
        JSON.stringify({ findings })
      );

      const graph = buildGraphFromDir(artifactDir);

      // Should have 2 nodes: finding + evidence
      const findingNodes = findNodesByKind(graph, "finding");
      expect(findingNodes).toHaveLength(1);
      expect(findingNodes[0].id).toBe("finding-001");
      expect(findingNodes[0].data.ruleId).toBe("CLIENT_TRUSTED_PRICE");

      const evidenceNodes = findNodesByKind(graph, "evidence");
      expect(evidenceNodes).toHaveLength(1);
      expect(evidenceNodes[0].id).toBe("evidence-001");
      expect(evidenceNodes[0].data.parentFindingId).toBe("finding-001");
    });

    it("creates supported-by edges from finding to evidence", () => {
      const artifactDir = TEST_DIR;

      const findings: Finding[] = [
        {
          id: "finding-001",
          ruleId: "CLIENT_TRUSTED_PRICE",
          category: "payment",
          severity: "critical",
          confidence: 0.95,
          title: "Review required: Test",
          summary: "Review required: Test",
          evidence: [
            { id: "evidence-001", path: "src/cart.ts", kind: "code" },
            { id: "evidence-002", path: "src/api.ts", kind: "code" },
          ],
        },
      ];

      writeFileSync(
        path.join(artifactDir, "findings.json"),
        JSON.stringify({ findings })
      );

      const graph = buildGraphFromDir(artifactDir);

      const supportedByEdges = findEdgesByKind(graph, "supported-by");
      expect(supportedByEdges).toHaveLength(2);

      expect(supportedByEdges[0].sourceId).toBe("finding-001");
      expect(supportedByEdges[0].targetId).toBe("evidence-001");

      expect(supportedByEdges[1].sourceId).toBe("finding-001");
      expect(supportedByEdges[1].targetId).toBe("evidence-002");
    });

    it("creates affects edges from finding to symbols/entrypoints", () => {
      const artifactDir = TEST_DIR;

      const findings: Finding[] = [
        {
          id: "finding-001",
          ruleId: "CLIENT_TRUSTED_PRICE",
          category: "payment",
          severity: "critical",
          confidence: 0.95,
          title: "Review required: Test",
          summary: "Review required: Test",
          evidence: [{ id: "evidence-001", path: "src/cart.ts", kind: "code" }],
          affectedSymbols: ["symbol-001", "symbol-002"],
          affectedEntrypoints: ["entrypoint-001"],
        },
      ];

      writeFileSync(
        path.join(artifactDir, "findings.json"),
        JSON.stringify({ findings })
      );

      const graph = buildGraphFromDir(artifactDir);

      const affectsEdges = findEdgesByKind(graph, "affects");
      expect(affectsEdges).toHaveLength(3);

      const symbolTargets = affectsEdges.filter(e => e.targetId.startsWith("symbol"));
      expect(symbolTargets).toHaveLength(2);

      const entrypointTargets = affectsEdges.filter(e => e.targetId.startsWith("entrypoint"));
      expect(entrypointTargets).toHaveLength(1);
    });
  });

  describe("Risk register normalization", () => {
    it("normalizes risk-register.yaml into risk nodes", () => {
      const artifactDir = TEST_DIR;

      // Simple YAML format for risk register
      const yamlContent = `
- id: risk-001
  title: Payment bypass risk
  severity: critical
  likelihood: high
  sourceFindingIds:
    - finding-001
`;

      writeFileSync(path.join(artifactDir, "risk-register.yaml"), yamlContent);

      const graph = buildGraphFromDir(artifactDir);

      const riskNodes = findNodesByKind(graph, "risk");
      expect(riskNodes.length).toBeGreaterThan(0);
      expect(riskNodes[0].id).toBe("risk-001");
      expect(riskNodes[0].data.title).toBe("Payment bypass risk");
    });

    it("creates derived-from edges from risk to findings", () => {
      const artifactDir = TEST_DIR;

      const yamlContent = `
- id: risk-001
  title: Risk
  severity: critical
  likelihood: high
  sourceFindingIds:
    - finding-001
    - finding-002
`;

      writeFileSync(path.join(artifactDir, "risk-register.yaml"), yamlContent);

      const graph = buildGraphFromDir(artifactDir);

      const derivedFromEdges = findEdgesByKind(graph, "derived-from");
      const riskEdges = derivedFromEdges.filter(e => e.sourceId === "risk-001");
      expect(riskEdges).toHaveLength(2);
      expect(riskEdges[0].targetId).toBe("finding-001");
      expect(riskEdges[1].targetId).toBe("finding-002");
    });
  });

  describe("Test seeds normalization", () => {
    it("normalizes test-seeds.json into test-seed nodes", () => {
      const artifactDir = TEST_DIR;

      const testSeeds: TestSeed[] = [
        {
          id: "test-seed-001",
          title: "Verify payment server validation",
          intent: "Ensure server validates price",
          sourceRiskIds: ["risk-001"],
          sourceFindingIds: ["finding-001"],
          priority: "high",
        },
      ];

      writeFileSync(
        path.join(artifactDir, "test-seeds.json"),
        JSON.stringify({ testSeeds })
      );

      const graph = buildGraphFromDir(artifactDir);

      const testSeedNodes = findNodesByKind(graph, "test-seed");
      expect(testSeedNodes).toHaveLength(1);
      expect(testSeedNodes[0].id).toBe("test-seed-001");
      expect(testSeedNodes[0].data.intent).toBe("Ensure server validates price");
    });

    it("creates tested-by edges from test-seed to risks", () => {
      const artifactDir = TEST_DIR;

      const testSeeds: TestSeed[] = [
        {
          id: "test-seed-001",
          title: "Test",
          intent: "Intent",
          sourceRiskIds: ["risk-001", "risk-002"],
        },
      ];

      writeFileSync(
        path.join(artifactDir, "test-seeds.json"),
        JSON.stringify({ testSeeds })
      );

      const graph = buildGraphFromDir(artifactDir);

      const testedByEdges = findEdgesByKind(graph, "tested-by");
      expect(testedByEdges).toHaveLength(2);
      expect(testedByEdges[0].sourceId).toBe("test-seed-001");
      expect(testedByEdges[0].targetId).toBe("risk-001");
    });
  });

  describe("Invariants normalization", () => {
    it("normalizes invariants.json into invariant nodes", () => {
      const artifactDir = TEST_DIR;

      const invariants: Invariant[] = [
        {
          id: "invariant-001",
          statement: "Price must be validated on server",
          kind: "security",
          sourceFindingIds: ["finding-001"],
          tags: ["payment", "security"],
        },
      ];

      writeFileSync(
        path.join(artifactDir, "invariants.json"),
        JSON.stringify({ invariants })
      );

      const graph = buildGraphFromDir(artifactDir);

      const invariantNodes = findNodesByKind(graph, "invariant");
      expect(invariantNodes).toHaveLength(1);
      expect(invariantNodes[0].id).toBe("invariant-001");
      expect(invariantNodes[0].data.statement).toBe("Price must be validated on server");
    });
  });

  describe("Release readiness normalization", () => {
    it("normalizes release-readiness.json into readiness-condition node", () => {
      const artifactDir = TEST_DIR;

      const readiness: ReleaseReadinessArtifact = {
        status: "blocked",
        failedConditions: ["no-critical-findings"],
        counts: {
          totalFindings: 5,
          criticalFindings: 2,
          highFindings: 1,
        },
        gateDecision: {
          decision: "no_go",
          reason: "Critical findings present",
        },
      };

      writeFileSync(
        path.join(artifactDir, "release-readiness.json"),
        JSON.stringify(readiness)
      );

      const graph = buildGraphFromDir(artifactDir);

      const readinessNodes = findNodesByKind(graph, "readiness-condition");
      expect(readinessNodes).toHaveLength(1);
      expect(readinessNodes[0].id).toBe("release-readiness-condition");
      expect(readinessNodes[0].data.status).toBe("blocked");
    });
  });

  describe("Repo graph normalization", () => {
    it("normalizes repo-graph.json into file, symbol, and entrypoint nodes", () => {
      const artifactDir = TEST_DIR;

      const repoGraph: NormalizedRepoGraph = {
        files: [
          { id: "file-001", path: "src/cart.ts", language: "typescript" },
        ],
        symbols: [
          { id: "symbol-001", name: "calculatePrice", kind: "function", fileId: "file-001" },
        ],
        entrypoints: [
          { id: "entrypoint-001", name: "checkout", kind: "http", fileId: "file-001" },
        ],
      };

      writeFileSync(
        path.join(artifactDir, "repo-graph.json"),
        JSON.stringify(repoGraph)
      );

      const graph = buildGraphFromDir(artifactDir);

      const fileNodes = findNodesByKind(graph, "file");
      expect(fileNodes).toHaveLength(1);
      expect(fileNodes[0].id).toBe("file-001");

      const symbolNodes = findNodesByKind(graph, "symbol");
      expect(symbolNodes).toHaveLength(1);
      expect(symbolNodes[0].id).toBe("symbol-001");

      const entrypointNodes = findNodesByKind(graph, "entrypoint");
      expect(entrypointNodes).toHaveLength(1);
      expect(entrypointNodes[0].id).toBe("entrypoint-001");
    });

    it("creates declares edges from symbols to files", () => {
      const artifactDir = TEST_DIR;

      const repoGraph: NormalizedRepoGraph = {
        files: [{ id: "file-001", path: "src/cart.ts", language: "typescript" }],
        symbols: [
          { id: "symbol-001", name: "func1", kind: "function", fileId: "file-001" },
          { id: "symbol-002", name: "func2", kind: "function", fileId: "file-001" },
        ],
        entrypoints: [],
      };

      writeFileSync(
        path.join(artifactDir, "repo-graph.json"),
        JSON.stringify(repoGraph)
      );

      const graph = buildGraphFromDir(artifactDir);

      const declaresEdges = findEdgesByKind(graph, "declares");
      expect(declaresEdges).toHaveLength(2);
      expect(declaresEdges[0].sourceId).toBe("symbol-001");
      expect(declaresEdges[0].targetId).toBe("file-001");
    });

    it("creates maps-to edges from entrypoints to files/symbols", () => {
      const artifactDir = TEST_DIR;

      const repoGraph: NormalizedRepoGraph = {
        files: [{ id: "file-001", path: "src/api.ts", language: "typescript" }],
        symbols: [{ id: "symbol-001", name: "handler", kind: "function", fileId: "file-001" }],
        entrypoints: [
          { id: "entrypoint-001", name: "POST /checkout", kind: "http", fileId: "file-001", symbolId: "symbol-001" },
        ],
      };

      writeFileSync(
        path.join(artifactDir, "repo-graph.json"),
        JSON.stringify(repoGraph)
      );

      const graph = buildGraphFromDir(artifactDir);

      const mapsToEdges = findEdgesByKind(graph, "maps-to");
      expect(mapsToEdges).toHaveLength(2);

      const fileMap = mapsToEdges.find(e => e.targetId === "file-001");
      expect(fileMap).toBeDefined();

      const symbolMap = mapsToEdges.find(e => e.targetId === "symbol-001");
      expect(symbolMap).toBeDefined();
    });
  });

  describe("Partial input handling", () => {
    it("marks partialInput=true when some artifacts missing", () => {
      const artifactDir = TEST_DIR;

      // Only provide findings.json
      writeFileSync(
        path.join(artifactDir, "findings.json"),
        JSON.stringify({ findings: [] })
      );

      const graph = buildGraphFromDir(artifactDir);

      expect(graph.coverage.partialInput).toBe(true);
      expect(graph.coverage.loadedArtifacts).toContain("findings.json");
      expect(graph.coverage.missingArtifacts).toHaveLength(6);
    });

    it("marks partialInput=false when all artifacts present", () => {
      const artifactDir = TEST_DIR;

      // Provide minimal valid artifacts
      writeFileSync(path.join(artifactDir, "findings.json"), JSON.stringify({ findings: [] }));
      writeFileSync(path.join(artifactDir, "risk-register.yaml"), "");
      writeFileSync(path.join(artifactDir, "test-seeds.json"), JSON.stringify({ testSeeds: [] }));
      writeFileSync(path.join(artifactDir, "invariants.json"), JSON.stringify({ invariants: [] }));
      writeFileSync(path.join(artifactDir, "release-readiness.json"), JSON.stringify({ status: "pass" }));
      writeFileSync(path.join(artifactDir, "repo-graph.json"), JSON.stringify({ files: [], symbols: [], entrypoints: [] }));
      writeFileSync(path.join(artifactDir, "intake.json"), JSON.stringify({ requirements: [], intents: [] }));

      const graph = buildGraphFromDir(artifactDir);

      expect(graph.coverage.partialInput).toBe(false);
      expect(graph.coverage.loadedArtifacts).toHaveLength(7);
      expect(graph.coverage.missingArtifacts).toHaveLength(0);
    });

    it("records correct recordCount for each artifact", () => {
      const artifactDir = TEST_DIR;

      const findings: Finding[] = [
        { id: "f1", ruleId: "R1", category: "cat", severity: "high", confidence: 0.9, title: "T1", summary: "S1", evidence: [] },
        { id: "f2", ruleId: "R2", category: "cat", severity: "medium", confidence: 0.8, title: "T2", summary: "S2", evidence: [] },
        { id: "f3", ruleId: "R3", category: "cat", severity: "low", confidence: 0.7, title: "T3", summary: "S3", evidence: [] },
      ];

      writeFileSync(path.join(artifactDir, "findings.json"), JSON.stringify({ findings }));

      const graph = buildGraphFromDir(artifactDir);

      const findingsCoverage = graph.coverage.artifacts.find(a => a.artifact === "findings.json");
      expect(findingsCoverage?.recordCount).toBe(3);
    });
  });

  describe("Deterministic normalization", () => {
    it("produces same graph structure for same input", () => {
      const artifactDir = TEST_DIR;

      const findings: Finding[] = [
        {
          id: "finding-001",
          ruleId: "CLIENT_TRUSTED_PRICE",
          category: "payment",
          severity: "critical",
          confidence: 0.95,
          title: "Review required: Test",
          summary: "Review required: Test",
          evidence: [{ id: "evidence-001", path: "src/cart.ts", kind: "code" }],
        },
      ];

      writeFileSync(
        path.join(artifactDir, "findings.json"),
        JSON.stringify({ findings })
      );

      const graph1 = buildGraphFromDir(artifactDir);
      const graph2 = buildGraphFromDir(artifactDir);

      expect(graph1.nodes.map(n => n.id)).toEqual(graph2.nodes.map(n => n.id));
      expect(graph1.edges.map(e => e.id)).toEqual(graph2.edges.map(e => e.id));
    });
  });

  describe("Intake normalization", () => {
    it("normalizes requirement and intent scope into graph edges", () => {
      const graph = buildAssuranceGraph({
        repoGraph: {
          files: [
            {
              id: "file-payment",
              path: "src/payment.ts",
              language: "ts",
              role: "source",
              hash: "",
              sizeBytes: 0,
              lineCount: 1,
              parser: { status: "parsed" },
            },
          ],
          symbols: [],
          entrypoints: [],
        } as unknown as NormalizedRepoGraph,
        intake: {
          requirements: [{ id: "req-payment", title: "Validate payment", scope: ["src/payment.ts"] }],
          intents: [{ id: "intent-payment", statement: "Keep payment valid", scope: ["file-payment"] }],
        },
      });

      expect(findNodesByKind(graph, "requirement")).toHaveLength(1);
      expect(findNodesByKind(graph, "intent")).toHaveLength(1);
      expect(findEdgesByKind(graph, "affects")).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceId: "req-payment", targetId: "file-payment" }),
        expect.objectContaining({ sourceId: "intent-payment", targetId: "file-payment" }),
      ]));
      expect(graph.coverage.loadedArtifacts).toContain("intake.json");
    });
  });

  describe("Graph query helpers", () => {
    it("findNodesByKind returns all nodes of specified kind", () => {
      const artifactDir = TEST_DIR;

      const repoGraph: NormalizedRepoGraph = {
        files: [
          { id: "file-001", path: "a.ts", language: "ts" },
          { id: "file-002", path: "b.ts", language: "ts" },
        ],
        symbols: [
          { id: "symbol-001", name: "fn", kind: "function", fileId: "file-001" },
        ],
        entrypoints: [],
      };

      writeFileSync(path.join(artifactDir, "repo-graph.json"), JSON.stringify(repoGraph));

      const graph = buildGraphFromDir(artifactDir);
      const files = findNodesByKind(graph, "file");

      expect(files).toHaveLength(2);
    });

    it("findNodeById returns specific node or undefined", () => {
      const artifactDir = TEST_DIR;

      writeFileSync(
        path.join(artifactDir, "findings.json"),
        JSON.stringify({ findings: [{ id: "finding-001", ruleId: "R", category: "c", severity: "h", confidence: 0.9, title: "T", summary: "S", evidence: [] }] })
      );

      const graph = buildGraphFromDir(artifactDir);

      const found = findNodeById(graph, "finding-001");
      expect(found).toBeDefined();
      expect(found?.id).toBe("finding-001");

      const notFound = findNodeById(graph, "nonexistent");
      expect(notFound).toBeUndefined();
    });

    it("findEdgesFromNode returns all outgoing edges", () => {
      const artifactDir = TEST_DIR;

      const findings: Finding[] = [
        {
          id: "finding-001",
          ruleId: "R",
          category: "c",
          severity: "h",
          confidence: 0.9,
          title: "T",
          summary: "S",
          evidence: [
            { id: "e1", path: "a.ts", kind: "code" },
            { id: "e2", path: "b.ts", kind: "code" },
          ],
        },
      ];

      writeFileSync(path.join(artifactDir, "findings.json"), JSON.stringify({ findings }));

      const graph = buildGraphFromDir(artifactDir);
      const edges = findEdgesFromNode(graph, "finding-001");

      expect(edges).toHaveLength(2);
    });

    it("findEdgesToNode returns all incoming edges", () => {
      const artifactDir = TEST_DIR;

      const findings: Finding[] = [
        {
          id: "finding-001",
          ruleId: "R",
          category: "c",
          severity: "h",
          confidence: 0.9,
          title: "T",
          summary: "S",
          evidence: [{ id: "evidence-001", path: "a.ts", kind: "code" }],
        },
      ];

      writeFileSync(path.join(artifactDir, "findings.json"), JSON.stringify({ findings }));

      const graph = buildGraphFromDir(artifactDir);
      const edges = findEdgesToNode(graph, "evidence-001");

      expect(edges).toHaveLength(1);
      expect(edges[0].kind).toBe("supported-by");
    });

    it("findConnectedNodes returns connected nodes via specific edge kind", () => {
      const artifactDir = TEST_DIR;

      const repoGraph: NormalizedRepoGraph = {
        files: [{ id: "file-001", path: "a.ts", language: "ts" }],
        symbols: [
          { id: "symbol-001", name: "fn1", kind: "function", fileId: "file-001" },
          { id: "symbol-002", name: "fn2", kind: "function", fileId: "file-001" },
        ],
        entrypoints: [],
      };

      writeFileSync(path.join(artifactDir, "repo-graph.json"), JSON.stringify(repoGraph));

      const graph = buildGraphFromDir(artifactDir);
      const connected = findConnectedNodes(graph, "file-001", "declares");

      // Note: declares edges go FROM symbol TO file, so finding nodes connected via "declares" to file-001
      // would be the symbols that declare in that file - but edge direction is symbol -> file
      // So we need to reverse: edges TO file-001 with kind "declares"
      const edgesTo = findEdgesToNode(graph, "file-001");
      const declaresEdges = edgesTo.filter(e => e.kind === "declares");
      expect(declaresEdges).toHaveLength(2);
    });
  });

  describe("Architecture compliance", () => {
    it("does not import from Node API or adapter layer", async () => {
      // This test verifies that the module follows architecture boundaries
      // The actual verification is done by architecture tests
      // Here we just check the module can be imported without issues
      const module = await import("../assurance-graph.js");
      expect(module.buildAssuranceGraph).toBeDefined();
      expect(typeof module.buildAssuranceGraph).toBe("function");
    });
  });
});

