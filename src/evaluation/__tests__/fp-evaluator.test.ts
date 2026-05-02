/**
 * Tests for FP Evaluator
 *
 * Tests the False Positive evaluation system for code-to-gate.
 */

import { describe, it, expect } from "vitest";
import {
  calculateFPRate,
  classifyFindings,
  evaluateFP,
  generateSuppressionRecommendations,
  createFPEvaluationResult,
  generateFPEvaluationTemplate,
  generateFPEvaluationReport,
  validateFPEvaluationInput,
  compareFPEvaluations,
  generateFPEvidenceYAML,
  FP_RATE_TARGETS,
  type FindingReview,
  type FPEvaluationResult,
  type FPEvaluationInput,
  type SuppressionRecommendation,
} from "../fp-evaluator.js";
import type { FindingsArtifact, Finding, Severity, FindingCategory } from "../../types/artifacts.js";

// === Test Fixtures ===

const mockFindingsArtifact: FindingsArtifact = {
  version: "ctg/v1",
  generated_at: "2026-04-30T00:00:00Z",
  run_id: "test-run",
  repo: { root: "/test/repo" },
  tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
  artifact: "findings",
  schema: "findings@v1",
  completeness: "complete",
  findings: [
    {
      id: "finding-001",
      ruleId: "CLIENT_TRUSTED_PRICE",
      category: "payment",
      severity: "critical",
      confidence: 0.9,
      title: "Client supplied total is trusted",
      summary: "Test finding 1",
      evidence: [],
    },
    {
      id: "finding-002",
      ruleId: "WEAK_AUTH_GUARD",
      category: "auth",
      severity: "high",
      confidence: 0.85,
      title: "Weak authorization guard",
      summary: "Test finding 2",
      evidence: [],
    },
    {
      id: "finding-003",
      ruleId: "TRY_CATCH_SWALLOW",
      category: "maintainability",
      severity: "medium",
      confidence: 0.8,
      title: "Error swallowed",
      summary: "Test finding 3",
      evidence: [],
    },
  ],
  unsupported_claims: [],
};

const mockReviews: FindingReview[] = [
  {
    finding_id: "finding-001",
    rule_id: "CLIENT_TRUSTED_PRICE",
    classification: "TP",
    severity: "critical",
    category: "payment",
  },
  {
    finding_id: "finding-002",
    rule_id: "WEAK_AUTH_GUARD",
    classification: "FP",
    comment: "Public route, auth not required",
    severity: "high",
    category: "auth",
  },
  {
    finding_id: "finding-003",
    rule_id: "TRY_CATCH_SWALLOW",
    classification: "TP",
    severity: "medium",
    category: "maintainability",
  },
];

// === Tests ===

describe("FP_RATE_TARGETS", () => {
  it("should have correct targets for all phases", () => {
    expect(FP_RATE_TARGETS.phase1).toBe(15);
    expect(FP_RATE_TARGETS.phase2).toBe(10);
    expect(FP_RATE_TARGETS.phase3).toBe(5);
  });
});

describe("calculateFPRate", () => {
  it("should calculate FP rate correctly", () => {
    // 1 FP, 2 TP, 0 Uncertain = 1/3 = 33.33%
    const rate = calculateFPRate(mockReviews);
    expect(rate).toBeCloseTo(33.33, 1);
  });

  it("should return 0 for empty reviews", () => {
    const rate = calculateFPRate([]);
    expect(rate).toBe(0);
  });

  it("should include Uncertain in denominator", () => {
    const reviews: FindingReview[] = [
      { finding_id: "F001", rule_id: "R001", classification: "TP", severity: "high", category: "auth" },
      { finding_id: "F002", rule_id: "R002", classification: "FP", severity: "medium", category: "maintainability" },
      { finding_id: "F003", rule_id: "R003", classification: "Uncertain", severity: "low", category: "testing" },
    ];

    // 1 FP / (1 TP + 1 FP + 1 Uncertain) = 1/3 = 33.33%
    const rate = calculateFPRate(reviews);
    expect(rate).toBeCloseTo(33.33, 1);
  });

  it("should handle all-FP case", () => {
    const reviews: FindingReview[] = [
      { finding_id: "F001", rule_id: "R001", classification: "FP", severity: "high", category: "auth" },
      { finding_id: "F002", rule_id: "R002", classification: "FP", severity: "medium", category: "maintainability" },
    ];

    const rate = calculateFPRate(reviews);
    expect(rate).toBe(100);
  });

  it("should handle all-TP case", () => {
    const reviews: FindingReview[] = [
      { finding_id: "F001", rule_id: "R001", classification: "TP", severity: "high", category: "auth" },
      { finding_id: "F002", rule_id: "R002", classification: "TP", severity: "medium", category: "maintainability" },
    ];

    const rate = calculateFPRate(reviews);
    expect(rate).toBe(0);
  });
});

describe("classifyFindings", () => {
  it("should count classifications correctly", () => {
    const counts = classifyFindings(mockReviews);
    expect(counts.tp).toBe(2);
    expect(counts.fp).toBe(1);
    expect(counts.uncertain).toBe(0);
  });

  it("should handle mixed classifications", () => {
    const reviews: FindingReview[] = [
      { finding_id: "F001", rule_id: "R001", classification: "TP", severity: "high", category: "auth" },
      { finding_id: "F002", rule_id: "R002", classification: "FP", severity: "medium", category: "maintainability" },
      { finding_id: "F003", rule_id: "R003", classification: "Uncertain", severity: "low", category: "testing" },
      { finding_id: "F004", rule_id: "R004", classification: "Uncertain", severity: "low", category: "testing" },
    ];

    const counts = classifyFindings(reviews);
    expect(counts.tp).toBe(1);
    expect(counts.fp).toBe(1);
    expect(counts.uncertain).toBe(2);
  });

  it("should handle empty reviews", () => {
    const counts = classifyFindings([]);
    expect(counts.tp).toBe(0);
    expect(counts.fp).toBe(0);
    expect(counts.uncertain).toBe(0);
  });
});

describe("evaluateFP", () => {
  it("should pass when FP rate is below target", () => {
    // 10% FP rate (1 FP in 10 findings)
    const reviews: FindingReview[] = Array.from({ length: 10 }, (_, i) => ({
      finding_id: `F${i}`,
      rule_id: "R001",
      classification: i === 0 ? "FP" : "TP",
      severity: "medium" as Severity,
      category: "auth" as FindingCategory,
    }));

    const result = evaluateFP(reviews, "phase1");
    expect(result.fp_rate).toBe(10);
    expect(result.target).toBe(15);
    expect(result.pass).toBe(true);
    expect(result.conditional).toBe(false);
  });

  it("should fail when FP rate exceeds target and conditional range", () => {
    // 25% FP rate (clearly exceeds 20% No-Go threshold for Phase 1)
    const reviews: FindingReview[] = Array.from({ length: 8 }, (_, i) => ({
      finding_id: `F${i}`,
      rule_id: "R001",
      classification: i < 2 ? "TP" : "FP", // 6 FP, 2 TP = 75% FP rate
      severity: "medium" as Severity,
      category: "auth" as FindingCategory,
    }));

    const result = evaluateFP(reviews, "phase1");
    expect(result.fp_rate).toBe(75);
    expect(result.target).toBe(15);
    expect(result.pass).toBe(false);
    expect(result.conditional).toBe(false); // > 20% so no conditional
  });

  it("should allow conditional pass for Phase 1 (15-20%)", () => {
    // 16% FP rate
    const reviews: FindingReview[] = [
      { finding_id: "F00", rule_id: "R001", classification: "FP", severity: "medium", category: "auth" },
      ...Array.from({ length: 5 }, (_, i) => ({
        finding_id: `F${i + 1}`,
        rule_id: "R001",
        classification: "TP" as const,
        severity: "medium" as Severity,
        category: "auth" as FindingCategory,
      })),
    ];

    const result = evaluateFP(reviews, "phase1");
    expect(result.fp_rate).toBeCloseTo(16.67, 1);
    expect(result.pass).toBe(false);
    expect(result.conditional).toBe(true);
  });

  it("should use correct targets for each phase", () => {
    const reviews: FindingReview[] = [
      { finding_id: "F001", rule_id: "R001", classification: "FP", severity: "medium", category: "auth" },
      { finding_id: "F002", rule_id: "R001", classification: "TP", severity: "medium", category: "auth" },
    ];

    expect(evaluateFP(reviews, "phase1").target).toBe(15);
    expect(evaluateFP(reviews, "phase2").target).toBe(10);
    expect(evaluateFP(reviews, "phase3").target).toBe(5);
  });
});

describe("generateSuppressionRecommendations", () => {
  it("should generate recommendations for FP findings", () => {
    const recommendations = generateSuppressionRecommendations(mockReviews);

    expect(recommendations.length).toBe(1);
    expect(recommendations[0].rule_id).toBe("WEAK_AUTH_GUARD");
    expect(recommendations[0].finding_ids).toContain("finding-002");
  });

  it("should return empty array for no FP findings", () => {
    const tpReviews: FindingReview[] = mockReviews.map((r) => ({
      ...r,
      classification: "TP" as const,
    }));

    const recommendations = generateSuppressionRecommendations(tpReviews);
    expect(recommendations.length).toBe(0);
  });

  it("should group multiple FP findings by rule", () => {
    const reviews: FindingReview[] = [
      { finding_id: "F001", rule_id: "WEAK_AUTH_GUARD", classification: "FP", severity: "high", category: "auth" },
      { finding_id: "F002", rule_id: "WEAK_AUTH_GUARD", classification: "FP", severity: "high", category: "auth" },
      { finding_id: "F003", rule_id: "TRY_CATCH_SWALLOW", classification: "FP", severity: "medium", category: "maintainability" },
    ];

    const recommendations = generateSuppressionRecommendations(reviews);
    expect(recommendations.length).toBe(2);
    expect(recommendations.find((r) => r.rule_id === "WEAK_AUTH_GUARD")?.finding_ids.length).toBe(2);
  });
});

describe("createFPEvaluationResult", () => {
  it("should create complete evaluation result", () => {
    const input: FPEvaluationInput = {
      evaluation_id: "fp-eval-001",
      repo: "test-repo",
      evaluator: "tech-lead",
      date: "2026-04-30",
      phase: "phase1",
      findings: mockReviews.map((r) => ({
        finding_id: r.finding_id,
        rule_id: r.rule_id,
        classification: r.classification,
        comment: r.comment,
      })),
    };

    const result = createFPEvaluationResult(mockFindingsArtifact, input);

    expect(result.evaluation_id).toBe("fp-eval-001");
    expect(result.repo).toBe("test-repo");
    expect(result.evaluator).toBe("tech-lead");
    expect(result.phase).toBe("phase1");
    expect(result.findings.length).toBe(3);
    expect(result.summary.total).toBe(3);
    expect(result.summary.tp).toBe(2);
    expect(result.summary.fp).toBe(1);
    expect(result.suppression_recommendations?.length).toBe(1);
  });

  it("should set pass correctly based on FP rate", () => {
    // Create input with low FP rate (pass)
    const passInput: FPEvaluationInput = {
      evaluation_id: "fp-eval-pass",
      repo: "test-repo",
      evaluator: "tech-lead",
      date: "2026-04-30",
      phase: "phase1",
      findings: [
        { finding_id: "F001", rule_id: "R001", classification: "TP" },
        { finding_id: "F002", rule_id: "R002", classification: "TP" },
        { finding_id: "F003", rule_id: "R003", classification: "TP" },
      ],
    };

    const passResult = createFPEvaluationResult(mockFindingsArtifact, passInput);
    expect(passResult.summary.pass).toBe(true);

    // Create input with high FP rate (fail)
    const failInput: FPEvaluationInput = {
      evaluation_id: "fp-eval-fail",
      repo: "test-repo",
      evaluator: "tech-lead",
      date: "2026-04-30",
      phase: "phase3", // 5% target
      findings: [
        { finding_id: "F001", rule_id: "R001", classification: "FP" },
        { finding_id: "F002", rule_id: "R002", classification: "FP" },
        { finding_id: "F003", rule_id: "R003", classification: "TP" },
      ],
    };

    const failResult = createFPEvaluationResult(mockFindingsArtifact, failInput);
    expect(failResult.summary.pass).toBe(false); // 66.67% > 5%
  });
});

describe("generateFPEvaluationTemplate", () => {
  it("should generate valid YAML template", () => {
    const template = generateFPEvaluationTemplate(mockFindingsArtifact, "test-repo", "phase1");

    expect(template).toContain("evaluation_id:");
    expect(template).toContain("repo: test-repo");
    expect(template).toContain("phase: phase1");
    expect(template).toContain("findings:");
    expect(template).toContain("finding-001");
    expect(template).toContain("CLIENT_TRUSTED_PRICE");
    expect(template).toContain("classification:"); // Should have empty classification field
    expect(template).toContain("TP = True Positive");
    expect(template).toContain("FP = False Positive");
  });

  it("should include all findings in template", () => {
    const template = generateFPEvaluationTemplate(mockFindingsArtifact, "test-repo");

    expect(template).toContain("finding-001");
    expect(template).toContain("finding-002");
    expect(template).toContain("finding-003");
  });
});

describe("generateFPEvaluationReport", () => {
  it("should generate valid JSON report", () => {
    const input: FPEvaluationInput = {
      evaluation_id: "fp-eval-001",
      repo: "test-repo",
      evaluator: "tech-lead",
      date: "2026-04-30",
      phase: "phase1",
      findings: mockReviews.map((r) => ({
        finding_id: r.finding_id,
        rule_id: r.rule_id,
        classification: r.classification,
      })),
    };

    const result = createFPEvaluationResult(mockFindingsArtifact, input);
    const report = generateFPEvaluationReport(result);

    expect(report).toContain("evaluation_id");
    expect(report).toContain("fp-eval-001");
    expect(report).toContain("summary");

    // Should be valid JSON
    const parsed = JSON.parse(report);
    expect(parsed.evaluation_id).toBe("fp-eval-001");
  });
});

describe("validateFPEvaluationInput", () => {
  it("should validate correct input", () => {
    const validInput = {
      evaluation_id: "fp-eval-001",
      repo: "test-repo",
      evaluator: "tech-lead",
      date: "2026-04-30",
      phase: "phase1",
      findings: [
        { finding_id: "F001", rule_id: "R001", classification: "TP" },
      ],
    };

    const result = validateFPEvaluationInput(validInput);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("should reject missing required fields", () => {
    const invalidInput = {
      evaluation_id: "fp-eval-001",
      // missing repo, evaluator, date, phase
      findings: [],
    };

    const result = validateFPEvaluationInput(invalidInput);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("repo is required and must be a string");
    expect(result.errors).toContain("evaluator is required and must be a string");
    expect(result.errors).toContain("date is required and must be a string");
  });

  it("should reject invalid phase", () => {
    const invalidInput = {
      evaluation_id: "fp-eval-001",
      repo: "test-repo",
      evaluator: "tech-lead",
      date: "2026-04-30",
      phase: "phase4", // invalid
      findings: [],
    };

    const result = validateFPEvaluationInput(invalidInput);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("phase"))).toBe(true);
  });

  it("should reject invalid classification", () => {
    const invalidInput = {
      evaluation_id: "fp-eval-001",
      repo: "test-repo",
      evaluator: "tech-lead",
      date: "2026-04-30",
      phase: "phase1",
      findings: [
        { finding_id: "F001", rule_id: "R001", classification: "INVALID" },
      ],
    };

    const result = validateFPEvaluationInput(invalidInput);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("classification"))).toBe(true);
  });

  it("should reject non-object input", () => {
    const result = validateFPEvaluationInput(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Input must be an object");
  });
});

describe("compareFPEvaluations", () => {
  it("should calculate comparison statistics", () => {
    const results: FPEvaluationResult[] = [
      {
        evaluation_id: "eval-1",
        repo: "repo-1",
        evaluator: "evaluator",
        date: "2026-04-30",
        phase: "phase1",
        findings: [],
        summary: { total: 10, tp: 8, fp: 2, uncertain: 0, fp_rate: 20, target: 15, pass: false },
      },
      {
        evaluation_id: "eval-2",
        repo: "repo-2",
        evaluator: "evaluator",
        date: "2026-04-30",
        phase: "phase1",
        findings: [],
        summary: { total: 10, tp: 9, fp: 1, uncertain: 0, fp_rate: 10, target: 15, pass: true },
      },
      {
        evaluation_id: "eval-3",
        repo: "repo-3",
        evaluator: "evaluator",
        date: "2026-04-30",
        phase: "phase1",
        findings: [],
        summary: { total: 10, tp: 9, fp: 1, uncertain: 0, fp_rate: 10, target: 15, pass: true },
      },
    ];

    const comparison = compareFPEvaluations(results);
    expect(comparison.average_fp_rate).toBeCloseTo(13.33, 1);
    expect(comparison.worst_fp_rate).toBe(20);
    expect(comparison.best_fp_rate).toBe(10);
    expect(comparison.all_pass).toBe(false);
    expect(comparison.any_conditional).toBe(true);
  });
});

describe("generateFPEvidenceYAML", () => {
  it("should generate valid evidence YAML", () => {
    const result: FPEvaluationResult = {
      evaluation_id: "fp-eval-001",
      repo: "test-repo",
      evaluator: "tech-lead",
      date: "2026-04-30",
      phase: "phase1",
      findings: mockReviews,
      summary: {
        total: 3,
        tp: 2,
        fp: 1,
        uncertain: 0,
        fp_rate: 33.33,
        target: 15,
        pass: false,
      },
      suppression_recommendations: [
        {
          rule_id: "WEAK_AUTH_GUARD",
          path_pattern: "**",
          reason: "Human verified",
          expiry: "2026-08-01",
          finding_ids: ["finding-002"],
        },
      ],
    };

    const yaml = generateFPEvidenceYAML(result);

    expect(yaml).toContain("fp_evaluation:");
    expect(yaml).toContain("repo: test-repo");
    expect(yaml).toContain("findings_count: 3");
    expect(yaml).toContain("tp_count: 2");
    expect(yaml).toContain("fp_count: 1");
    expect(yaml).toContain("fp_rate: 33.33%");
    expect(yaml).toContain("result: fail");
    expect(yaml).toContain("suppression_recommendations:");
    expect(yaml).toContain("WEAK_AUTH_GUARD");
  });
});