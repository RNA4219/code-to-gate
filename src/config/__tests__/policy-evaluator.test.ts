/**
 * Policy evaluator tests
 */

import { describe, it, expect } from "vitest";
import type { Finding, EvidenceRef } from "../../types/artifacts.js";
import {
  evaluatePolicy,
  getExitCode,
  isBlockingStatus,
  getStatusMessage,
  generateEvaluationSummary,
} from "../policy-evaluator.js";
import {
  createDefaultPolicy,
  type CtgPolicy,
  type SuppressionEntry,
} from "../policy-loader.js";

// Helper to create a mock finding
function createMockFinding(
  id: string,
  ruleId: string,
  severity: "low" | "medium" | "high" | "critical",
  category: "auth" | "payment" | "validation" | "data" | "config" | "maintainability" | "testing" | "compatibility" | "release-risk",
  confidence: number,
  path: string = "src/test.ts"
): Finding {
  const evidence: EvidenceRef[] = [
    {
      id: `evidence-${id}`,
      path,
      startLine: 10,
      endLine: 15,
      kind: "ast",
    },
  ];

  return {
    id,
    ruleId,
    category,
    severity,
    confidence,
    title: `Mock finding ${id}`,
    summary: `Mock summary for ${id}`,
    evidence,
    tags: [],
  };
}

describe("policy-evaluator", () => {
  describe("evaluatePolicy", () => {
    it("should return passed status when no findings", () => {
      const policy = createDefaultPolicy();
      const result = evaluatePolicy([], policy);

      expect(result.status).toBe("passed");
      expect(result.summary.totalFindings).toBe(0);
      expect(result.passedFindings).toHaveLength(0);
      expect(result.blockedFindings).toHaveLength(0);
      expect(result.failedConditions).toHaveLength(0);
    });

    it("should block critical severity findings", () => {
      const policy = createDefaultPolicy();
      policy.blocking.severity.critical = true;
      // Disable category blocking and count threshold for this test
      policy.blocking.category.auth = false;
      policy.blocking.countThreshold!.criticalMax = 10;

      const findings = [
        createMockFinding("f1", "RULE_001", "critical", "auth", 0.9),
      ];

      const result = evaluatePolicy(findings, policy);

      expect(result.status).toBe("blocked_input");
      expect(result.blockedFindings).toHaveLength(1);
      expect(result.failedConditions).toHaveLength(1);
      expect(result.failedConditions[0].type).toBe("severity_block");
      expect(result.failedConditions[0].severity).toBe("critical");
    });

    it("should block high severity findings", () => {
      const policy = createDefaultPolicy();
      policy.blocking.severity.high = true;
      policy.blocking.severity.critical = false;

      const findings = [
        createMockFinding("f1", "RULE_001", "high", "auth", 0.9),
      ];

      const result = evaluatePolicy(findings, policy);

      expect(result.status).toBe("blocked_input");
      expect(result.blockedFindings).toHaveLength(1);
      expect(result.failedConditions[0].type).toBe("severity_block");
      expect(result.failedConditions[0].severity).toBe("high");
    });

    it("should not block low severity by default", () => {
      const policy = createDefaultPolicy();

      const findings = [
        createMockFinding("f1", "RULE_001", "low", "maintainability", 0.9),
      ];

      const result = evaluatePolicy(findings, policy);

      expect(result.status).toBe("passed");
      expect(result.passedFindings).toHaveLength(1);
      expect(result.blockedFindings).toHaveLength(0);
    });

    it("should block auth category findings", () => {
      const policy = createDefaultPolicy();
      policy.blocking.severity.critical = false;
      policy.blocking.severity.high = false;
      policy.blocking.category.auth = true;

      const findings = [
        createMockFinding("f1", "WEAK_AUTH_GUARD", "medium", "auth", 0.9),
      ];

      const result = evaluatePolicy(findings, policy);

      expect(result.status).toBe("blocked_input");
      expect(result.blockedFindings).toHaveLength(1);
      expect(result.failedConditions[0].type).toBe("category_block");
      expect(result.failedConditions[0].category).toBe("auth");
    });

    it("should block payment category findings", () => {
      const policy = createDefaultPolicy();
      policy.blocking.severity.critical = false;
      policy.blocking.severity.high = false;
      policy.blocking.category.payment = true;

      const findings = [
        createMockFinding("f1", "CLIENT_TRUSTED_PRICE", "medium", "payment", 0.9),
      ];

      const result = evaluatePolicy(findings, policy);

      expect(result.status).toBe("blocked_input");
      expect(result.blockedFindings).toHaveLength(1);
      expect(result.failedConditions[0].type).toBe("category_block");
      expect(result.failedConditions[0].category).toBe("payment");
    });

    it("should filter low confidence findings", () => {
      const policy = createDefaultPolicy();
      policy.confidence.minConfidence = 0.7;
      policy.blocking.severity.critical = false;
      policy.blocking.severity.high = false;

      const findings = [
        createMockFinding("f1", "RULE_001", "low", "maintainability", 0.5),
        createMockFinding("f2", "RULE_002", "low", "maintainability", 0.9),
      ];

      const result = evaluatePolicy(findings, policy);

      expect(result.lowConfidenceFindings).toHaveLength(1);
      expect(result.lowConfidenceFindings[0].id).toBe("f1");
      expect(result.status).toBe("needs_review");
    });

    it("should apply suppressions", () => {
      const policy = createDefaultPolicy();
      policy.blocking.severity.critical = true;

      const suppressions: SuppressionEntry[] = [
        {
          ruleId: "RULE_001",
          path: "src/test.ts",
          reason: "Known issue",
        },
      ];

      const findings = [
        createMockFinding("f1", "RULE_001", "critical", "auth", 0.9, "src/test.ts"),
      ];

      const result = evaluatePolicy(findings, policy, suppressions);

      expect(result.suppressedFindings).toHaveLength(1);
      expect(result.blockedFindings).toHaveLength(0);
      expect(result.status).toBe("passed");
    });

    it("should not suppress if expiry passed", () => {
      const policy = createDefaultPolicy();
      policy.blocking.severity.critical = true;

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);

      const suppressions: SuppressionEntry[] = [
        {
          ruleId: "RULE_001",
          path: "src/test.ts",
          reason: "Known issue",
          expiry: pastDate.toISOString().split("T")[0],
        },
      ];

      const findings = [
        createMockFinding("f1", "RULE_001", "critical", "auth", 0.9, "src/test.ts"),
      ];

      const result = evaluatePolicy(findings, policy, suppressions);

      expect(result.suppressedFindings).toHaveLength(0);
      expect(result.blockedFindings).toHaveLength(1);
      expect(result.status).toBe("blocked_input");
    });

    it("should check count thresholds", () => {
      const policy = createDefaultPolicy();
      policy.blocking.severity.critical = false;
      policy.blocking.severity.high = false;
      policy.blocking.countThreshold = {
        criticalMax: 0,
        highMax: 2,
        mediumMax: 10,
      };

      const findings = [
        createMockFinding("f1", "RULE_001", "high", "auth", 0.9),
        createMockFinding("f2", "RULE_002", "high", "auth", 0.9),
        createMockFinding("f3", "RULE_003", "high", "auth", 0.9),
      ];

      const result = evaluatePolicy(findings, policy);

      expect(result.failedConditions.some(c => c.type === "count_threshold")).toBe(true);
      expect(result.status).toBe("blocked_input");
    });

    it("should generate correct severity counts in summary", () => {
      const policy = createDefaultPolicy();
      policy.blocking.severity.critical = false;
      policy.blocking.severity.high = false;

      const findings = [
        createMockFinding("f1", "RULE_001", "critical", "auth", 0.9),
        createMockFinding("f2", "RULE_002", "high", "auth", 0.9),
        createMockFinding("f3", "RULE_003", "medium", "maintainability", 0.9),
        createMockFinding("f4", "RULE_004", "low", "testing", 0.9),
      ];

      const result = evaluatePolicy(findings, policy);

      expect(result.summary.severityCounts.critical).toBe(1);
      expect(result.summary.severityCounts.high).toBe(1);
      expect(result.summary.severityCounts.medium).toBe(1);
      expect(result.summary.severityCounts.low).toBe(1);
      expect(result.summary.totalFindings).toBe(4);
    });

    it("should return passed_with_risk when there are findings but none blocked", () => {
      const policy = createDefaultPolicy();
      policy.blocking.severity.critical = false;
      policy.blocking.severity.high = false;
      policy.blocking.severity.medium = false;
      policy.confidence.minConfidence = 0.3;

      const findings = [
        createMockFinding("f1", "RULE_001", "medium", "maintainability", 0.6),
      ];

      const result = evaluatePolicy(findings, policy);

      expect(result.status).toBe("passed");
      expect(result.passedFindings).toHaveLength(1);
    });
  });

  describe("getExitCode", () => {
    it("should return 0 for passed status", () => {
      expect(getExitCode("passed")).toBe(0);
    });

    it("should return 0 for passed_with_risk status", () => {
      expect(getExitCode("passed_with_risk")).toBe(0);
    });

    it("should return 1 for needs_review status", () => {
      expect(getExitCode("needs_review")).toBe(1);
    });

    it("should return 1 for blocked_input status", () => {
      expect(getExitCode("blocked_input")).toBe(1);
    });
  });

  describe("isBlockingStatus", () => {
    it("should return false for passed", () => {
      expect(isBlockingStatus("passed")).toBe(false);
    });

    it("should return false for passed_with_risk", () => {
      expect(isBlockingStatus("passed_with_risk")).toBe(false);
    });

    it("should return true for needs_review", () => {
      expect(isBlockingStatus("needs_review")).toBe(true);
    });

    it("should return true for blocked_input", () => {
      expect(isBlockingStatus("blocked_input")).toBe(true);
    });
  });

  describe("getStatusMessage", () => {
    it("should return appropriate message for each status", () => {
      expect(getStatusMessage("passed")).toContain("passed");
      expect(getStatusMessage("passed_with_risk")).toContain("risk");
      expect(getStatusMessage("needs_review")).toContain("review");
      expect(getStatusMessage("blocked_input")).toContain("Blocked");
    });
  });

  describe("generateEvaluationSummary", () => {
    it("should generate readable summary", () => {
      const policy = createDefaultPolicy();
      policy.blocking.severity.critical = true;

      const findings = [
        createMockFinding("f1", "RULE_001", "critical", "auth", 0.9),
        createMockFinding("f2", "RULE_002", "low", "maintainability", 0.9),
      ];

      const result = evaluatePolicy(findings, policy);
      const summary = generateEvaluationSummary(result);

      expect(summary).toContain("Status: blocked_input");
      expect(summary).toContain("Total findings: 2");
      expect(summary).toContain("Blocked: 1");
    });
  });
});