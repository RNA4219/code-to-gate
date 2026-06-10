/**
 * Tests for RISK_WITHOUT_TEST detection rule.
 *
 * Validates:
 * - Risk without linked test seed (via sourceRiskIds or sourceFindingIds)
 * - Low severity exemption
 * - Unsupported claims for insufficient input
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { Finding, RiskSeed, TestSeed, NormalizedRepoGraph } from "../../../types/artifacts.js";
import type { AssuranceGraph } from "../assurance-graph.js";
import { buildAssuranceGraph } from "../assurance-graph.js";
import { riskWithoutTestRule } from "../rules/risk-without-test.js";
import type { HashService } from "../../../types/contracts.js";

// Mock hash service
const mockHashService: HashService = {
  sha256: (input: string) => `sha256-${input.length}`,
  fingerprint: (input: string) => `fp-${input.slice(0, 8)}`,
};

describe("RISK_WITHOUT_TEST rule", () => {
  describe("sufficient input", () => {
    it("generates unsupported claim when risk-register.yaml missing", () => {
      const graph: AssuranceGraph = {
        nodes: [],
        edges: [],
        coverage: {
          artifacts: [
            { artifact: "risk-register.yaml", loaded: false, recordCount: 0 },
            { artifact: "test-seeds.json", loaded: true, recordCount: 1 },
          ],
          loadedArtifacts: ["test-seeds.json"],
          missingArtifacts: ["risk-register.yaml"],
          partialInput: true,
          totalNodes: 0,
          totalEdges: 0,
        },
      };

      const result = riskWithoutTestRule.evaluate(graph, mockHashService);

      expect(result.ruleId).toBe("RISK_WITHOUT_TEST");
      expect(result.unsupportedClaims).toHaveLength(1);
      expect(result.unsupportedClaims[0].reason).toBe("missing_evidence");
      expect(result.candidates).toHaveLength(0);
    });

    it("generates unsupported claim when test-seeds.json missing", () => {
      const graph: AssuranceGraph = {
        nodes: [],
        edges: [],
        coverage: {
          artifacts: [
            { artifact: "risk-register.yaml", loaded: true, recordCount: 1 },
            { artifact: "test-seeds.json", loaded: false, recordCount: 0 },
          ],
          loadedArtifacts: ["risk-register.yaml"],
          missingArtifacts: ["test-seeds.json"],
          partialInput: true,
          totalNodes: 0,
          totalEdges: 0,
        },
      };

      const result = riskWithoutTestRule.evaluate(graph, mockHashService);

      expect(result.unsupportedClaims).toHaveLength(1);
      expect(result.unsupportedClaims[0].reason).toBe("missing_evidence");
    });
  });

  describe("positive case - risk without test seed", () => {
    it("detects risk without linked test seed", () => {
      const risk: RiskSeed = {
        id: "risk-001",
        title: "Payment fraud risk",
        severity: "high",
        likelihood: "high",
        impact: ["financial"],
        confidence: 0.8,
        sourceFindingIds: [],
        evidence: [],
        recommendedActions: [],
      };

      const testSeed: TestSeed = {
        id: "test-001",
        title: "Auth test",
        kind: "integration",
        sourceRiskIds: ["risk-002"], // Different risk
        sourceFindingIds: [],
        targetEntrypoints: [],
        targetSymbols: [],
        executionStatus: "passed",
        lastRun: "2026-06-01T00:00:00Z",
        coverageScope: [],
        confidence: 0.9,
        evidence: [],
      };

      const repoGraph: NormalizedRepoGraph = {
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        generatedAt: "2026-06-09T00:00:00Z",
        files: [],
        modules: [],
        symbols: [],
        relations: [],
        tests: [],
        configs: [],
        entrypoints: [],
        diagnostics: [],
        stats: { partial: false },
      };

      const graph = buildAssuranceGraph({
        riskRegister: [risk],
        testSeeds: [testSeed],
        repoGraph,
      });

      const result = riskWithoutTestRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].ruleId).toBe("RISK_WITHOUT_TEST");
      expect(result.candidates[0].severity).toBe("medium");
      expect(result.candidates[0].tags).toContain("assurance-smell");
      expect(result.candidates[0].tags).toContain("risk-without-test");
      expect(result.candidates[0].tags).toContain("review-required");
    });

    it("detects risk without test seed via sourceFindingIds", () => {
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
        tags: [],
      };

      const risk: RiskSeed = {
        id: "risk-001",
        title: "Payment risk",
        severity: "high",
        likelihood: "high",
        impact: ["financial"],
        confidence: 0.8,
        sourceFindingIds: ["finding-001"],
        evidence: [],
        recommendedActions: [],
      };

      const testSeed: TestSeed = {
        id: "test-001",
        title: "Auth test",
        kind: "integration",
        sourceRiskIds: [],
        sourceFindingIds: ["finding-002"], // Different finding
        targetEntrypoints: [],
        targetSymbols: [],
        executionStatus: "passed",
        lastRun: "2026-06-01T00:00:00Z",
        coverageScope: [],
        confidence: 0.9,
        evidence: [],
      };

      const repoGraph: NormalizedRepoGraph = {
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        generatedAt: "2026-06-09T00:00:00Z",
        files: [],
        modules: [],
        symbols: [],
        relations: [],
        tests: [],
        configs: [],
        entrypoints: [],
        diagnostics: [],
        stats: { partial: false },
      };

      const graph = buildAssuranceGraph({
        findings: [finding],
        riskRegister: [risk],
        testSeeds: [testSeed],
        repoGraph,
      });

      const result = riskWithoutTestRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].summary).toContain("lacks test coverage");
    });
  });

  describe("refutation case - risk with test seed", () => {
    it("does not generate candidate for risk with direct sourceRiskIds link", () => {
      const risk: RiskSeed = {
        id: "risk-001",
        title: "Payment risk",
        severity: "high",
        likelihood: "high",
        impact: ["financial"],
        confidence: 0.8,
        sourceFindingIds: [],
        evidence: [],
        recommendedActions: [],
      };

      const testSeed: TestSeed = {
        id: "test-001",
        title: "Payment test",
        kind: "integration",
        sourceRiskIds: ["risk-001"], // Direct link
        sourceFindingIds: [],
        targetEntrypoints: [],
        targetSymbols: [],
        executionStatus: "passed",
        lastRun: "2026-06-01T00:00:00Z",
        coverageScope: [],
        confidence: 0.9,
        evidence: [],
      };

      const repoGraph: NormalizedRepoGraph = {
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        generatedAt: "2026-06-09T00:00:00Z",
        files: [],
        modules: [],
        symbols: [],
        relations: [],
        tests: [],
        configs: [],
        entrypoints: [],
        diagnostics: [],
        stats: { partial: false },
      };

      const graph = buildAssuranceGraph({
        riskRegister: [risk],
        testSeeds: [testSeed],
        repoGraph,
      });

      const result = riskWithoutTestRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(0);
      expect(result.unsupportedClaims).toHaveLength(0);
    });

    it("does not generate candidate for risk with common sourceFindingIds", () => {
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
        tags: [],
      };

      const risk: RiskSeed = {
        id: "risk-001",
        title: "Payment risk",
        severity: "high",
        likelihood: "high",
        impact: ["financial"],
        confidence: 0.8,
        sourceFindingIds: ["finding-001"],
        evidence: [],
        recommendedActions: [],
      };

      const testSeed: TestSeed = {
        id: "test-001",
        title: "Payment test",
        kind: "integration",
        sourceRiskIds: [],
        sourceFindingIds: ["finding-001"], // Common finding
        targetEntrypoints: [],
        targetSymbols: [],
        executionStatus: "passed",
        lastRun: "2026-06-01T00:00:00Z",
        coverageScope: [],
        confidence: 0.9,
        evidence: [],
      };

      const repoGraph: NormalizedRepoGraph = {
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        generatedAt: "2026-06-09T00:00:00Z",
        files: [],
        modules: [],
        symbols: [],
        relations: [],
        tests: [],
        configs: [],
        entrypoints: [],
        diagnostics: [],
        stats: { partial: false },
      };

      const graph = buildAssuranceGraph({
        findings: [finding],
        riskRegister: [risk],
        testSeeds: [testSeed],
        repoGraph,
      });

      const result = riskWithoutTestRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(0);
    });
  });

  describe("low severity exemption", () => {
    it("does not generate candidate for low severity risk", () => {
      const risk: RiskSeed = {
        id: "risk-001",
        title: "Low severity risk",
        severity: "low",
        likelihood: "low",
        impact: ["documentation"],
        confidence: 0.6,
        sourceFindingIds: [],
        evidence: [],
        recommendedActions: [],
      };

      const testSeed: TestSeed = {
        id: "test-001",
        title: "Other test",
        kind: "integration",
        sourceRiskIds: ["risk-002"],
        sourceFindingIds: [],
        targetEntrypoints: [],
        targetSymbols: [],
        executionStatus: "passed",
        lastRun: "2026-06-01T00:00:00Z",
        coverageScope: [],
        confidence: 0.9,
        evidence: [],
      };

      const repoGraph: NormalizedRepoGraph = {
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        generatedAt: "2026-06-09T00:00:00Z",
        files: [],
        modules: [],
        symbols: [],
        relations: [],
        tests: [],
        configs: [],
        entrypoints: [],
        diagnostics: [],
        stats: { partial: false },
      };

      const graph = buildAssuranceGraph({
        riskRegister: [risk],
        testSeeds: [testSeed],
        repoGraph,
      });

      const result = riskWithoutTestRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(0);
    });
  });

  describe("candidate format", () => {
    it("candidate has required tags", () => {
      const risk: RiskSeed = {
        id: "risk-001",
        title: "High risk",
        severity: "high",
        likelihood: "high",
        impact: ["financial"],
        confidence: 0.8,
        sourceFindingIds: [],
        evidence: [],
        recommendedActions: [],
      };

      const repoGraph: NormalizedRepoGraph = {
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        generatedAt: "2026-06-09T00:00:00Z",
        files: [],
        modules: [],
        symbols: [],
        relations: [],
        tests: [],
        configs: [],
        entrypoints: [],
        diagnostics: [],
        stats: { partial: false },
      };

      const graph = buildAssuranceGraph({
        riskRegister: [risk],
        repoGraph,
      });

      const result = riskWithoutTestRule.evaluate(graph, mockHashService);

      // Should have unsupported claim since test-seeds missing
      expect(result.unsupportedClaims).toHaveLength(1);
    });

    it("candidate has review-required title", () => {
      const risk: RiskSeed = {
        id: "risk-001",
        title: "Payment risk",
        severity: "high",
        likelihood: "high",
        impact: ["financial"],
        confidence: 0.8,
        sourceFindingIds: [],
        evidence: [],
        recommendedActions: [],
      };

      const testSeed: TestSeed = {
        id: "test-001",
        title: "Other test",
        kind: "integration",
        sourceRiskIds: ["risk-002"],
        sourceFindingIds: [],
        targetEntrypoints: [],
        targetSymbols: [],
        executionStatus: "passed",
        lastRun: "2026-06-01T00:00:00Z",
        coverageScope: [],
        confidence: 0.9,
        evidence: [],
      };

      const repoGraph: NormalizedRepoGraph = {
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        generatedAt: "2026-06-09T00:00:00Z",
        files: [],
        modules: [],
        symbols: [],
        relations: [],
        tests: [],
        configs: [],
        entrypoints: [],
        diagnostics: [],
        stats: { partial: false },
      };

      const graph = buildAssuranceGraph({
        riskRegister: [risk],
        testSeeds: [testSeed],
        repoGraph,
      });

      const result = riskWithoutTestRule.evaluate(graph, mockHashService);

      expect(result.candidates[0].title).toMatch(/^Review required:/);
      expect(result.candidates[0].summary).toMatch(/^Review required:/);
    });

    it("candidate has at least one evidence", () => {
      const risk: RiskSeed = {
        id: "risk-001",
        title: "Payment risk",
        severity: "high",
        likelihood: "high",
        impact: ["financial"],
        confidence: 0.8,
        sourceFindingIds: [],
        evidence: [],
        recommendedActions: [],
      };

      const testSeed: TestSeed = {
        id: "test-001",
        title: "Other test",
        kind: "integration",
        sourceRiskIds: ["risk-002"],
        sourceFindingIds: [],
        targetEntrypoints: [],
        targetSymbols: [],
        executionStatus: "passed",
        lastRun: "2026-06-01T00:00:00Z",
        coverageScope: [],
        confidence: 0.9,
        evidence: [],
      };

      const repoGraph: NormalizedRepoGraph = {
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        generatedAt: "2026-06-09T00:00:00Z",
        files: [],
        modules: [],
        symbols: [],
        relations: [],
        tests: [],
        configs: [],
        entrypoints: [],
        diagnostics: [],
        stats: { partial: false },
      };

      const graph = buildAssuranceGraph({
        riskRegister: [risk],
        testSeeds: [testSeed],
        repoGraph,
      });

      const result = riskWithoutTestRule.evaluate(graph, mockHashService);

      expect(result.candidates[0].evidence.length).toBeGreaterThanOrEqual(1);
    });

    it("candidate includes source findings in summary", () => {
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
        tags: [],
      };

      const risk: RiskSeed = {
        id: "risk-001",
        title: "Payment risk",
        severity: "high",
        likelihood: "high",
        impact: ["financial"],
        confidence: 0.8,
        sourceFindingIds: ["finding-001"],
        evidence: [],
        recommendedActions: [],
      };

      const testSeed: TestSeed = {
        id: "test-001",
        title: "Other test",
        kind: "integration",
        sourceRiskIds: ["risk-002"],
        sourceFindingIds: [],
        targetEntrypoints: [],
        targetSymbols: [],
        executionStatus: "passed",
        lastRun: "2026-06-01T00:00:00Z",
        coverageScope: [],
        confidence: 0.9,
        evidence: [],
      };

      const repoGraph: NormalizedRepoGraph = {
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        generatedAt: "2026-06-09T00:00:00Z",
        files: [],
        modules: [],
        symbols: [],
        relations: [],
        tests: [],
        configs: [],
        entrypoints: [],
        diagnostics: [],
        stats: { partial: false },
      };

      const graph = buildAssuranceGraph({
        findings: [finding],
        riskRegister: [risk],
        testSeeds: [testSeed],
        repoGraph,
      });

      const result = riskWithoutTestRule.evaluate(graph, mockHashService);

      expect(result.candidates[0].summary).toContain("finding-001");
    });
  });
});