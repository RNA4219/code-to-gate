/**
 * Tests for REQUIREMENT_LINK_MISSING detection rule.
 *
 * Validates:
 * - Requirement without linked findings/risks/invariants/test seeds
 * - Scope determination suppression
 * - Unsupported claims for insufficient input
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { Finding, Invariant, TestSeed, RiskSeed, NormalizedRepoGraph } from "../../../types/artifacts.js";
import type { AssuranceGraph, AssuranceRequirement } from "../assurance-graph.js";
import { buildAssuranceGraph } from "../assurance-graph.js";
import { requirementLinkMissingRule } from "../rules/requirement-link-missing.js";
import type { HashService } from "../../../types/contracts.js";

// Mock hash service
const mockHashService: HashService = {
  sha256: (input: string) => `sha256-${input.length}`,
  fingerprint: (input: string) => `fp-${input.slice(0, 8)}`,
};

// Helper to build graph with intake requirements
// Creates requirement nodes and affects edges for scope determination
function buildGraphWithRequirements(
  requirements: AssuranceRequirement[],
  findings: Finding[] = [],
  risks: RiskSeed[] = [],
  invariants: Invariant[] = [],
  testSeeds: TestSeed[] = []
): AssuranceGraph {
  const scopePaths = [...new Set(requirements.flatMap((requirement) => requirement.scope ?? []))];
  const repoGraph: NormalizedRepoGraph = {
    artifact: "normalized-repo-graph",
    schema: "normalized-repo-graph@v1",
    generatedAt: "2026-06-09T00:00:00Z",
    files: scopePaths.map((scopePath) => ({
      id: `file-${scopePath}`,
      path: scopePath,
      language: "ts",
      role: "source",
      hash: "",
      sizeBytes: 0,
      lineCount: 1,
      parser: { status: "parsed" },
    })),
    modules: [],
    symbols: [],
    relations: [],
    tests: [],
    configs: [],
    entrypoints: [],
    diagnostics: [],
    stats: { partial: false },
  };

  return buildAssuranceGraph({
    findings,
    riskRegister: risks,
    invariants,
    testSeeds,
    repoGraph,
    intake: { requirements },
  });
}

describe("REQUIREMENT_LINK_MISSING rule", () => {
  describe("sufficient input", () => {
    it("generates unsupported claim when intake.json missing", () => {
      const graph: AssuranceGraph = {
        nodes: [],
        edges: [],
        coverage: {
          artifacts: [
            { artifact: "intake.json", loaded: false, recordCount: 0 },
          ],
          loadedArtifacts: [],
          missingArtifacts: ["intake.json"],
          partialInput: true,
          totalNodes: 0,
          totalEdges: 0,
        },
      };

      const result = requirementLinkMissingRule.evaluate(graph, mockHashService);

      expect(result.ruleId).toBe("REQUIREMENT_LINK_MISSING");
      expect(result.unsupportedClaims).toHaveLength(1);
      expect(result.unsupportedClaims[0].reason).toBe("missing_evidence");
      expect(result.candidates).toHaveLength(0);
    });

    it("generates unsupported claim when intake has no requirement nodes", () => {
      const graph: AssuranceGraph = {
        nodes: [],
        edges: [],
        coverage: {
          artifacts: [
            { artifact: "intake.json", loaded: true, recordCount: 0 },
          ],
          loadedArtifacts: ["intake.json"],
          missingArtifacts: [],
          partialInput: false,
          totalNodes: 0,
          totalEdges: 0,
        },
      };

      const result = requirementLinkMissingRule.evaluate(graph, mockHashService);

      expect(result.unsupportedClaims).toHaveLength(1);
      expect(result.unsupportedClaims[0].reason).toBe("missing_evidence");
      expect(result.candidates).toHaveLength(0);
    });
  });

  describe("positive case - requirement link missing", () => {
    it("detects requirement without linked findings or test seeds", () => {
      const requirement: AssuranceRequirement = {
        id: "req-001",
        title: "Payment validation on server",
        status: "active",
        scope: ["src/payment/process.ts"],
      };

      const finding: Finding = {
        id: "finding-001",
        ruleId: "CLIENT_TRUSTED_PRICE",
        category: "payment",
        severity: "high",
        confidence: 0.9,
        title: "Client trusted price",
        summary: "Price calculated on client",
        evidence: [],
        affectedSymbols: [],
        affectedEntrypoints: [],
        tags: [], // No requirement:req-001 link
      };

      const graph = buildGraphWithRequirements([requirement], [finding]);

      const result = requirementLinkMissingRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].ruleId).toBe("REQUIREMENT_LINK_MISSING");
      expect(result.candidates[0].severity).toBe("low");
      expect(result.candidates[0].tags).toContain("assurance-smell");
      expect(result.candidates[0].tags).toContain("requirement-link-missing");
      expect(result.candidates[0].tags).toContain("review-required");
    });

    it("detects requirement with scope but no linked nodes", () => {
      const requirement: AssuranceRequirement = {
        id: "req-002",
        title: "Auth must use secure tokens",
        status: "active",
        scope: ["src/auth/login.ts", "src/auth/token.ts"],
      };

      const invariant: Invariant = {
        id: "invariant-001",
        statement: "Auth must use secure tokens",
        kind: "security",
        confidence: 0.9,
        sourceFindingIds: [],
        evidence: [],
        tags: [], // No requirement:req-002 link
      };

      const graph = buildGraphWithRequirements([requirement], [], [], [invariant]);

      const result = requirementLinkMissingRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].summary).toContain("lacks traceability");
    });
  });

  describe("refutation case - requirement linked", () => {
    it("does not generate candidate for requirement with linked finding via tags", () => {
      const requirement: AssuranceRequirement = {
        id: "req-001",
        title: "Payment validation on server",
        status: "active",
        scope: ["src/payment/process.ts"],
      };

      const finding: Finding = {
        id: "finding-001",
        ruleId: "CLIENT_TRUSTED_PRICE",
        category: "payment",
        severity: "high",
        confidence: 0.9,
        title: "Client trusted price",
        summary: "Price calculated on client",
        evidence: [],
        affectedSymbols: [],
        affectedEntrypoints: [],
        tags: ["requirement:req-001"], // Has link
      };

      const graph = buildGraphWithRequirements([requirement], [finding]);

      const result = requirementLinkMissingRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(0);
      expect(result.unsupportedClaims).toHaveLength(0);
    });

    it("does not generate candidate for requirement with linked invariant via sourceRequirementIds", () => {
      const requirement: AssuranceRequirement = {
        id: "req-002",
        title: "Auth must use secure tokens",
        status: "active",
        scope: ["src/auth/login.ts"],
      };

      const invariant: Invariant = {
        id: "invariant-001",
        statement: "Auth uses secure tokens",
        kind: "security",
        confidence: 0.9,
        sourceFindingIds: [],
        evidence: [],
        tags: [],
      };

      // Add requirement link to invariant node via custom data
      const graph = buildGraphWithRequirements([requirement], [], [], [invariant]);
      // Manually add sourceRequirementIds to invariant node data
      const invariantNode = graph.nodes.find(n => n.id === "invariant-001");
      if (invariantNode) {
        invariantNode.data.sourceRequirementIds = ["req-002"];
      }

      const result = requirementLinkMissingRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(0);
    });

    it("does not generate candidate when scope is not defined", () => {
      const requirement: AssuranceRequirement = {
        id: "req-003",
        title: "General system requirement",
        status: "active",
        scope: [], // Empty scope - cannot determine which nodes should be linked
      };

      const graph = buildGraphWithRequirements([requirement]);

      const result = requirementLinkMissingRule.evaluate(graph, mockHashService);

      // No candidate because scope determination impossible
      expect(result.candidates).toHaveLength(0);
    });
  });

  describe("candidate format", () => {
    it("candidate has required tags", () => {
      const requirement: AssuranceRequirement = {
        id: "req-001",
        title: "Test requirement",
        status: "active",
        scope: ["src/test.ts"],
      };

      const graph = buildGraphWithRequirements([requirement]);

      const result = requirementLinkMissingRule.evaluate(graph, mockHashService);

      expect(result.candidates[0].tags).toContain("assurance-smell");
      expect(result.candidates[0].tags).toContain("requirement-link-missing");
      expect(result.candidates[0].tags).toContain("review-required");
    });

    it("candidate has review-required title", () => {
      const requirement: AssuranceRequirement = {
        id: "req-payment-001",
        title: "Payment amount validation",
        status: "active",
        scope: ["src/payment.ts"],
      };

      const graph = buildGraphWithRequirements([requirement]);

      const result = requirementLinkMissingRule.evaluate(graph, mockHashService);

      expect(result.candidates[0].title).toMatch(/^Review required:/);
      expect(result.candidates[0].summary).toMatch(/^Review required:/);
    });

    it("candidate has at least one evidence", () => {
      const requirement: AssuranceRequirement = {
        id: "req-001",
        title: "Test requirement",
        status: "active",
        scope: ["src/test.ts"],
      };

      const graph = buildGraphWithRequirements([requirement]);

      const result = requirementLinkMissingRule.evaluate(graph, mockHashService);

      expect(result.candidates[0].evidence.length).toBeGreaterThanOrEqual(1);
    });

    it("candidate includes requirement title in summary", () => {
      const requirement: AssuranceRequirement = {
        id: "req-001",
        title: "Payment amount must be positive",
        status: "active",
        scope: ["src/payment.ts"],
      };

      const graph = buildGraphWithRequirements([requirement]);

      const result = requirementLinkMissingRule.evaluate(graph, mockHashService);

      expect(result.candidates[0].summary).toContain("Payment amount must be positive");
    });
  });

  describe("multiple requirements", () => {
    it("generates candidates for all unlinked requirements", () => {
      const requirements: AssuranceRequirement[] = [
        {
          id: "req-001",
          title: "First requirement",
          status: "active",
          scope: ["src/a.ts"],
        },
        {
          id: "req-002",
          title: "Second requirement",
          status: "active",
          scope: ["src/b.ts"],
        },
        {
          id: "req-003",
          title: "Linked requirement",
          status: "active",
          scope: ["src/c.ts"],
        },
      ];

      const finding: Finding = {
        id: "finding-001",
        ruleId: "CLIENT_TRUSTED_PRICE",
        category: "payment",
        severity: "high",
        confidence: 0.9,
        title: "Client trusted price",
        summary: "Price calculated on client",
        evidence: [],
        affectedSymbols: [],
        affectedEntrypoints: [],
        tags: ["requirement:req-003"], // Linked to req-003 only
      };

      const graph = buildGraphWithRequirements(requirements, [finding]);

      const result = requirementLinkMissingRule.evaluate(graph, mockHashService);

      // 2 unlinked requirements (req-001, req-002)
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates.map(c => c.summary).some(s => s.includes("req-001"))).toBe(true);
      expect(result.candidates.map(c => c.summary).some(s => s.includes("req-002"))).toBe(true);
    });
  });
});
