/**
 * Tests for fn-evaluator.ts - False Negative Evaluation System
 */

import { describe, it, expect } from "vitest";
import {
  calculateDetectionRate,
  checkDetection,
  evaluateDetection,
  createFNEvaluationResult,
  evaluateFN,
  generateFNEvidenceYAML,
  validateSeededSmells,
  getSeededSmellsByFixture,
  getSeededSmellsByRule,
  compareFNEvaluations,
  FN_RATE_TARGETS,
  DEFAULT_SEEDED_SMELLS,
  type SeededSmell,
  type DetectionResult,
  type FNEvaluationResult,
} from "../fn-evaluator.js";
import type { Finding, FindingsArtifact } from "../../types/artifacts.js";

describe("fn-evaluator", () => {
  describe("calculateDetectionRate", () => {
    it("returns 100 for empty results", () => {
      const rate = calculateDetectionRate([]);
      expect(rate).toBe(100);
    });

    it("calculates correct rate for partial detection", () => {
      const results: DetectionResult[] = [
        { seeded_id: "S001", rule_id: "TEST", detected: true },
        { seeded_id: "S002", rule_id: "TEST", detected: false },
        { seeded_id: "S003", rule_id: "TEST", detected: true },
      ];
      const rate = calculateDetectionRate(results);
      expect(rate).toBe(66.67);
    });

    it("returns 100 for full detection", () => {
      const results: DetectionResult[] = [
        { seeded_id: "S001", rule_id: "TEST", detected: true },
        { seeded_id: "S002", rule_id: "TEST", detected: true },
      ];
      const rate = calculateDetectionRate(results);
      expect(rate).toBe(100);
    });

    it("returns 0 for no detection", () => {
      const results: DetectionResult[] = [
        { seeded_id: "S001", rule_id: "TEST", detected: false, missed_reason: "test" },
        { seeded_id: "S002", rule_id: "TEST", detected: false, missed_reason: "test" },
      ];
      const rate = calculateDetectionRate(results);
      expect(rate).toBe(0);
    });
  });

  describe("checkDetection", () => {
    const seeded: SeededSmell = {
      seeded_id: "S001",
      rule_id: "CLIENT_TRUSTED_PRICE",
      fixture: "demo-shop-ts",
      expected_detection: true,
      path: "src/api/order/create.ts",
      line: 15,
      description: "Test smell",
      severity: "critical",
      category: "payment",
    };

    it("detects matching finding", () => {
      const findings: Finding[] = [
        {
          id: "finding-001",
          ruleId: "CLIENT_TRUSTED_PRICE",
          category: "payment",
          severity: "critical",
          confidence: 0.9,
          title: "Test finding",
          summary: "Test",
          evidence: [{ id: "ev-001", path: "src/api/order/create.ts", startLine: 15, endLine: 15, kind: "text" }],
          tags: [],
          upstream: { tool: "native" },
        },
      ];

      const result = checkDetection(seeded, findings);
      expect(result.detected).toBe(true);
      expect(result.finding_id).toBe("finding-001");
    });

    it("returns false for no matching finding", () => {
      const findings: Finding[] = [];
      const result = checkDetection(seeded, findings);
      expect(result.detected).toBe(false);
      expect(result.missed_reason).toBeDefined();
    });

    it("matches partial path", () => {
      const findings: Finding[] = [
        {
          id: "finding-002",
          ruleId: "CLIENT_TRUSTED_PRICE",
          category: "payment",
          severity: "critical",
          confidence: 0.9,
          title: "Test",
          summary: "Test",
          evidence: [{ id: "ev-002", path: "create.ts", startLine: 1, endLine: 1, kind: "text" }],
          tags: [],
          upstream: { tool: "native" },
        },
      ];

      const result = checkDetection(seeded, findings);
      expect(result.detected).toBe(true);
    });
  });

  describe("evaluateDetection", () => {
    it("returns detection results for all seeded smells", () => {
      const seeded: SeededSmell[] = [
        {
          seeded_id: "S001",
          rule_id: "TEST_RULE",
          fixture: "fixture-a",
          expected_detection: true,
          path: "file.ts",
          description: "Test",
          severity: "high",
          category: "security",
        },
      ];

      const artifacts = new Map<string, FindingsArtifact>();
      artifacts.set("fixture-a", {
        version: "ctg/v1",
        generated_at: "2026-05-02T00:00:00Z",
        run_id: "test",
        repo: { root: "." },
        tool: { name: "code-to-gate", version: "1.0.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [],
        unsupported_claims: [],
      });

      const results = evaluateDetection(seeded, artifacts);
      expect(results.length).toBe(1);
      expect(results[0].detected).toBe(false);
    });

    it("returns error for missing fixture", () => {
      const seeded: SeededSmell[] = [
        {
          seeded_id: "S001",
          rule_id: "TEST",
          fixture: "missing-fixture",
          expected_detection: true,
          path: "file.ts",
          description: "Test",
          severity: "high",
          category: "security",
        },
      ];

      const artifacts = new Map<string, FindingsArtifact>();
      const results = evaluateDetection(seeded, artifacts);
      expect(results[0].missed_reason).toContain("not found");
    });
  });

  describe("createFNEvaluationResult", () => {
    it("creates valid evaluation result", () => {
      const seeded: SeededSmell[] = [
        {
          seeded_id: "S001",
          rule_id: "TEST",
          fixture: "fixture-a",
          expected_detection: true,
          path: "file.ts",
          description: "Test",
          severity: "high",
          category: "security",
        },
        {
          seeded_id: "S002",
          rule_id: "TEST",
          fixture: "fixture-a",
          expected_detection: true,
          path: "file2.ts",
          description: "Test",
          severity: "medium",
          category: "maintainability",
        },
      ];

      const artifacts = new Map<string, FindingsArtifact>();
      artifacts.set("fixture-a", {
        version: "ctg/v1",
        generated_at: "2026-05-02T00:00:00Z",
        run_id: "test",
        repo: { root: "." },
        tool: { name: "code-to-gate", version: "1.0.0", plugin_versions: [] },
        artifact: "findings",
        schema: "findings@v1",
        completeness: "complete",
        findings: [
          {
            id: "f001",
            ruleId: "TEST",
            category: "security",
            severity: "high",
            confidence: 0.9,
            title: "Test",
            summary: "Test",
            evidence: [{ id: "ev", path: "file.ts", startLine: 1, endLine: 1, kind: "text" }],
            tags: [],
            upstream: { tool: "native" },
          },
        ],
        unsupported_claims: [],
      });

      const result = createFNEvaluationResult(seeded, artifacts, "phase1");

      expect(result.phase).toBe("phase1");
      expect(result.summary.seeded_count).toBe(2);
      expect(result.summary.detection_rate).toBe(50);
      expect(result.summary.target).toBe(FN_RATE_TARGETS.phase1);
      expect(result.summary.pass).toBe(false);
    });
  });

  describe("evaluateFN", () => {
    it("returns pass when detection rate meets target", () => {
      const detections: DetectionResult[] = [
        { seeded_id: "S001", rule_id: "TEST", detected: true },
        { seeded_id: "S002", rule_id: "TEST", detected: true },
      ];

      const result = evaluateFN(detections, "phase1");
      expect(result.pass).toBe(true);
      expect(result.detection_rate).toBe(100);
    });

    it("returns fail when detection rate below target", () => {
      const detections: DetectionResult[] = [
        { seeded_id: "S001", rule_id: "TEST", detected: false, missed_reason: "test" },
        { seeded_id: "S002", rule_id: "TEST", detected: false, missed_reason: "test" },
      ];

      const result = evaluateFN(detections, "phase1");
      expect(result.pass).toBe(false);
      expect(result.detection_rate).toBe(0);
    });
  });

  describe("generateFNEvidenceYAML", () => {
    it("generates valid YAML format", () => {
      const result: FNEvaluationResult = {
        evaluation_id: "fn-eval-test",
        date: "2026-05-02",
        phase: "phase1",
        fixtures: ["fixture-a"],
        detections: [],
        summary: {
          seeded_count: 10,
          detected_count: 8,
          missed_count: 2,
          detection_rate: 80,
          target: 80,
          pass: true,
        },
      };

      const yaml = generateFNEvidenceYAML(result);
      expect(yaml).toContain("fn_evaluation:");
      expect(yaml).toContain("detection_rate: 80%");
      expect(yaml).toContain("result: pass");
    });

    it("includes missed smells in YAML", () => {
      const result: FNEvaluationResult = {
        evaluation_id: "fn-eval-test",
        date: "2026-05-02",
        phase: "phase1",
        fixtures: ["fixture-a"],
        detections: [],
        summary: {
          seeded_count: 10,
          detected_count: 8,
          missed_count: 2,
          detection_rate: 80,
          target: 80,
          pass: true,
        },
        missed_smells: [
          { seeded_id: "S001", rule_id: "TEST", reason: "Not detected" },
        ],
      };

      const yaml = generateFNEvidenceYAML(result);
      expect(yaml).toContain("missed_smells:");
      expect(yaml).toContain("Not detected");
    });
  });

  describe("validateSeededSmells", () => {
    it("validates correct smells config", () => {
      const smells = [
        {
          seeded_id: "S001",
          rule_id: "TEST",
          fixture: "fixture-a",
          path: "file.ts",
          severity: "high",
        },
      ];

      const result = validateSeededSmells(smells);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it("reports errors for missing required fields", () => {
      const smells = [
        {
          path: "file.ts",
        },
      ];

      const result = validateSeededSmells(smells);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("reports error for invalid severity", () => {
      const smells = [
        {
          seeded_id: "S001",
          rule_id: "TEST",
          fixture: "fixture-a",
          path: "file.ts",
          severity: "invalid",
        },
      ];

      const result = validateSeededSmells(smells);
      expect(result.valid).toBe(false);
    });
  });

  describe("getSeededSmellsByFixture", () => {
    it("filters smells by fixture name", () => {
      const filtered = getSeededSmellsByFixture(DEFAULT_SEEDED_SMELLS, "demo-shop-ts");
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every((s) => s.fixture === "demo-shop-ts")).toBe(true);
    });
  });

  describe("getSeededSmellsByRule", () => {
    it("filters smells by rule ID", () => {
      const filtered = getSeededSmellsByRule(DEFAULT_SEEDED_SMELLS, "CLIENT_TRUSTED_PRICE");
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every((s) => s.rule_id === "CLIENT_TRUSTED_PRICE")).toBe(true);
    });
  });

  describe("compareFNEvaluations", () => {
    it("calculates comparison statistics", () => {
      const results: FNEvaluationResult[] = [
        {
          evaluation_id: "eval-1",
          date: "2026-05-01",
          phase: "phase1",
          fixtures: [],
          detections: [],
          summary: { seeded_count: 10, detected_count: 8, missed_count: 2, detection_rate: 80, target: 80, pass: true },
        },
        {
          evaluation_id: "eval-2",
          date: "2026-05-02",
          phase: "phase1",
          fixtures: [],
          detections: [],
          summary: { seeded_count: 10, detected_count: 9, missed_count: 1, detection_rate: 90, target: 80, pass: true },
        },
      ];

      const comparison = compareFNEvaluations(results);
      expect(comparison.average_detection_rate).toBe(85);
      expect(comparison.worst_detection_rate).toBe(80);
      expect(comparison.best_detection_rate).toBe(90);
      expect(comparison.all_pass).toBe(true);
    });
  });

  describe("FN_RATE_TARGETS", () => {
    it("defines phase targets correctly", () => {
      expect(FN_RATE_TARGETS.phase1).toBe(80);
      expect(FN_RATE_TARGETS.phase2).toBe(90);
      expect(FN_RATE_TARGETS.phase3).toBe(95);
    });
  });

  describe("DEFAULT_SEEDED_SMELLS", () => {
    it("contains expected seeded smells", () => {
      expect(DEFAULT_SEEDED_SMELLS.length).toBe(10);
      expect(DEFAULT_SEEDED_SMELLS.some((s) => s.rule_id === "CLIENT_TRUSTED_PRICE")).toBe(true);
      expect(DEFAULT_SEEDED_SMELLS.some((s) => s.rule_id === "WEAK_AUTH_GUARD")).toBe(true);
    });
  });
});