/**
 * Tests for regression detection functionality
 */

import { describe, it, expect } from "vitest";

import {
  detectRegressions,
  generateRegressionReport,
  isRegression,
  calculateRegressionRiskScore,
  getRegressionSummaryByRuleId,
  hasBlockingRegressions,
  DEFAULT_REGRESSION_CONFIG,
} from "../regression.js";

import {
  FindingComparison,
  RegressionConfig,
} from "../types.js";

import { Severity } from "../../types/artifacts.js";

// Helper to create mock finding comparison
function createMockFindingComparison(
  ruleId: string,
  path: string,
  severity: Severity,
  status: "new" | "resolved" | "unchanged" | "modified",
  regression?: boolean
): FindingComparison {
  return {
    findingId: `finding-${ruleId}-${path}`,
    ruleId,
    status,
    path,
    severity,
    category: "security",
    matchedOn: "ruleId_path",
    regression,
  };
}

describe("Regression Detection", () => {
  // === detectRegressions Tests ===

  describe("detectRegressions", () => {
    it("detects reintroduced findings as regressions", () => {
      const newFindings = [
        createMockFindingComparison("RULE_A", "src/a.ts", "high", "new"),
      ];

      const resolvedFindings = [
        createMockFindingComparison("RULE_A", "src/a.ts", "high", "resolved"),
      ];

      const unchangedFindings: FindingComparison[] = [];

      const regressions = detectRegressions(newFindings, resolvedFindings, unchangedFindings);

      expect(regressions.length).toBe(1);
      expect(regressions[0].ruleId).toBe("RULE_A");
      expect(regressions[0].regression).toBe(true);
    });

    it("does not detect low severity as regression by default", () => {
      const newFindings = [
        createMockFindingComparison("RULE_A", "src/a.ts", "low", "new"),
      ];

      const resolvedFindings = [
        createMockFindingComparison("RULE_A", "src/a.ts", "low", "resolved"),
      ];

      const unchangedFindings: FindingComparison[] = [];

      const regressions = detectRegressions(newFindings, resolvedFindings, unchangedFindings);

      // Default threshold is "medium", so low severity should not be counted
      expect(regressions.length).toBe(0);
    });

    it("detects severity escalation as regression", () => {
      const newFindings: FindingComparison[] = [];

      const resolvedFindings: FindingComparison[] = [];

      const unchangedFindings = [
        {
          ...createMockFindingComparison("RULE_A", "src/a.ts", "high", "unchanged"),
          currentFinding: {
            id: "f1",
            ruleId: "RULE_A",
            category: "security",
            severity: "high",
            confidence: 0.9,
            title: "Test",
            summary: "Test",
            evidence: [],
          },
          previousFinding: {
            id: "f1",
            ruleId: "RULE_A",
            category: "security",
            severity: "medium",
            confidence: 0.9,
            title: "Test",
            summary: "Test",
            evidence: [],
          },
        },
      ];

      const regressions = detectRegressions(newFindings, resolvedFindings, unchangedFindings);

      expect(regressions.length).toBe(1);
      expect(regressions[0].severity).toBe("high");
    });

    it("returns empty when detectRegressions is disabled", () => {
      const config: RegressionConfig = {
        detectRegressions: false,
      };

      const newFindings = [
        createMockFindingComparison("RULE_A", "src/a.ts", "high", "new"),
      ];

      const resolvedFindings = [
        createMockFindingComparison("RULE_A", "src/a.ts", "high", "resolved"),
      ];

      const regressions = detectRegressions(newFindings, resolvedFindings, [], config);

      expect(regressions.length).toBe(0);
    });

    it("detects specific regression rules", () => {
      const config: RegressionConfig = {
        detectRegressions: true,
        regressionRules: ["CRITICAL_RULE"],
      };

      const newFindings = [
        createMockFindingComparison("CRITICAL_RULE", "src/new.ts", "critical", "new"),
      ];

      const resolvedFindings: FindingComparison[] = [];

      const regressions = detectRegressions(newFindings, resolvedFindings, [], config);

      expect(regressions.length).toBe(1);
      expect(regressions[0].ruleId).toBe("CRITICAL_RULE");
    });

    it("respects severity threshold", () => {
      const config: RegressionConfig = {
        detectRegressions: true,
        severityThreshold: "high",
      };

      const newFindings = [
        createMockFindingComparison("RULE_A", "src/a.ts", "medium", "new"),
      ];

      const resolvedFindings = [
        createMockFindingComparison("RULE_A", "src/a.ts", "medium", "resolved"),
      ];

      const regressions = detectRegressions(newFindings, resolvedFindings, [], config);

      // Medium is below "high" threshold
      expect(regressions.length).toBe(0);
    });

    it("detects critical severity regressions regardless of threshold", () => {
      const config: RegressionConfig = {
        detectRegressions: true,
        severityThreshold: "critical",
        allowResolvedThenReintroduced: true,
      };

      const newFindings = [
        createMockFindingComparison("RULE_A", "src/a.ts", "critical", "new"),
      ];

      const resolvedFindings = [
        createMockFindingComparison("RULE_A", "src/a.ts", "critical", "resolved"),
      ];

      const regressions = detectRegressions(newFindings, resolvedFindings, [], config);

      expect(regressions.length).toBe(1);
    });
  });

  // === generateRegressionReport Tests ===

  describe("generateRegressionReport", () => {
    it("generates complete regression report", () => {
      const newFindings = [
        createMockFindingComparison("RULE_A", "src/a.ts", "high", "new"),
        createMockFindingComparison("RULE_B", "src/b.ts", "medium", "new"),
      ];

      const resolvedFindings = [
        createMockFindingComparison("RULE_A", "src/a.ts", "high", "resolved"),
        createMockFindingComparison("RULE_C", "src/c.ts", "low", "resolved"),
      ];

      const unchangedFindings: FindingComparison[] = [];
      const modifiedFindings: FindingComparison[] = [];

      const report = generateRegressionReport(newFindings, resolvedFindings, unchangedFindings, modifiedFindings);

      expect(report.regressions.length).toBe(1);
      expect(report.summary.regressionCount).toBe(1);
      expect(report.summary.byRuleId["RULE_A"]).toBe(1);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it("identifies potential regressions (same ruleId, different path)", () => {
      const newFindings = [
        createMockFindingComparison("RULE_A", "src/new-path.ts", "high", "new"),
      ];

      const resolvedFindings = [
        createMockFindingComparison("RULE_A", "src/old-path.ts", "high", "resolved"),
      ];

      const unchangedFindings: FindingComparison[] = [];
      const modifiedFindings: FindingComparison[] = [];

      const report = generateRegressionReport(newFindings, resolvedFindings, unchangedFindings, modifiedFindings);

      // Not exact regression (different path), but potential regression
      expect(report.potentialRegressions.length).toBe(1);
      expect(report.potentialRegressions[0].ruleId).toBe("RULE_A");
    });

    it("identifies reintroduced findings", () => {
      const newFindings = [
        createMockFindingComparison("RULE_A", "src/a.ts", "high", "new"),
      ];

      const resolvedFindings = [
        createMockFindingComparison("RULE_A", "src/a.ts", "high", "resolved"),
      ];

      const unchangedFindings: FindingComparison[] = [];
      const modifiedFindings: FindingComparison[] = [];

      const report = generateRegressionReport(newFindings, resolvedFindings, unchangedFindings, modifiedFindings);

      expect(report.reintroducedFindings.length).toBe(1);
    });

    it("generates recommendations for critical regressions", () => {
      const newFindings = [
        createMockFindingComparison("CRITICAL_RULE", "src/critical.ts", "critical", "new"),
      ];

      const resolvedFindings = [
        createMockFindingComparison("CRITICAL_RULE", "src/critical.ts", "critical", "resolved"),
      ];

      const unchangedFindings: FindingComparison[] = [];
      const modifiedFindings: FindingComparison[] = [];

      const report = generateRegressionReport(newFindings, resolvedFindings, unchangedFindings, modifiedFindings);

      expect(report.recommendations.some(r => r.includes("Critical"))).toBe(true);
    });

    it("generates no regression message when clean", () => {
      const newFindings: FindingComparison[] = [];
      const resolvedFindings: FindingComparison[] = [];
      const unchangedFindings: FindingComparison[] = [];
      const modifiedFindings: FindingComparison[] = [];

      const report = generateRegressionReport(newFindings, resolvedFindings, unchangedFindings, modifiedFindings);

      expect(report.summary.regressionCount).toBe(0);
      expect(report.recommendations.some(r => r.includes("No regressions"))).toBe(true);
    });
  });

  // === isRegression Tests ===

  describe("isRegression", () => {
    it("returns true for reintroduced finding", () => {
      const finding = createMockFindingComparison("RULE_A", "src/a.ts", "high", "new");

      const resolvedFindings = [
        createMockFindingComparison("RULE_A", "src/a.ts", "high", "resolved"),
      ];

      expect(isRegression(finding, resolvedFindings)).toBe(true);
    });

    it("returns false for new finding not previously resolved", () => {
      const finding = createMockFindingComparison("RULE_B", "src/b.ts", "high", "new");

      const resolvedFindings = [
        createMockFindingComparison("RULE_A", "src/a.ts", "high", "resolved"),
      ];

      expect(isRegression(finding, resolvedFindings)).toBe(false);
    });

    it("returns false when detection disabled", () => {
      const finding = createMockFindingComparison("RULE_A", "src/a.ts", "high", "new");

      const resolvedFindings = [
        createMockFindingComparison("RULE_A", "src/a.ts", "high", "resolved"),
      ];

      const config: RegressionConfig = { detectRegressions: false };

      expect(isRegression(finding, resolvedFindings, config)).toBe(false);
    });
  });

  // === calculateRegressionRiskScore Tests ===

  describe("calculateRegressionRiskScore", () => {
    it("calculates score based on severity weights", () => {
      const regressions = [
        createMockFindingComparison("RULE_A", "src/a.ts", "critical", "new", true),
        createMockFindingComparison("RULE_B", "src/b.ts", "high", "new", true),
        createMockFindingComparison("RULE_C", "src/c.ts", "medium", "new", true),
      ];

      const score = calculateRegressionRiskScore(regressions);

      // Default weights: critical=20, high=10, medium=5, low=2
      expect(score).toBe(20 + 10 + 5);
    });

    it("returns 0 for empty regressions", () => {
      const score = calculateRegressionRiskScore([]);
      expect(score).toBe(0);
    });

    it("uses custom severity weights", () => {
      const regressions = [
        createMockFindingComparison("RULE_A", "src/a.ts", "critical", "new", true),
      ];

      const customWeights = { critical: 100, high: 50, medium: 20, low: 5 };

      const score = calculateRegressionRiskScore(regressions, customWeights);
      expect(score).toBe(100);
    });
  });

  // === getRegressionSummaryByRuleId Tests ===

  describe("getRegressionSummaryByRuleId", () => {
    it("groups regressions by ruleId", () => {
      const regressions = [
        createMockFindingComparison("RULE_A", "src/a.ts", "high", "new", true),
        createMockFindingComparison("RULE_A", "src/b.ts", "medium", "new", true),
        createMockFindingComparison("RULE_B", "src/c.ts", "critical", "new", true),
      ];

      const summary = getRegressionSummaryByRuleId(regressions);

      expect(summary["RULE_A"].count).toBe(2);
      expect(summary["RULE_A"].paths.length).toBe(2);
      expect(summary["RULE_B"].count).toBe(1);
    });

    it("returns empty object for no regressions", () => {
      const summary = getRegressionSummaryByRuleId([]);
      expect(summary).toEqual({});
    });
  });

  // === hasBlockingRegressions Tests ===

  describe("hasBlockingRegressions", () => {
    it("returns true for critical regressions", () => {
      const regressions = [
        createMockFindingComparison("RULE_A", "src/a.ts", "critical", "new", true),
      ];

      expect(hasBlockingRegressions(regressions)).toBe(true);
    });

    it("returns true for high regressions with default threshold", () => {
      const regressions = [
        createMockFindingComparison("RULE_A", "src/a.ts", "high", "new", true),
      ];

      // Default blocking threshold is "high"
      expect(hasBlockingRegressions(regressions)).toBe(true);
    });

    it("returns false for medium regressions with high threshold", () => {
      const regressions = [
        createMockFindingComparison("RULE_A", "src/a.ts", "medium", "new", true),
      ];

      expect(hasBlockingRegressions(regressions, "high")).toBe(false);
    });

    it("returns false for empty regressions", () => {
      expect(hasBlockingRegressions([])).toBe(false);
    });
  });

  // === Default Config Tests ===

  describe("DEFAULT_REGRESSION_CONFIG", () => {
    it("has sensible defaults", () => {
      expect(DEFAULT_REGRESSION_CONFIG.detectRegressions).toBe(true);
      expect(DEFAULT_REGRESSION_CONFIG.severityThreshold).toBe("medium");
      expect(DEFAULT_REGRESSION_CONFIG.pathMatchRequired).toBe(true);
      expect(DEFAULT_REGRESSION_CONFIG.allowResolvedThenReintroduced).toBe(true);
    });
  });
});