/**
 * Tests for INTENT_NOT_RECOVERABLE detection rule.
 *
 * Validates:
 * - Changed critical entrypoint without intent/requirement/invariant/test trace
 * - Insufficient input suppression
 * - Refutation cases for entrypoints with traceability
 */

import { describe, it, expect } from "vitest";
import type { AssuranceGraph } from "../assurance-graph.js";
import { intentNotRecoverableRule } from "../rules/intent-not-recoverable.js";
import type { HashService } from "../../../types/contracts.js";

// Mock hash service
const mockHashService: HashService = {
  sha256: (input: string) => `sha256-${input.length}`,
  fingerprint: (input: string) => `fp-${input.slice(0, 8)}`,
};

// Helper to create minimal graph
function createMinimalGraph(
  nodes: AssuranceGraph["nodes"],
  edges: AssuranceGraph["edges"],
  artifacts: { artifact: string; loaded: boolean; recordCount: number }[]
): AssuranceGraph {
  return {
    nodes,
    edges,
    coverage: {
      artifacts,
      loadedArtifacts: artifacts.filter(a => a.loaded).map(a => a.artifact),
      missingArtifacts: artifacts.filter(a => !a.loaded).map(a => a.artifact),
      partialInput: artifacts.some(a => !a.loaded),
      totalNodes: nodes.length,
      totalEdges: edges.length,
    },
  };
}

describe("INTENT_NOT_RECOVERABLE rule", () => {
  describe("insufficient input", () => {
    it("generates unsupported claim when invariants.json and diff-analysis.json missing", () => {
      const graph = createMinimalGraph([], [], [
        { artifact: "invariants.json", loaded: false, recordCount: 0 },
        { artifact: "test-seeds.json", loaded: false, recordCount: 0 },
        { artifact: "diff-analysis.json", loaded: false, recordCount: 0 },
      ]);

      const result = intentNotRecoverableRule.evaluate(graph, mockHashService);

      expect(result.ruleId).toBe("INTENT_NOT_RECOVERABLE");
      expect(result.unsupportedClaims).toHaveLength(1);
      expect(result.unsupportedClaims[0].reason).toBe("missing_evidence");
      expect(result.candidates).toHaveLength(0);
    });

    it("generates unsupported claim when traceability exists but diff is missing", () => {
      const graph = createMinimalGraph([], [], [
        { artifact: "invariants.json", loaded: true, recordCount: 1 },
        { artifact: "test-seeds.json", loaded: true, recordCount: 1 },
      ]);

      const result = intentNotRecoverableRule.evaluate(graph, mockHashService);

      expect(result.unsupportedClaims).toHaveLength(1);
      expect(result.candidates).toHaveLength(0);
    });

    it("generates unsupported claim when diff exists but traceability input is missing", () => {
      const graph = createMinimalGraph([], [], [
        { artifact: "diff-analysis.json", loaded: true, recordCount: 1 },
      ]);

      const result = intentNotRecoverableRule.evaluate(graph, mockHashService);

      expect(result.unsupportedClaims).toHaveLength(1);
      expect(result.candidates).toHaveLength(0);
    });
  });

  describe("positive case - intent not recoverable", () => {
    it("detects changed critical entrypoint without intent trace", () => {
      const nodes: AssuranceGraph["nodes"] = [
        {
          id: "entrypoint-001",
          kind: "entrypoint",
          data: {
            name: "processPayment",
            riskLevel: "critical",
            kind: "business",
          },
          sourceArtifact: "repo-graph.json",
        },
      ];

      // changed-by edge indicates this entrypoint was changed
      const edges: AssuranceGraph["edges"] = [
        {
          id: "edge-changed-001",
          kind: "changed-by",
          sourceId: "diff-001",
          targetId: "entrypoint-001",
          sourceArtifact: "diff-analysis.json",
        },
      ];

      const graph = createMinimalGraph(nodes, edges, [
        { artifact: "invariants.json", loaded: true, recordCount: 1 },
        { artifact: "test-seeds.json", loaded: true, recordCount: 1 },
        { artifact: "diff-analysis.json", loaded: true, recordCount: 1 },
      ]);

      const result = intentNotRecoverableRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].ruleId).toBe("INTENT_NOT_RECOVERABLE");
      expect(result.candidates[0].severity).toBe("medium");
      expect(result.candidates[0].tags).toContain("assurance-smell");
      expect(result.candidates[0].tags).toContain("intent-not-recoverable");
      expect(result.candidates[0].tags).toContain("review-required");
    });

    it("detects security-path entrypoint without intent trace", () => {
      const nodes: AssuranceGraph["nodes"] = [
        {
          id: "entrypoint-auth",
          kind: "entrypoint",
          data: {
            name: "authenticateUser",
            tags: ["security-path"],
          },
          sourceArtifact: "repo-graph.json",
        },
      ];

      // changed-by edge
      const edges: AssuranceGraph["edges"] = [
        {
          id: "edge-changed-auth",
          kind: "changed-by",
          sourceId: "diff-auth",
          targetId: "entrypoint-auth",
          sourceArtifact: "diff-analysis.json",
        },
      ];

      const graph = createMinimalGraph(nodes, edges, [
        { artifact: "invariants.json", loaded: true, recordCount: 1 },
        { artifact: "diff-analysis.json", loaded: true, recordCount: 1 },
      ]);

      const result = intentNotRecoverableRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].summary).toContain("authenticateUser");
    });
  });

  describe("refutation case - intent recoverable", () => {
    it("does not generate candidate for entrypoint with declared intent", () => {
      const nodes: AssuranceGraph["nodes"] = [
        {
          id: "entrypoint-001",
          kind: "entrypoint",
          data: {
            name: "processPayment",
            riskLevel: "critical",
            intent: "Process payment with server-side validation",
          },
          sourceArtifact: "repo-graph.json",
        },
      ];

      const edges: AssuranceGraph["edges"] = [
        {
          id: "edge-changed-001",
          kind: "changed-by",
          sourceId: "diff-001",
          targetId: "entrypoint-001",
          sourceArtifact: "diff-analysis.json",
        },
      ];

      const graph = createMinimalGraph(nodes, edges, [
        { artifact: "invariants.json", loaded: true, recordCount: 1 },
        { artifact: "diff-analysis.json", loaded: true, recordCount: 1 },
      ]);

      const result = intentNotRecoverableRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(0);
    });

    it("does not generate candidate for entrypoint with maps-to requirement", () => {
      const nodes: AssuranceGraph["nodes"] = [
        {
          id: "entrypoint-001",
          kind: "entrypoint",
          data: {
            name: "processPayment",
            riskLevel: "high",
          },
          sourceArtifact: "repo-graph.json",
        },
        {
          id: "requirement-payment",
          kind: "requirement",
          data: {
            title: "Payment validation requirement",
          },
          sourceArtifact: "intake.json",
        },
      ];

      const edges: AssuranceGraph["edges"] = [
        {
          id: "edge-changed-001",
          kind: "changed-by",
          sourceId: "diff-001",
          targetId: "entrypoint-001",
          sourceArtifact: "diff-analysis.json",
        },
        {
          id: "edge-maps-to-001",
          kind: "maps-to",
          sourceId: "entrypoint-001",
          targetId: "requirement-payment",
          sourceArtifact: "repo-graph.json",
        },
      ];

      const graph = createMinimalGraph(nodes, edges, [
        { artifact: "invariants.json", loaded: true, recordCount: 1 },
        { artifact: "intake.json", loaded: true, recordCount: 1 },
        { artifact: "diff-analysis.json", loaded: true, recordCount: 1 },
      ]);

      const result = intentNotRecoverableRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(0);
    });

    it("does not generate candidate for entrypoint covered by invariant", () => {
      const nodes: AssuranceGraph["nodes"] = [
        {
          id: "entrypoint-001",
          kind: "entrypoint",
          data: {
            name: "processPayment",
            riskLevel: "critical",
          },
          sourceArtifact: "repo-graph.json",
        },
        {
          id: "invariant-001",
          kind: "invariant",
          data: {
            statement: "Payment must be validated server-side",
          },
          sourceArtifact: "invariants.json",
        },
      ];

      const edges: AssuranceGraph["edges"] = [
        {
          id: "edge-changed-001",
          kind: "changed-by",
          sourceId: "diff-001",
          targetId: "entrypoint-001",
          sourceArtifact: "diff-analysis.json",
        },
        {
          id: "edge-affects-001",
          kind: "affects",
          sourceId: "invariant-001",
          targetId: "entrypoint-001",
          sourceArtifact: "invariants.json",
        },
      ];

      const graph = createMinimalGraph(nodes, edges, [
        { artifact: "invariants.json", loaded: true, recordCount: 1 },
        { artifact: "diff-analysis.json", loaded: true, recordCount: 1 },
      ]);

      const result = intentNotRecoverableRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(0);
    });

    it("does not generate candidate for entrypoint tested by test-seed", () => {
      const nodes: AssuranceGraph["nodes"] = [
        {
          id: "entrypoint-001",
          kind: "entrypoint",
          data: {
            name: "processPayment",
            riskLevel: "high",
          },
          sourceArtifact: "repo-graph.json",
        },
        {
          id: "test-seed-001",
          kind: "test-seed",
          data: {
            testName: "test_payment_validation",
          },
          sourceArtifact: "test-seeds.json",
        },
      ];

      const edges: AssuranceGraph["edges"] = [
        {
          id: "edge-changed-001",
          kind: "changed-by",
          sourceId: "diff-001",
          targetId: "entrypoint-001",
          sourceArtifact: "diff-analysis.json",
        },
        {
          id: "edge-tested-by-001",
          kind: "tested-by",
          sourceId: "test-seed-001",
          targetId: "entrypoint-001",
          sourceArtifact: "test-seeds.json",
        },
      ];

      const graph = createMinimalGraph(nodes, edges, [
        { artifact: "test-seeds.json", loaded: true, recordCount: 1 },
        { artifact: "diff-analysis.json", loaded: true, recordCount: 1 },
      ]);

      const result = intentNotRecoverableRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(0);
    });
  });

  describe("non-critical entrypoint", () => {
    it("does not generate candidate for non-critical entrypoint", () => {
      const nodes: AssuranceGraph["nodes"] = [
        {
          id: "entrypoint-low",
          kind: "entrypoint",
          data: {
            name: "logInfo",
            riskLevel: "low", // Not critical
          },
          sourceArtifact: "repo-graph.json",
        },
      ];

      const edges: AssuranceGraph["edges"] = [
        {
          id: "edge-changed-low",
          kind: "changed-by",
          sourceId: "diff-low",
          targetId: "entrypoint-low",
          sourceArtifact: "diff-analysis.json",
        },
      ];

      const graph = createMinimalGraph(nodes, edges, [
        { artifact: "invariants.json", loaded: true, recordCount: 1 },
        { artifact: "diff-analysis.json", loaded: true, recordCount: 1 },
      ]);

      const result = intentNotRecoverableRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(0);
    });
  });

  describe("unchanged entrypoint", () => {
    it("does not generate candidate for unchanged critical entrypoint when diff available", () => {
      const nodes: AssuranceGraph["nodes"] = [
        {
          id: "entrypoint-001",
          kind: "entrypoint",
          data: {
            name: "processPayment",
            riskLevel: "critical",
          },
          sourceArtifact: "repo-graph.json",
        },
      ];

      // No changed-by edge - entrypoint was not changed
      const edges: AssuranceGraph["edges"] = [];

      const graph = createMinimalGraph(nodes, edges, [
        { artifact: "invariants.json", loaded: true, recordCount: 1 },
        { artifact: "diff-analysis.json", loaded: true, recordCount: 1 },
      ]);

      const result = intentNotRecoverableRule.evaluate(graph, mockHashService);

      // No candidate because entrypoint was not changed
      expect(result.candidates).toHaveLength(0);
    });
  });

  describe("candidate format", () => {
    it("candidate has required tags", () => {
      const nodes: AssuranceGraph["nodes"] = [
        {
          id: "entrypoint-001",
          kind: "entrypoint",
          data: {
            name: "criticalFunction",
            riskLevel: "critical",
          },
          sourceArtifact: "repo-graph.json",
        },
      ];

      const edges: AssuranceGraph["edges"] = [
        {
          id: "edge-changed-001",
          kind: "changed-by",
          sourceId: "diff-001",
          targetId: "entrypoint-001",
          sourceArtifact: "diff-analysis.json",
        },
      ];

      const graph = createMinimalGraph(nodes, edges, [
        { artifact: "invariants.json", loaded: true, recordCount: 1 },
        { artifact: "diff-analysis.json", loaded: true, recordCount: 1 },
      ]);

      const result = intentNotRecoverableRule.evaluate(graph, mockHashService);

      expect(result.candidates[0].tags).toContain("assurance-smell");
      expect(result.candidates[0].tags).toContain("intent-not-recoverable");
      expect(result.candidates[0].tags).toContain("review-required");
    });

    it("candidate has review-required title", () => {
      const nodes: AssuranceGraph["nodes"] = [
        {
          id: "entrypoint-payment",
          kind: "entrypoint",
          data: {
            name: "validatePayment",
            riskLevel: "high",
          },
          sourceArtifact: "repo-graph.json",
        },
      ];

      const edges: AssuranceGraph["edges"] = [
        {
          id: "edge-changed-payment",
          kind: "changed-by",
          sourceId: "diff-payment",
          targetId: "entrypoint-payment",
          sourceArtifact: "diff-analysis.json",
        },
      ];

      const graph = createMinimalGraph(nodes, edges, [
        { artifact: "invariants.json", loaded: true, recordCount: 1 },
        { artifact: "diff-analysis.json", loaded: true, recordCount: 1 },
      ]);

      const result = intentNotRecoverableRule.evaluate(graph, mockHashService);

      expect(result.candidates[0].title).toMatch(/^Review required:/);
      expect(result.candidates[0].summary).toMatch(/^Review required:/);
    });

    it("candidate has at least one evidence", () => {
      const nodes: AssuranceGraph["nodes"] = [
        {
          id: "entrypoint-001",
          kind: "entrypoint",
          data: {
            name: "criticalEntryPoint",
            riskLevel: "critical",
          },
          sourceArtifact: "repo-graph.json",
        },
      ];

      const edges: AssuranceGraph["edges"] = [
        {
          id: "edge-changed-001",
          kind: "changed-by",
          sourceId: "diff-001",
          targetId: "entrypoint-001",
          sourceArtifact: "diff-analysis.json",
        },
      ];

      const graph = createMinimalGraph(nodes, edges, [
        { artifact: "invariants.json", loaded: true, recordCount: 1 },
        { artifact: "diff-analysis.json", loaded: true, recordCount: 1 },
      ]);

      const result = intentNotRecoverableRule.evaluate(graph, mockHashService);

      expect(result.candidates[0].evidence.length).toBeGreaterThanOrEqual(1);
    });

    it("candidate includes entrypoint name in summary", () => {
      const nodes: AssuranceGraph["nodes"] = [
        {
          id: "entrypoint-auth",
          kind: "entrypoint",
          data: {
            name: "handleAuthentication",
            kind: "security",
          },
          sourceArtifact: "repo-graph.json",
        },
      ];

      const edges: AssuranceGraph["edges"] = [
        {
          id: "edge-changed-auth",
          kind: "changed-by",
          sourceId: "diff-auth",
          targetId: "entrypoint-auth",
          sourceArtifact: "diff-analysis.json",
        },
      ];

      const graph = createMinimalGraph(nodes, edges, [
        { artifact: "invariants.json", loaded: true, recordCount: 1 },
        { artifact: "diff-analysis.json", loaded: true, recordCount: 1 },
      ]);

      const result = intentNotRecoverableRule.evaluate(graph, mockHashService);

      expect(result.candidates[0].summary).toContain("handleAuthentication");
    });
  });

  describe("multiple entrypoints", () => {
    it("generates candidates for all critical changed entrypoints without trace", () => {
      const nodes: AssuranceGraph["nodes"] = [
        {
          id: "entrypoint-001",
          kind: "entrypoint",
          data: {
            name: "processPayment",
            riskLevel: "critical",
          },
          sourceArtifact: "repo-graph.json",
        },
        {
          id: "entrypoint-002",
          kind: "entrypoint",
          data: {
            name: "validateAuth",
            kind: "security",
          },
          sourceArtifact: "repo-graph.json",
        },
        {
          id: "entrypoint-003",
          kind: "entrypoint",
          data: {
            name: "linkedEntrypoint",
            riskLevel: "critical",
            intent: "Has intent declared",
          },
          sourceArtifact: "repo-graph.json",
        },
      ];

      const edges: AssuranceGraph["edges"] = [
        {
          id: "edge-changed-001",
          kind: "changed-by",
          sourceId: "diff-001",
          targetId: "entrypoint-001",
          sourceArtifact: "diff-analysis.json",
        },
        {
          id: "edge-changed-002",
          kind: "changed-by",
          sourceId: "diff-002",
          targetId: "entrypoint-002",
          sourceArtifact: "diff-analysis.json",
        },
        {
          id: "edge-changed-003",
          kind: "changed-by",
          sourceId: "diff-003",
          targetId: "entrypoint-003",
          sourceArtifact: "diff-analysis.json",
        },
      ];

      const graph = createMinimalGraph(nodes, edges, [
        { artifact: "invariants.json", loaded: true, recordCount: 1 },
        { artifact: "diff-analysis.json", loaded: true, recordCount: 1 },
      ]);

      const result = intentNotRecoverableRule.evaluate(graph, mockHashService);

      // 2 candidates (entrypoint-001 and entrypoint-002, entrypoint-003 has intent)
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates.map(c => c.summary).some(s => s.includes("processPayment"))).toBe(true);
      expect(result.candidates.map(c => c.summary).some(s => s.includes("validateAuth"))).toBe(true);
    });
  });
});
