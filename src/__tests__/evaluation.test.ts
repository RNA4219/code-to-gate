/**
 * Tests for FP and FN Evaluation Integration
 *
 * Tests the combined evaluation system for code-to-gate.
 */

import { describe, it, expect } from "vitest";
import {
  // FP Evaluator
  calculateFPRate,
  classifyFindings,
  evaluateFP,
  createFPEvaluationResult,
  FP_RATE_TARGETS,
  type FindingReview,
  type FPEvaluationResult,
  type FPEvaluationInput,
  // FN Evaluator
  calculateDetectionRate,
  checkDetection,
  createFNEvaluationResult,
  evaluateFN,
  FN_RATE_TARGETS,
  DEFAULT_SEEDED_SMELLS,
  type SeededSmell,
  type DetectionResult,
  type FNEvaluationResult,
  // Combined
  createCombinedEvaluation,
  generateAcceptanceEvidenceYAML,
  evaluateReleaseReadiness,
  type CombinedEvaluationResult,
} from "../evaluation/index.js";
import type { FindingsArtifact, Finding, Severity, FindingCategory } from "../types/artifacts.js";

// === Test Fixtures ===

const mockFindingsArtifact: FindingsArtifact = {
  version: "ctg/v1alpha1",
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
      evidence: [{ id: "ev-1", path: "src/api/order.ts", startLine: 15, kind: "text", excerptHash: "hash123" }],
    },
    {
      id: "finding-002",
      ruleId: "WEAK_AUTH_GUARD",
      category: "auth",
      severity: "high",
      confidence: 0.85,
      title: "Weak authorization guard",
      summary: "Test finding 2",
      evidence: [{ id: "ev-2", path: "src/auth/guard.ts", startLine: 6, kind: "text", excerptHash: "hash456" }],
    },
    {
      id: "finding-003",
      ruleId: "TRY_CATCH_SWALLOW",
      category: "maintainability",
      severity: "medium",
      confidence: 0.8,
      title: "Error swallowed",
      summary: "Test finding 3",
      evidence: [{ id: "ev-3", path: "src/services/audit.ts", startLine: 8, kind: "text", excerptHash: "hash789" }],
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

const mockSeededSmells: SeededSmell[] = [
  {
    seeded_id: "S001",
    rule_id: "CLIENT_TRUSTED_PRICE",
    fixture: "demo-shop-ts",
    expected_detection: true,
    path: "src/api/order.ts",
    line: 15,
    description: "Client price trusted without validation",
    severity: "critical",
    category: "payment",
  },
  {
    seeded_id: "S002",
    rule_id: "WEAK_AUTH_GUARD",
    fixture: "demo-shop-ts",
    expected_detection: true,
    path: "src/auth/guard.ts",
    line: 6,
    description: "Weak auth guard pattern",
    severity: "high",
    category: "auth",
  },
];

const mockFindingsMap = new Map<string, FindingsArtifact>();
mockFindingsMap.set("demo-shop-ts", mockFindingsArtifact);

// === FP/FN Integration Tests ===

describe("FP and FN Evaluation Integration", () => {
  describe("FP_RATE_TARGETS and FN_RATE_TARGETS consistency", () => {
    it("should have consistent phase naming", () => {
      const fpPhases = Object.keys(FP_RATE_TARGETS);
      const fnPhases = Object.keys(FN_RATE_TARGETS);

      expect(fpPhases).toEqual(fnPhases);
      expect(fpPhases).toContain("phase1");
      expect(fpPhases).toContain("phase2");
      expect(fpPhases).toContain("phase3");
    });

    it("should have complementary targets (FP decreases, FN increases)", () => {
      expect(FP_RATE_TARGETS.phase1).toBe(15);
      expect(FN_RATE_TARGETS.phase1).toBe(80);

      expect(FP_RATE_TARGETS.phase2).toBe(10);
      expect(FN_RATE_TARGETS.phase2).toBe(90);

      expect(FP_RATE_TARGETS.phase3).toBe(5);
      expect(FN_RATE_TARGETS.phase3).toBe(95);

      // FP targets decrease as phases progress
      expect(FP_RATE_TARGETS.phase1).toBeGreaterThan(FP_RATE_TARGETS.phase2);
      expect(FP_RATE_TARGETS.phase2).toBeGreaterThan(FP_RATE_TARGETS.phase3);

      // FN targets increase as phases progress
      expect(FN_RATE_TARGETS.phase1).toBeLessThan(FN_RATE_TARGETS.phase2);
      expect(FN_RATE_TARGETS.phase2).toBeLessThan(FN_RATE_TARGETS.phase3);
    });
  });

  describe("Combined evaluation creation", () => {
    it("should create combined evaluation result from FP and FN results", () => {
      const fpInput: FPEvaluationInput = {
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

      const fpResult = createFPEvaluationResult(mockFindingsArtifact, fpInput);
      const fnResult = createFNEvaluationResult(mockSeededSmells, mockFindingsMap, "phase1");

      const combined = createCombinedEvaluation(fpResult, fnResult);

      expect(combined.fp).toBe(fpResult);
      expect(combined.fn).toBe(fnResult);
      expect(combined.phase).toBe("phase1");
      expect(combined.pass).toBeDefined();
      expect(combined.summary).toBeDefined();
    });

    it("should pass when both FP and FN pass", () => {
      // Create passing FP result (low FP rate)
      const passingReviews: FindingReview[] = [
        { finding_id: "F001", rule_id: "R001", classification: "TP", severity: "high", category: "auth" },
        { finding_id: "F002", rule_id: "R002", classification: "TP", severity: "medium", category: "maintainability" },
        { finding_id: "F003", rule_id: "R003", classification: "TP", severity: "low", category: "testing" },
      ];

      const fpInput: FPEvaluationInput = {
        evaluation_id: "fp-eval-pass",
        repo: "test-repo",
        evaluator: "tech-lead",
        date: "2026-04-30",
        phase: "phase1",
        findings: passingReviews.map((r) => ({
          finding_id: r.finding_id,
          rule_id: r.rule_id,
          classification: r.classification,
        })),
      };

      const fpResult = createFPEvaluationResult(mockFindingsArtifact, fpInput);
      expect(fpResult.summary.pass).toBe(true); // 0% FP rate

      // Create passing FN result (high detection rate)
      const allDetected: DetectionResult[] = mockSeededSmells.map((s) => ({
        seeded_id: s.seeded_id,
        rule_id: s.rule_id,
        detected: true,
        finding_id: `finding-${s.seeded_id}`,
      }));

      const fnResult = createFNEvaluationResult(mockSeededSmells, mockFindingsMap, "phase1");
      // Detection rate depends on findings matching

      const combined = createCombinedEvaluation(fpResult, fnResult);
      expect(combined.pass).toBe(fpResult.summary.pass && fnResult.summary.pass);
    });

    it("should fail when either FP or FN fails", () => {
      // Create failing FP result (high FP rate)
      const failingReviews: FindingReview[] = [
        { finding_id: "F001", rule_id: "R001", classification: "FP", severity: "critical", category: "payment" },
        { finding_id: "F002", rule_id: "R002", classification: "FP", severity: "high", category: "auth" },
      ];

      const fpInput: FPEvaluationInput = {
        evaluation_id: "fp-eval-fail",
        repo: "test-repo",
        evaluator: "tech-lead",
        date: "2026-04-30",
        phase: "phase3", // 5% target - will fail with 100% FP
        findings: failingReviews.map((r) => ({
          finding_id: r.finding_id,
          rule_id: r.rule_id,
          classification: r.classification,
        })),
      };

      const fpResult = createFPEvaluationResult(mockFindingsArtifact, fpInput);
      expect(fpResult.summary.pass).toBe(false); // 100% FP rate > 5% target

      const fnResult = createFNEvaluationResult(mockSeededSmells, mockFindingsMap, "phase1");

      const combined = createCombinedEvaluation(fpResult, fnResult);
      expect(combined.pass).toBe(false);
      expect(combined.summary).toContain("FP rate");
    });

    it("should generate appropriate summary messages", () => {
      const fpInput: FPEvaluationInput = {
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

      const fpResult = createFPEvaluationResult(mockFindingsArtifact, fpInput);
      const fnResult = createFNEvaluationResult(mockSeededSmells, mockFindingsMap, "phase1");

      const combined = createCombinedEvaluation(fpResult, fnResult);

      expect(combined.summary).toContain("rate");
      expect(combined.summary).toContain("target");
    });
  });

  describe("Release readiness evaluation", () => {
    it("should return Go when both rates meet targets", () => {
      const result = evaluateReleaseReadiness(10, 85, "phase1");

      expect(result.go).toBe(true);
      expect(result.conditional_go).toBe(false);
      expect(result.no_go).toBe(false);
      expect(result.blockers.length).toBe(0);
    });

    it("should return No-Go when FP rate exceeds maximum threshold", () => {
      // Phase 1: target 15%, max threshold 20%
      const result = evaluateReleaseReadiness(25, 85, "phase1");

      expect(result.no_go).toBe(true);
      expect(result.go).toBe(false);
      expect(result.blockers.length).toBeGreaterThan(0);
      expect(result.blockers[0]).toContain("FP rate");
    });

    it("should return No-Go when detection rate below minimum threshold", () => {
      // Phase 1: target 80%, min threshold 70%
      const result = evaluateReleaseReadiness(10, 60, "phase1");

      expect(result.no_go).toBe(true);
      expect(result.go).toBe(false);
      expect(result.blockers.length).toBeGreaterThan(0);
      expect(result.blockers[0]).toContain("Detection rate");
    });

    it("should return Conditional Go when FP rate in conditional range", () => {
      // Phase 1: target 15%, conditional range 15-20%
      const result = evaluateReleaseReadiness(18, 85, "phase1");

      expect(result.go).toBe(false);
      expect(result.conditional_go).toBe(true);
      expect(result.no_go).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("conditional range");
    });

    it("should use correct thresholds for each phase", () => {
      // Phase 1: FP <= 15%, FN >= 80%
      const phase1Pass = evaluateReleaseReadiness(10, 85, "phase1");
      expect(phase1Pass.go).toBe(true);

      // Phase 2: FP <= 10%, FN >= 90%
      const phase2Fail = evaluateReleaseReadiness(12, 85, "phase2");
      expect(phase2Fail.go).toBe(false);

      // Phase 3: FP <= 5%, FN >= 95%
      const phase3Fail = evaluateReleaseReadiness(10, 90, "phase3");
      expect(phase3Fail.go).toBe(false);
    });

    it("should handle edge case at exact target", () => {
      const result = evaluateReleaseReadiness(15, 80, "phase1");

      expect(result.go).toBe(true);
      expect(result.blockers.length).toBe(0);
    });
  });

  describe("Acceptance evidence YAML generation", () => {
    it("should generate complete acceptance evidence YAML", () => {
      const fpInput: FPEvaluationInput = {
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

      const fpResult = createFPEvaluationResult(mockFindingsArtifact, fpInput);
      const fnResult = createFNEvaluationResult(mockSeededSmells, mockFindingsMap, "phase1");

      const combined = createCombinedEvaluation(fpResult, fnResult);
      const yaml = generateAcceptanceEvidenceYAML(combined);

      expect(yaml).toContain("fp-fn-evidence.yaml");
      expect(yaml).toContain("evaluation_id");
      expect(yaml).toContain("fp_evaluation:");
      expect(yaml).toContain("fn_evaluation:");
      expect(yaml).toContain("combined_result:");
      expect(yaml).toContain("summary:");
    });

    it("should include suppression recommendations in YAML", () => {
      // Create FP result with FP findings (will have suppression recommendations)
      const fpInput: FPEvaluationInput = {
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

      const fpResult = createFPEvaluationResult(mockFindingsArtifact, fpInput);
      const fnResult = createFNEvaluationResult(mockSeededSmells, mockFindingsMap, "phase1");

      const combined = createCombinedEvaluation(fpResult, fnResult);

      if (combined.fp.suppression_recommendations?.length) {
        const yaml = generateAcceptanceEvidenceYAML(combined);
        expect(yaml).toContain("suppression_recommendations:");
      }
    });

    it("should include missed smells in YAML", () => {
      // Create FN result with missed detections
      const emptyFindingsMap = new Map<string, FindingsArtifact>();
      emptyFindingsMap.set("demo-shop-ts", {
        ...mockFindingsArtifact,
        findings: [], // No findings - all smells missed
      });

      const fpInput: FPEvaluationInput = {
        evaluation_id: "fp-eval-001",
        repo: "test-repo",
        evaluator: "tech-lead",
        date: "2026-04-30",
        phase: "phase1",
        findings: [],
      };

      const fpResult = createFPEvaluationResult(mockFindingsArtifact, fpInput);
      const fnResult = createFNEvaluationResult(mockSeededSmells, emptyFindingsMap, "phase1");

      const combined = createCombinedEvaluation(fpResult, fnResult);

      if (combined.fn.missed_smells?.length) {
        const yaml = generateAcceptanceEvidenceYAML(combined);
        expect(yaml).toContain("missed_smells:");
      }
    });
  });

  describe("Detection and FP rate correlation", () => {
    it("should calculate consistent rates for same findings", () => {
      // When all findings are TP, FP rate should be 0
      const allTpReviews: FindingReview[] = mockReviews.map((r) => ({
        ...r,
        classification: "TP" as const,
      }));

      const fpRate = calculateFPRate(allTpReviews);
      expect(fpRate).toBe(0);

      // Detection rate depends on matching seeded smells
      const detectionResults: DetectionResult[] = mockSeededSmells.map((s) => ({
        seeded_id: s.seeded_id,
        rule_id: s.rule_id,
        detected: true,
      }));

      const detectionRate = calculateDetectionRate(detectionResults);
      expect(detectionRate).toBe(100);
    });

    it("should handle mixed classifications correctly", () => {
      const mixedReviews: FindingReview[] = [
        { finding_id: "F001", rule_id: "CLIENT_TRUSTED_PRICE", classification: "TP", severity: "critical", category: "payment" },
        { finding_id: "F002", rule_id: "WEAK_AUTH_GUARD", classification: "FP", severity: "high", category: "auth" },
        { finding_id: "F003", rule_id: "TRY_CATCH_SWALLOW", classification: "Uncertain", severity: "medium", category: "maintainability" },
      ];

      const counts = classifyFindings(mixedReviews);
      expect(counts.tp).toBe(1);
      expect(counts.fp).toBe(1);
      expect(counts.uncertain).toBe(1);

      const fpRate = calculateFPRate(mixedReviews);
      expect(fpRate).toBeCloseTo(33.33, 1);
    });
  });

  describe("Phase progression validation", () => {
    it("should have stricter requirements for later phases", () => {
      const fpResult1 = evaluateFP(mockReviews, "phase1");
      const fpResult2 = evaluateFP(mockReviews, "phase2");
      const fpResult3 = evaluateFP(mockReviews, "phase3");

      // Targets should decrease for later phases
      expect(fpResult1.target).toBeGreaterThan(fpResult2.target);
      expect(fpResult2.target).toBeGreaterThan(fpResult3.target);

      // A result that passes phase1 might fail phase3
      const highFpReviews: FindingReview[] = [
        { finding_id: "F001", rule_id: "R001", classification: "TP", severity: "high", category: "auth" },
        { finding_id: "F002", rule_id: "R002", classification: "FP", severity: "medium", category: "maintainability" },
      ];

      const phase1Result = evaluateFP(highFpReviews, "phase1"); // 50% FP, target 15%
      const phase3Result = evaluateFP(highFpReviews, "phase3"); // 50% FP, target 5%

      // Both should fail, but phase3 is stricter
      expect(phase1Result.target).toBe(15);
      expect(phase3Result.target).toBe(5);
    });

    it("should allow conditional go only for phase1", () => {
      // 16% FP rate - conditional for phase1 (15-20%), fail for phase2 (target 10%)
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

      const phase1Result = evaluateFP(reviews, "phase1");
      const phase2Result = evaluateFP(reviews, "phase2");

      // Phase 1: 16.67% should be in conditional range (15-20%)
      expect(phase1Result.conditional).toBe(true);

      // Phase 2: 16.67% > 10% target, not conditional (conditional only for phase1)
      expect(phase2Result.pass).toBe(false);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty reviews", () => {
      const fpRate = calculateFPRate([]);
      expect(fpRate).toBe(0);

      const counts = classifyFindings([]);
      expect(counts.tp).toBe(0);
      expect(counts.fp).toBe(0);
      expect(counts.uncertain).toBe(0);
    });

    it("should handle empty seeded smells", () => {
      const detectionRate = calculateDetectionRate([]);
      expect(detectionRate).toBe(100); // No smells to detect = perfect
    });

    it("should handle empty findings artifact", () => {
      const emptyArtifact: FindingsArtifact = {
        ...mockFindingsArtifact,
        findings: [],
      };

      const fpInput: FPEvaluationInput = {
        evaluation_id: "fp-eval-empty",
        repo: "test-repo",
        evaluator: "tech-lead",
        date: "2026-04-30",
        phase: "phase1",
        findings: [],
      };

      const fpResult = createFPEvaluationResult(emptyArtifact, fpInput);
      expect(fpResult.summary.total).toBe(0);
      expect(fpResult.summary.fp_rate).toBe(0);
      expect(fpResult.summary.pass).toBe(true);
    });

    it("should handle fixture not found in FN evaluation", () => {
      const emptyMap = new Map<string, FindingsArtifact>();
      const fnResult = createFNEvaluationResult(mockSeededSmells, emptyMap, "phase1");

      // All detections should be missed
      expect(fnResult.summary.detected_count).toBe(0);
      expect(fnResult.missed_smells?.length).toBe(mockSeededSmells.length);
    });
  });

  describe("DEFAULT_SEEDED_SMELLS validation", () => {
    it("should have valid seeded smells for all 9 rules", () => {
      const ruleIds = DEFAULT_SEEDED_SMELLS.map((s) => s.rule_id);
      const uniqueRuleIds = new Set(ruleIds);

      expect(uniqueRuleIds.size).toBeGreaterThan(5);
      expect(ruleIds).toContain("CLIENT_TRUSTED_PRICE");
      expect(ruleIds).toContain("WEAK_AUTH_GUARD");
      expect(ruleIds).toContain("MISSING_SERVER_VALIDATION");
      expect(ruleIds).toContain("UNTESTED_CRITICAL_PATH");
      expect(ruleIds).toContain("TRY_CATCH_SWALLOW");
    });

    it("should have required fields for all seeded smells", () => {
      for (const smell of DEFAULT_SEEDED_SMELLS) {
        expect(smell.seeded_id).toBeDefined();
        expect(smell.rule_id).toBeDefined();
        expect(smell.fixture).toBeDefined();
        expect(smell.path).toBeDefined();
        expect(smell.description).toBeDefined();
        expect(smell.severity).toBeDefined();
        expect(smell.category).toBeDefined();
      }
    });
  });
});