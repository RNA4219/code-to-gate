/**
 * Contract tests for Manual-bb adapter
 *
 * Validates that generated Manual-bb payloads conform to
 * the internal ManualBbSeed interface contract
 * and produce valid, well-structured output.
 */

import { describe, it, expect } from "vitest";
import {
  generateManualBbSeed,
} from "../../cli/export.js";
import { createMockFindingsArtifact } from "../../test-utils/index.js";

const createMockFindings = createMockFindingsArtifact;

describe("Manual-bb Adapter Contract Tests", () => {
  describe("Required fields validation", () => {
    it("should have all required fields present", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "f1",
            ruleId: "CLIENT_TRUSTED_PRICE",
            category: "payment",
            severity: "critical",
            confidence: 0.9,
            title: "Client trusted price",
            summary: "Price from client is trusted",
            evidence: [{ id: "ev-1", path: "src/api.ts", startLine: 10, kind: "text", excerptHash: "abc123" }],
          },
        ],
      });
      const result = generateManualBbSeed(findings);

      // Verify all required fields
      expect(result.version).toBeDefined();
      expect(result.generated_at).toBeDefined();
      expect(result.run_id).toBeDefined();
      expect(result.repo).toBeDefined();
      expect(result.artifact).toBeDefined();
      expect(result.schema).toBeDefined();
      expect(result.test_cases).toBeDefined();
    });

    it("should require version field with correct format", () => {
      const findings = createMockFindings();
      const result = generateManualBbSeed(findings);

      expect(result.version).toBeDefined();
      expect(result.version).toBe("ctg.manual-bb/v1alpha1");
    });

    it("should require run_id field matching input", () => {
      const findings = createMockFindings({ run_id: "test-run-789" });
      const result = generateManualBbSeed(findings);

      expect(result.run_id).toBeDefined();
      expect(result.run_id).toBe("test-run-789");
    });

    it("should require repo field with root", () => {
      const findings = createMockFindings({ repo: { root: "/app/project" } });
      const result = generateManualBbSeed(findings);

      expect(result.repo).toBeDefined();
      expect(result.repo.root).toBeDefined();
      expect(result.repo.root).toBe("/app/project");
    });

    it("should require artifact field", () => {
      const findings = createMockFindings();
      const result = generateManualBbSeed(findings);

      expect(result.artifact).toBeDefined();
      expect(result.artifact).toBe("manual-bb-seed");
    });

    it("should require schema field", () => {
      const findings = createMockFindings();
      const result = generateManualBbSeed(findings);

      expect(result.schema).toBeDefined();
      expect(result.schema).toBe("manual-bb-seed@v1");
    });

    it("should require test_cases field", () => {
      const findings = createMockFindings();
      const result = generateManualBbSeed(findings);

      expect(result.test_cases).toBeDefined();
      expect(Array.isArray(result.test_cases)).toBe(true);
    });
  });

  describe("Field type validation", () => {
    it("should have version as const string matching pattern", () => {
      const findings = createMockFindings();
      const result = generateManualBbSeed(findings);

      expect(typeof result.version).toBe("string");
      expect(result.version).toMatch(/^ctg\.manual-bb\/v\d+alpha\d+$/);
    });

    it("should have generated_at as ISO 8601 datetime", () => {
      const findings = createMockFindings({ generated_at: "2025-01-15T10:30:00Z" });
      const result = generateManualBbSeed(findings);

      expect(typeof result.generated_at).toBe("string");
      expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("should have test_cases as array with correct structure", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [{ id: "e1", path: "file.ts", startLine: 10, kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateManualBbSeed(findings);

      expect(Array.isArray(result.test_cases)).toBe(true);

      if (result.test_cases.length > 0) {
        const testCase = result.test_cases[0];
        expect(typeof testCase.id).toBe("string");
        expect(typeof testCase.title).toBe("string");
        expect(typeof testCase.category).toBe("string");
        expect(typeof testCase.risk_area).toBe("string");
        expect(typeof testCase.description).toBe("string");
        expect(Array.isArray(testCase.steps)).toBe(true);
        expect(typeof testCase.expected_result).toBe("string");
        expect(["high", "medium", "low"]).toContain(testCase.priority);
        expect(Array.isArray(testCase.source_findings)).toBe(true);
      }
    });

    it("should have priority as valid enum value", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [{ id: "e1", path: "file.ts", kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateManualBbSeed(findings);

      for (const testCase of result.test_cases) {
        expect(["high", "medium", "low"]).toContain(testCase.priority);
      }
    });

    it("should have repo as object with string root", () => {
      const findings = createMockFindings({ repo: { root: "/project" } });
      const result = generateManualBbSeed(findings);

      expect(typeof result.repo).toBe("object");
      expect(typeof result.repo.root).toBe("string");
    });
  });

  describe("Version string format validation", () => {
    it("should match expected version pattern ctg.manual-bb/vXalphaY", () => {
      const findings = createMockFindings();
      const result = generateManualBbSeed(findings);

      const versionPattern = /^ctg\.manual-bb\/v\d+alpha\d+$/;
      expect(result.version).toMatch(versionPattern);
    });

    it("should have consistent version across multiple calls", () => {
      const findings1 = createMockFindings();
      const findings2 = createMockFindings({ run_id: "different-run" });

      const result1 = generateManualBbSeed(findings1);
      const result2 = generateManualBbSeed(findings2);

      expect(result1.version).toBe(result2.version);
    });

    it("should use alpha designation for pre-release stability", () => {
      const findings = createMockFindings();
      const result = generateManualBbSeed(findings);

      expect(result.version).toContain("alpha");
    });
  });

  describe("Payload generation validation", () => {
    it("should generate valid payload with no findings", () => {
      const findings = createMockFindings();
      const result = generateManualBbSeed(findings);

      expect(Array.isArray(result.test_cases)).toBe(true);
      // May have 0 or a general test case when no findings
    });

    it("should generate valid payload with critical findings", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "finding-critical-001",
            ruleId: "CLIENT_TRUSTED_PRICE",
            category: "payment",
            severity: "critical",
            confidence: 0.95,
            title: "Critical payment issue",
            summary: "Client supplied price is trusted",
            evidence: [{ id: "ev-1", path: "src/payment.ts", startLine: 15, kind: "text", excerptHash: "hash123" }],
          },
        ],
      });

      const result = generateManualBbSeed(findings);

      expect(result.test_cases.length).toBeGreaterThan(0);
      expect(result.test_cases.some(tc => tc.priority === "high")).toBe(true);
    });

    it("should generate valid payload with high findings", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "finding-high-001",
            ruleId: "WEAK_AUTH_GUARD",
            category: "auth",
            severity: "high",
            confidence: 0.85,
            title: "Weak authentication",
            summary: "Authentication guard is weak",
            evidence: [{ id: "ev-1", path: "src/guard.ts", startLine: 10, kind: "text", excerptHash: "hash456" }],
          },
        ],
      });

      const result = generateManualBbSeed(findings);

      expect(result.test_cases.length).toBeGreaterThan(0);
    });

    it("should generate valid payload with mixed findings", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "payment", severity: "critical", confidence: 0.9, title: "Critical", summary: "S1", evidence: [{ id: "e1", path: "a.ts", kind: "text", excerptHash: "h" }] },
          { id: "f2", ruleId: "R2", category: "auth", severity: "high", confidence: 0.8, title: "High", summary: "S2", evidence: [{ id: "e2", path: "b.ts", kind: "text", excerptHash: "h" }] },
        ],
      });

      const result = generateManualBbSeed(findings);

      expect(result.test_cases.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Test case generation", () => {
    it("should generate test cases for critical findings", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "CRITICAL_RULE", category: "security", severity: "critical", confidence: 0.9, title: "Critical Issue", summary: "S1", evidence: [{ id: "e1", path: "file.ts", startLine: 10, kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateManualBbSeed(findings);

      expect(result.test_cases.length).toBeGreaterThan(0);
      expect(result.test_cases.some(tc => tc.priority === "high")).toBe(true);
    });

    it("should generate test cases for high findings with medium priority", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "HIGH_RULE", category: "auth", severity: "high", confidence: 0.8, title: "High Issue", summary: "S1", evidence: [{ id: "e1", path: "file.ts", startLine: 10, kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateManualBbSeed(findings);

      expect(result.test_cases.length).toBeGreaterThan(0);
      expect(result.test_cases.some(tc => tc.priority === "medium")).toBe(true);
    });

    it("should map auth category to authentication risk area", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "AUTH_RULE", category: "auth", severity: "high", confidence: 0.8, title: "Auth Issue", summary: "S1", evidence: [{ id: "e1", path: "auth.ts", kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateManualBbSeed(findings);

      const authTestCase = result.test_cases.find(tc => tc.source_findings.includes("f1"));
      if (authTestCase) {
        expect(authTestCase.risk_area).toBe("authentication");
      }
    });

    it("should map payment category to payment risk area", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "PAYMENT_RULE", category: "payment", severity: "critical", confidence: 0.9, title: "Payment Issue", summary: "S2", evidence: [{ id: "e2", path: "pay.ts", kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateManualBbSeed(findings);

      const paymentTestCase = result.test_cases.find(tc => tc.source_findings.includes("f1"));
      if (paymentTestCase) {
        expect(paymentTestCase.risk_area).toBe("payment");
      }
    });

    it("should map other categories to security risk area", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "VALIDATION_RULE", category: "validation", severity: "high", confidence: 0.8, title: "Validation Issue", summary: "S1", evidence: [{ id: "e1", path: "validate.ts", kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateManualBbSeed(findings);

      const testCase = result.test_cases.find(tc => tc.source_findings.includes("f1"));
      if (testCase) {
        expect(testCase.risk_area).toBe("security");
      }
    });

    it("should generate general test case when only medium/low findings exist", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "LOW_RULE", category: "maintainability", severity: "low", confidence: 0.5, title: "Low Issue", summary: "S1", evidence: [{ id: "e1", path: "file.ts", kind: "text", excerptHash: "h" }] },
          { id: "f2", ruleId: "MEDIUM_RULE", category: "validation", severity: "medium", confidence: 0.6, title: "Medium Issue", summary: "S2", evidence: [{ id: "e2", path: "file2.ts", kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateManualBbSeed(findings);

      // Should have at least one test case (general security review)
      expect(result.test_cases.length).toBeGreaterThanOrEqual(1);
      expect(result.test_cases.some(tc => tc.risk_area === "general" || tc.title.includes("General"))).toBe(true);
    });

    it("should include evidence path in steps", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [{ id: "e1", path: "src/api.ts", startLine: 25, kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateManualBbSeed(findings);

      if (result.test_cases.length > 0) {
        const testCase = result.test_cases[0];
        const hasPathOrLine = testCase.steps.some(step => step.includes("src/api.ts") || step.includes("25"));
        expect(hasPathOrLine).toBe(true);
      }
    });

    it("should not generate test cases for medium/low findings", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "MEDIUM_RULE", category: "validation", severity: "medium", confidence: 0.7, title: "Medium", summary: "S1", evidence: [] },
        ],
      });
      const result = generateManualBbSeed(findings);

      // Should have general test case but not specific test case for medium finding
      const specificTestCase = result.test_cases.find(tc => tc.source_findings.includes("f1") && tc.id.startsWith("bb-f1"));
      expect(specificTestCase).toBeUndefined();
    });
  });

  describe("Source findings linkage", () => {
    it("should link test cases to source findings", () => {
      const findings = createMockFindings({
        findings: [
          { id: "finding-001", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [{ id: "e1", path: "file.ts", kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateManualBbSeed(findings);

      if (result.test_cases.length > 0) {
        for (const testCase of result.test_cases) {
          expect(Array.isArray(testCase.source_findings)).toBe(true);
        }
      }
    });

    it("should use finding id in test case id", () => {
      const findings = createMockFindings({
        findings: [
          { id: "finding-xyz", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [{ id: "e1", path: "file.ts", kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateManualBbSeed(findings);

      const specificTestCase = result.test_cases.find(tc => tc.id === "bb-finding-xyz");
      expect(specificTestCase).toBeDefined();
    });

    it("should include ruleId in test case title", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "CLIENT_TRUSTED_PRICE", category: "payment", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [{ id: "e1", path: "file.ts", kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateManualBbSeed(findings);

      const testCase = result.test_cases.find(tc => tc.id === "bb-f1");
      if (testCase) {
        expect(testCase.title).toContain("CLIENT_TRUSTED_PRICE");
      }
    });
  });

  describe("Test case steps validation", () => {
    it("should have at least 3 steps in each test case", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [{ id: "e1", path: "file.ts", kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateManualBbSeed(findings);

      for (const testCase of result.test_cases) {
        expect(testCase.steps.length).toBeGreaterThanOrEqual(3);
      }
    });

    it("should have all steps as strings", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [{ id: "e1", path: "file.ts", kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateManualBbSeed(findings);

      for (const testCase of result.test_cases) {
        for (const step of testCase.steps) {
          expect(typeof step).toBe("string");
        }
      }
    });

    it("should have meaningful expected_result", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "CLIENT_TRUSTED_PRICE", category: "payment", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [{ id: "e1", path: "file.ts", kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateManualBbSeed(findings);

      for (const testCase of result.test_cases) {
        expect(testCase.expected_result.length).toBeGreaterThan(10);
      }
    });
  });

  describe("TRUSTED_PRICE specific expected result", () => {
    it("should have specific expected result for TRUSTED_PRICE rules", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "CLIENT_TRUSTED_PRICE", category: "payment", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [{ id: "e1", path: "file.ts", kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateManualBbSeed(findings);

      const testCase = result.test_cases.find(tc => tc.id === "bb-f1");
      if (testCase) {
        expect(testCase.expected_result).toContain("reject");
        expect(testCase.expected_result).toContain("price");
      }
    });
  });

  describe("AUTH specific expected result", () => {
    it("should have specific expected result for AUTH rules", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "WEAK_AUTH_GUARD", category: "auth", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [{ id: "e1", path: "file.ts", kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateManualBbSeed(findings);

      const testCase = result.test_cases.find(tc => tc.id === "bb-f1");
      if (testCase) {
        expect(testCase.expected_result).toContain("Authentication");
        expect(testCase.expected_result).toContain("required");
      }
    });
  });
});