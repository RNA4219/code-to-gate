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
  generateBlockingSummary,
} from "../policy-evaluator.js";
import {
  createDefaultPolicy,
  type CtgPolicy,
  type SuppressionEntry,
} from "../policy-loader.js";
import { createMockFinding as createMockFindingBase } from "../../test-utils/index.js";

// Wrapper for policy evaluator tests with specific signature
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

    it("does not apply a count threshold to a non-blocking severity", () => {
      const policy = createDefaultPolicy();
      policy.blocking.severity.medium = false;
      policy.blocking.category.maintainability = false;
      policy.blocking.countThreshold = { mediumMax: 20 };
      const findings = Array.from({ length: 21 }, (_, index) =>
        createMockFinding(`f${index}`, "LARGE_MODULE", "medium", "maintainability", 0.9)
      );

      const result = evaluatePolicy(findings, policy);

      expect(result.failedConditions.some(condition => condition.type === "count_threshold")).toBe(false);
      expect(result.status).toBe("passed");
    });

    it.each([
      ["medium", "mediumMax"],
      ["low", "lowMax"],
    ] as const)("applies the configured %s count threshold when that severity blocks", (severity, thresholdKey) => {
      const policy = createDefaultPolicy();
      policy.blocking.severity = {
        critical: false,
        high: false,
        medium: false,
        low: false,
      };
      policy.blocking.severity[severity] = true;
      policy.blocking.countThreshold = { [thresholdKey]: 0 };
      const finding = createMockFinding("threshold-finding", "RULE_001", severity, "maintainability", 0.9);

      const result = evaluatePolicy([finding], policy);

      expect(result.failedConditions).toContainEqual(expect.objectContaining({
        type: "count_threshold",
        severity,
        count: 1,
        threshold: 0,
      }));
    });

    it("excludes baseline-carried findings from count thresholds", () => {
      const policy = createDefaultPolicy();
      policy.blocking.severity.high = undefined;
      policy.blocking.category.auth = false;
      policy.blocking.countThreshold = { highMax: 0 };
      const findings = [
        createMockFinding("known-high", "RULE_001", "high", "auth", 0.9),
      ];

      const result = evaluatePolicy(findings, policy, [], {
        baselineNewOrWorsenedFindingIds: [],
      });

      expect(result.failedConditions.some(condition => condition.type === "count_threshold")).toBe(false);
      expect(result.status).toBe("passed");
    });

    it("keeps count thresholds on all findings when baseline blocking is disabled", () => {
      const policy = createDefaultPolicy();
      policy.blocking.severity.high = true;
      policy.blocking.category.auth = false;
      policy.blocking.countThreshold = { highMax: 0 };
      policy.baseline = { enabled: true, newFindingsBlock: false };
      const finding = createMockFinding("known-high", "RULE_001", "high", "auth", 0.9);

      const result = evaluatePolicy([finding], policy, [], {
        baselineNewOrWorsenedFindingIds: [],
      });

      expect(result.failedConditions).toContainEqual(expect.objectContaining({
        type: "count_threshold",
        severity: "high",
        count: 1,
      }));
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

    it("blocks findings with Policy DSL block action", () => {
      const policy = createDefaultPolicy();
      policy.blocking.severity.critical = false;
      policy.blocking.severity.high = false;
      policy.blocking.category.auth = false;
      policy.blocking.category.security = false;
      policy.blocking.countThreshold = { criticalMax: 10, highMax: 10, mediumMax: 10 };
      policy.dsl = {
        rules: [
          {
            id: "critical-always-block",
            when: { severity: "critical" },
            action: "block",
            reason: "Critical findings always block.",
          },
        ],
      };

      const result = evaluatePolicy([
        createMockFinding("f1", "RULE_001", "critical", "auth", 0.9),
      ], policy);

      expect(result.status).toBe("blocked_input");
      expect(result.blockedFindings).toHaveLength(1);
      expect(result.failedConditions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "dsl_block", dslRuleId: "critical-always-block" }),
        ])
      );
    });

    it("holds findings with manual evidence via Policy DSL", () => {
      const policy = createDefaultPolicy();
      policy.blocking.severity.critical = false;
      policy.blocking.severity.high = false;
      policy.blocking.category.maintainability = false;
      policy.dsl = {
        rules: [
          {
            id: "manual-evidence-hold",
            when: { manualEvidence: "present" },
            action: "hold",
          },
        ],
      };

      const result = evaluatePolicy([
        createMockFinding("f1", "RULE_001", "medium", "maintainability", 0.9),
      ], policy, [], { manualEvidenceFindingIds: ["f1"] });

      expect(result.status).toBe("needs_review");
      expect(result.heldFindings).toHaveLength(1);
      expect(result.failedConditions[0]).toMatchObject({
        type: "dsl_hold",
        dslRuleId: "manual-evidence-hold",
      });
    });

    it("matches baseline new_or_worsened findings with Policy DSL", () => {
      const policy = createDefaultPolicy();
      policy.blocking.severity.critical = false;
      policy.blocking.severity.high = false;
      policy.blocking.category.security = false;
      policy.dsl = {
        rules: [
          {
            id: "new-or-worsened-security",
            when: { baseline: "new_or_worsened", category: "security" },
            action: "block",
          },
        ],
      };

      const result = evaluatePolicy([
        createMockFinding("f1", "RULE_001", "medium", "security", 0.9),
      ], policy, [], { baselineNewOrWorsenedFindingIds: ["f1"] });

      expect(result.status).toBe("blocked_input");
      expect(result.failedConditions[0]).toMatchObject({
        type: "dsl_block",
        dslRuleId: "new-or-worsened-security",
      });
    });

    it("allows findings before later Policy DSL block rules", () => {
      const policy = createDefaultPolicy();
      policy.blocking.severity.critical = false;
      policy.blocking.severity.high = false;
      policy.blocking.category.maintainability = false;
      policy.dsl = {
        rules: [
          {
            id: "allow-large-module",
            when: { ruleId: "LARGE_MODULE" },
            action: "allow",
          },
          {
            id: "medium-hold",
            when: { severity: "medium" },
            action: "hold",
          },
        ],
      };

      const result = evaluatePolicy([
        createMockFinding("f1", "LARGE_MODULE", "medium", "maintainability", 0.9),
      ], policy);

      expect(result.status).toBe("passed");
      expect(result.failedConditions).toHaveLength(0);
      expect(result.passedFindings).toHaveLength(1);
    });
    it("blocks partial input when allowPartial is false", () => {
      const policy = createDefaultPolicy();
      policy.partial = { allowPartial: false };

      const result = evaluatePolicy([], policy, [], {
        completeness: "partial",
        incompleteReasons: ["IMPORT_PARTIAL:semgrep"],
      });

      expect(result.status).toBe("blocked_input");
      expect(result.failedConditions).toContainEqual(expect.objectContaining({
        type: "incomplete_input",
      }));
    });

    it("never reports plain passed for partial input even when allowed", () => {
      const policy = createDefaultPolicy();
      policy.partial = { allowPartial: true };

      const result = evaluatePolicy([], policy, [], {
        completeness: "partial",
        incompleteReasons: ["LEGACY_IMPORT_MANIFEST_MISSING:eslint"],
      });

      expect(result.status).toBe("passed_with_risk");
      expect(result.failedConditions[0].message).toContain("LEGACY_IMPORT_MANIFEST_MISSING:eslint");
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
      expect(getStatusMessage("blocked_input")).toContain("incomplete");
    });
  });

  describe("generateBlockingSummary", () => {
    it("explains incomplete input when no findings are blocked", () => {
      const summary = generateBlockingSummary([
        { type: "incomplete_input", message: "Input evidence is partial: scan limit" },
      ], []);

      expect(summary).toBe("Blocked: input evidence is partial");
      expect(summary).not.toContain("Blocked by 0 findings");
    });

    it("keeps incomplete input and high finding reasons together", () => {
      const finding = createMockFinding("f1", "RULE_001", "high", "auth", 0.9);
      const summary = generateBlockingSummary([
        { type: "severity_block", severity: "high", message: "high is blocked" },
        { type: "incomplete_input", message: "Input evidence is partial" },
      ], [finding]);

      expect(summary).toContain("high severity findings");
      expect(summary).toContain("input evidence is partial");
    });

    it("preserves the no-blocking summary for complete input", () => {
      expect(generateBlockingSummary([], [])).toBe("No blocking conditions");
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
