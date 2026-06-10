/**
 * Tests for EVIDENCE_MISSING detection rule.
 *
 * Validates:
 * - Evidence path not in repo graph
 * - Invalid line ranges
 * - Dangling references
 * - Unsupported claims for insufficient input
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { Finding, RiskSeed, NormalizedRepoGraph, EvidenceRef } from "../../../types/artifacts.js";
import type { AssuranceGraph } from "../assurance-graph.js";
import { buildAssuranceGraph } from "../assurance-graph.js";
import { evidenceMissingRule } from "../rules/evidence-missing.js";
import type { HashService } from "../../../types/contracts.js";

// Mock hash service
const mockHashService: HashService = {
  sha256: (input: string) => `sha256-${input.length}`,
  fingerprint: (input: string) => `fp-${input.slice(0, 8)}`,
};

describe("EVIDENCE_MISSING rule", () => {
  describe("sufficient input", () => {
    it("generates unsupported claim when findings.json missing", () => {
      const graph: AssuranceGraph = {
        nodes: [],
        edges: [],
        coverage: {
          artifacts: [{ artifact: "findings.json", loaded: false, recordCount: 0 }],
          loadedArtifacts: [],
          missingArtifacts: ["findings.json"],
          partialInput: true,
          totalNodes: 0,
          totalEdges: 0,
        },
      };

      const result = evidenceMissingRule.evaluate(graph, mockHashService);

      expect(result.ruleId).toBe("EVIDENCE_MISSING");
      expect(result.unsupportedClaims).toHaveLength(1);
      expect(result.unsupportedClaims[0].reason).toBe("missing_evidence");
      expect(result.candidates).toHaveLength(0);
    });

    it("generates unsupported claim when repo-graph.json missing", () => {
      const graph: AssuranceGraph = {
        nodes: [],
        edges: [],
        coverage: {
          artifacts: [
            { artifact: "findings.json", loaded: true, recordCount: 1 },
            { artifact: "repo-graph.json", loaded: false, recordCount: 0 },
          ],
          loadedArtifacts: ["findings.json"],
          missingArtifacts: ["repo-graph.json"],
          partialInput: true,
          totalNodes: 0,
          totalEdges: 0,
        },
      };

      const result = evidenceMissingRule.evaluate(graph, mockHashService);

      expect(result.unsupportedClaims).toHaveLength(1);
      expect(result.unsupportedClaims[0].reason).toBe("missing_evidence");
    });
  });

  describe("positive case - evidence path not found", () => {
    it("detects evidence path not in repo graph files", () => {
      const finding: Finding = {
        id: "finding-001",
        ruleId: "CLIENT_TRUSTED_PRICE",
        category: "payment",
        severity: "high",
        confidence: 0.9,
        title: "Client trusted price",
        summary: "Price calculated on client",
        evidence: [{
          id: "evidence-001",
          path: "src/nonexistent.ts",
          kind: "ast",
          startLine: 10,
          endLine: 20,
        }],
        affectedSymbols: [],
        affectedEntrypoints: [],
        tags: [],
      };

      const repoGraph: NormalizedRepoGraph = {
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        generatedAt: "2026-06-09T00:00:00Z",
        files: [{
          id: "file-001",
          path: "src/existing.ts",
          language: "ts",
          role: "source",
          hash: "abc123",
          sizeBytes: 1000,
          lineCount: 50,
          parser: { status: "parsed" },
        }],
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
        repoGraph,
      });

      const result = evidenceMissingRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].ruleId).toBe("EVIDENCE_MISSING");
      expect(result.candidates[0].severity).toBe("medium");
      expect(result.candidates[0].tags).toContain("assurance-smell");
      expect(result.candidates[0].tags).toContain("evidence-missing");
      expect(result.candidates[0].tags).toContain("review-required");
    });
  });

  describe("refutation case - valid evidence", () => {
    it("does not generate candidate for valid evidence path", () => {
      const finding: Finding = {
        id: "finding-002",
        ruleId: "CLIENT_TRUSTED_PRICE",
        category: "payment",
        severity: "high",
        confidence: 0.9,
        title: "Client trusted price",
        summary: "Price calculated on client",
        evidence: [{
          id: "evidence-002",
          path: "src/existing.ts",
          kind: "ast",
          startLine: 10,
          endLine: 20,
        }],
        affectedSymbols: [],
        affectedEntrypoints: [],
        tags: [],
      };

      const repoGraph: NormalizedRepoGraph = {
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        generatedAt: "2026-06-09T00:00:00Z",
        files: [{
          id: "file-001",
          path: "src/existing.ts",
          language: "ts",
          role: "source",
          hash: "abc123",
          sizeBytes: 1000,
          lineCount: 50,
          parser: { status: "parsed" },
        }],
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
        repoGraph,
      });

      const result = evidenceMissingRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(0);
      expect(result.unsupportedClaims).toHaveLength(0);
    });

    it("does not generate candidate for external evidence", () => {
      const finding: Finding = {
        id: "finding-003",
        ruleId: "CLIENT_TRUSTED_PRICE",
        category: "payment",
        severity: "high",
        confidence: 0.9,
        title: "Client trusted price",
        summary: "Price calculated on client",
        evidence: [{
          id: "evidence-003",
          path: "",
          kind: "external",
          externalRef: "https://external.example.com/doc",
        }],
        affectedSymbols: [],
        affectedEntrypoints: [],
        tags: [],
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
        repoGraph,
      });

      const result = evidenceMissingRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(0);
    });
  });

  describe("invalid line ranges", () => {
    it("detects startLine > endLine", () => {
      const finding: Finding = {
        id: "finding-004",
        ruleId: "CLIENT_TRUSTED_PRICE",
        category: "payment",
        severity: "high",
        confidence: 0.9,
        title: "Client trusted price",
        summary: "Price calculated on client",
        evidence: [{
          id: "evidence-004",
          path: "src/existing.ts",
          kind: "ast",
          startLine: 30,
          endLine: 10,
        }],
        affectedSymbols: [],
        affectedEntrypoints: [],
        tags: [],
      };

      const repoGraph: NormalizedRepoGraph = {
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        generatedAt: "2026-06-09T00:00:00Z",
        files: [{
          id: "file-001",
          path: "src/existing.ts",
          language: "ts",
          role: "source",
          hash: "abc123",
          sizeBytes: 1000,
          lineCount: 50,
          parser: { status: "parsed" },
        }],
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
        repoGraph,
      });

      const result = evidenceMissingRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].summary).toContain("line range invalid");
    });

    it("detects line < 1", () => {
      const finding: Finding = {
        id: "finding-005",
        ruleId: "CLIENT_TRUSTED_PRICE",
        category: "payment",
        severity: "high",
        confidence: 0.9,
        title: "Client trusted price",
        summary: "Price calculated on client",
        evidence: [{
          id: "evidence-005",
          path: "src/existing.ts",
          kind: "ast",
          startLine: 0,
          endLine: 10,
        }],
        affectedSymbols: [],
        affectedEntrypoints: [],
        tags: [],
      };

      const repoGraph: NormalizedRepoGraph = {
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        generatedAt: "2026-06-09T00:00:00Z",
        files: [{
          id: "file-001",
          path: "src/existing.ts",
          language: "ts",
          role: "source",
          hash: "abc123",
          sizeBytes: 1000,
          lineCount: 50,
          parser: { status: "parsed" },
        }],
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
        repoGraph,
      });

      const result = evidenceMissingRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(1);
    });

    it("detects endLine > file lineCount", () => {
      const finding: Finding = {
        id: "finding-006",
        ruleId: "CLIENT_TRUSTED_PRICE",
        category: "payment",
        severity: "high",
        confidence: 0.9,
        title: "Client trusted price",
        summary: "Price calculated on client",
        evidence: [{
          id: "evidence-006",
          path: "src/existing.ts",
          kind: "ast",
          startLine: 10,
          endLine: 100, // file has only 50 lines
        }],
        affectedSymbols: [],
        affectedEntrypoints: [],
        tags: [],
      };

      const repoGraph: NormalizedRepoGraph = {
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        generatedAt: "2026-06-09T00:00:00Z",
        files: [{
          id: "file-001",
          path: "src/existing.ts",
          language: "ts",
          role: "source",
          hash: "abc123",
          sizeBytes: 1000,
          lineCount: 50,
          parser: { status: "parsed" },
        }],
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
        repoGraph,
      });

      const result = evidenceMissingRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].summary).toContain("lineCount");
    });
  });

  describe("missing evidence path", () => {
    it("detects empty evidence path", () => {
      const finding: Finding = {
        id: "finding-007",
        ruleId: "CLIENT_TRUSTED_PRICE",
        category: "payment",
        severity: "high",
        confidence: 0.9,
        title: "Client trusted price",
        summary: "Price calculated on client",
        evidence: [{
          id: "evidence-007",
          path: "",
          kind: "ast",
        }],
        affectedSymbols: [],
        affectedEntrypoints: [],
        tags: [],
      };

      const repoGraph: NormalizedRepoGraph = {
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        generatedAt: "2026-06-09T00:00:00Z",
        files: [{
          id: "file-001",
          path: "src/existing.ts",
          language: "ts",
          role: "source",
          hash: "abc123",
          sizeBytes: 1000,
          lineCount: 50,
          parser: { status: "parsed" },
        }],
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
        repoGraph,
      });

      const result = evidenceMissingRule.evaluate(graph, mockHashService);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].summary).toContain("missing");
    });
  });

  describe("risk evidence validation", () => {
    it("detects evidence path not in repo graph for risk", () => {
      // Add a minimal finding to satisfy hasSufficientInput
      const finding: Finding = {
        id: "finding-001",
        ruleId: "CLIENT_TRUSTED_PRICE",
        category: "payment",
        severity: "high",
        confidence: 0.9,
        title: "Client trusted price",
        summary: "Price calculated on client",
        evidence: [{
          id: "evidence-001",
          path: "src/existing.ts",
          kind: "ast",
          startLine: 10,
          endLine: 20,
        }],
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
        evidence: [{
          id: "risk-evidence-001",
          path: "src/nonexistent.ts",
          kind: "text",
        }],
        recommendedActions: [],
      };

      const repoGraph: NormalizedRepoGraph = {
        artifact: "normalized-repo-graph",
        schema: "normalized-repo-graph@v1",
        generatedAt: "2026-06-09T00:00:00Z",
        files: [{
          id: "file-001",
          path: "src/existing.ts",
          language: "ts",
          role: "source",
          hash: "abc123",
          sizeBytes: 1000,
          lineCount: 50,
          parser: { status: "parsed" },
        }],
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
        repoGraph,
      });

      const result = evidenceMissingRule.evaluate(graph, mockHashService);

      expect(result.candidates.length).toBeGreaterThanOrEqual(1);
      expect(result.candidates[0].summary).toContain("risk");
    });
  });

  describe("candidate format", () => {
    it("candidate has required tags", () => {
      const finding: Finding = {
        id: "finding-008",
        ruleId: "CLIENT_TRUSTED_PRICE",
        category: "payment",
        severity: "high",
        confidence: 0.9,
        title: "Client trusted price",
        summary: "Price calculated on client",
        evidence: [{
          id: "evidence-008",
          path: "src/nonexistent.ts",
          kind: "ast",
        }],
        affectedSymbols: [],
        affectedEntrypoints: [],
        tags: [],
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
        repoGraph,
      });

      const result = evidenceMissingRule.evaluate(graph, mockHashService);

      expect(result.candidates[0].tags).toContain("assurance-smell");
      expect(result.candidates[0].tags).toContain("evidence-missing");
      expect(result.candidates[0].tags).toContain("review-required");
    });

    it("candidate has review-required title", () => {
      const finding: Finding = {
        id: "finding-009",
        ruleId: "CLIENT_TRUSTED_PRICE",
        category: "payment",
        severity: "high",
        confidence: 0.9,
        title: "Client trusted price",
        summary: "Price calculated on client",
        evidence: [{
          id: "evidence-009",
          path: "src/nonexistent.ts",
          kind: "ast",
        }],
        affectedSymbols: [],
        affectedEntrypoints: [],
        tags: [],
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
        repoGraph,
      });

      const result = evidenceMissingRule.evaluate(graph, mockHashService);

      expect(result.candidates[0].title).toMatch(/^Review required:/);
      expect(result.candidates[0].summary).toMatch(/^Review required:/);
    });

    it("candidate has at least one evidence", () => {
      const finding: Finding = {
        id: "finding-010",
        ruleId: "CLIENT_TRUSTED_PRICE",
        category: "payment",
        severity: "high",
        confidence: 0.9,
        title: "Client trusted price",
        summary: "Price calculated on client",
        evidence: [{
          id: "evidence-010",
          path: "src/nonexistent.ts",
          kind: "ast",
          startLine: 10,
          endLine: 20,
        }],
        affectedSymbols: [],
        affectedEntrypoints: [],
        tags: [],
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
        repoGraph,
      });

      const result = evidenceMissingRule.evaluate(graph, mockHashService);

      expect(result.candidates[0].evidence.length).toBeGreaterThanOrEqual(1);
    });
  });
});