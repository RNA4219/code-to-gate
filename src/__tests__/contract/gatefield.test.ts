/**
 * Contract tests for Gatefield adapter
 *
 * Validates that generated Gatefield payloads conform to
 * the internal GatefieldStaticResult interface contract
 * and produce valid, well-structured output.
 */

import { describe, it, expect } from "vitest";
import {
  generateGatefieldResult,
  GatefieldStaticResult,
} from "../../cli/export.js";
import { FindingsArtifact, CTG_VERSION } from "../../types/artifacts.js";

function createMockFindings(overrides?: Partial<FindingsArtifact>): FindingsArtifact {
  const base: FindingsArtifact = {
    version: CTG_VERSION,
    generated_at: new Date().toISOString(),
    run_id: "ctg-test-run-001",
    repo: { root: "." },
    tool: { name: "code-to-gate", version: "0.1.0", plugin_versions: [] },
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings: [],
    unsupported_claims: [],
  };
  return { ...base, ...overrides } as FindingsArtifact;
}

describe("Gatefield Adapter Contract Tests", () => {
  describe("Required fields validation", () => {
    it("should have all required fields present", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "finding-001",
            ruleId: "CLIENT_TRUSTED_PRICE",
            category: "payment",
            severity: "critical",
            confidence: 0.9,
            title: "Client trusted price",
            summary: "Price is trusted from client",
            evidence: [{ id: "ev-1", path: "src/api.ts", startLine: 10, kind: "text", excerptHash: "abc123" }],
          },
        ],
      });

      const result = generateGatefieldResult(findings);

      // Verify all required fields
      expect(result.version).toBeDefined();
      expect(result.generated_at).toBeDefined();
      expect(result.run_id).toBeDefined();
      expect(result.repo).toBeDefined();
      expect(result.artifact).toBeDefined();
      expect(result.schema).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.findings_summary).toBeDefined();
      expect(result.blocking_reasons).toBeDefined();
      expect(result.recommended_actions).toBeDefined();
    });

    it("should require version field with correct format", () => {
      const findings = createMockFindings();
      const result = generateGatefieldResult(findings);

      expect(result.version).toBeDefined();
      expect(result.version).toBe("ctg.gatefield/v1alpha1");
    });

    it("should require run_id field matching input", () => {
      const findings = createMockFindings({ run_id: "test-run-123" });
      const result = generateGatefieldResult(findings);

      expect(result.run_id).toBeDefined();
      expect(result.run_id).toBe("test-run-123");
    });

    it("should require repo field with root", () => {
      const findings = createMockFindings({ repo: { root: "/app/repo" } });
      const result = generateGatefieldResult(findings);

      expect(result.repo).toBeDefined();
      expect(result.repo.root).toBeDefined();
      expect(result.repo.root).toBe("/app/repo");
    });

    it("should require artifact field", () => {
      const findings = createMockFindings();
      const result = generateGatefieldResult(findings);

      expect(result.artifact).toBeDefined();
      expect(result.artifact).toBe("gatefield-static-result");
    });

    it("should require schema field", () => {
      const findings = createMockFindings();
      const result = generateGatefieldResult(findings);

      expect(result.schema).toBeDefined();
      expect(result.schema).toBe("gatefield-static-result@v1");
    });

    it("should require status field with valid enum value", () => {
      const findings = createMockFindings();
      const result = generateGatefieldResult(findings);

      expect(result.status).toBeDefined();
      expect(["passed", "blocked", "needs_review"]).toContain(result.status);
    });

    it("should require summary field as string", () => {
      const findings = createMockFindings();
      const result = generateGatefieldResult(findings);

      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe("string");
      expect(result.summary.length).toBeGreaterThan(0);
    });
  });

  describe("Field type validation", () => {
    it("should have version as const string matching pattern", () => {
      const findings = createMockFindings();
      const result = generateGatefieldResult(findings);

      expect(typeof result.version).toBe("string");
      expect(result.version).toMatch(/^ctg\.gatefield\/v\d+alpha\d+$/);
    });

    it("should have generated_at as ISO 8601 datetime", () => {
      const findings = createMockFindings({ generated_at: "2025-01-15T10:30:00Z" });
      const result = generateGatefieldResult(findings);

      expect(typeof result.generated_at).toBe("string");
      expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("should have findings_summary with correct numeric types", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [] },
          { id: "f2", ruleId: "R2", category: "security", severity: "high", confidence: 0.8, title: "T2", summary: "S2", evidence: [] },
          { id: "f3", ruleId: "R3", category: "security", severity: "medium", confidence: 0.7, title: "T3", summary: "S3", evidence: [] },
          { id: "f4", ruleId: "R4", category: "security", severity: "low", confidence: 0.6, title: "T4", summary: "S4", evidence: [] },
        ],
      });
      const result = generateGatefieldResult(findings);

      expect(typeof result.findings_summary.total).toBe("number");
      expect(typeof result.findings_summary.critical).toBe("number");
      expect(typeof result.findings_summary.high).toBe("number");
      expect(typeof result.findings_summary.medium).toBe("number");
      expect(typeof result.findings_summary.low).toBe("number");

      expect(result.findings_summary.total).toBeGreaterThanOrEqual(0);
      expect(result.findings_summary.critical).toBeGreaterThanOrEqual(0);
      expect(result.findings_summary.total).toBe(4);
      expect(result.findings_summary.critical).toBe(1);
      expect(result.findings_summary.high).toBe(1);
      expect(result.findings_summary.medium).toBe(1);
      expect(result.findings_summary.low).toBe(1);
    });

    it("should have blocking_reasons as array of strings", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateGatefieldResult(findings);

      expect(Array.isArray(result.blocking_reasons)).toBe(true);
      expect(result.blocking_reasons.length).toBeGreaterThan(0);
      for (const reason of result.blocking_reasons) {
        expect(typeof reason).toBe("string");
      }
    });

    it("should have recommended_actions as array of strings", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [{ id: "e1", path: "file.ts", kind: "text", excerptHash: "hash" }] },
        ],
      });
      const result = generateGatefieldResult(findings);

      expect(Array.isArray(result.recommended_actions)).toBe(true);
      for (const action of result.recommended_actions) {
        expect(typeof action).toBe("string");
      }
    });

    it("should have repo as object with string root", () => {
      const findings = createMockFindings({ repo: { root: "/project" } });
      const result = generateGatefieldResult(findings);

      expect(typeof result.repo).toBe("object");
      expect(typeof result.repo.root).toBe("string");
    });
  });

  describe("Version string format validation", () => {
    it("should match expected version pattern ctg.gatefield/vXalphaY", () => {
      const findings = createMockFindings();
      const result = generateGatefieldResult(findings);

      const versionPattern = /^ctg\.gatefield\/v\d+alpha\d+$/;
      expect(result.version).toMatch(versionPattern);
    });

    it("should have consistent version across multiple calls", () => {
      const findings1 = createMockFindings();
      const findings2 = createMockFindings({ run_id: "different-run" });

      const result1 = generateGatefieldResult(findings1);
      const result2 = generateGatefieldResult(findings2);

      expect(result1.version).toBe(result2.version);
    });

    it("should use alpha designation for pre-release stability", () => {
      const findings = createMockFindings();
      const result = generateGatefieldResult(findings);

      expect(result.version).toContain("alpha");
    });
  });

  describe("Payload generation validation", () => {
    it("should generate valid payload with no findings", () => {
      const findings = createMockFindings();
      const result = generateGatefieldResult(findings);

      expect(result.status).toBe("passed");
      expect(result.findings_summary.total).toBe(0);
      expect(result.findings_summary.critical).toBe(0);
      expect(result.findings_summary.high).toBe(0);
      expect(result.blocking_reasons.length).toBe(0);
    });

    it("should generate valid payload with critical findings", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "finding-critical-001",
            ruleId: "CRITICAL_RULE",
            category: "security",
            severity: "critical",
            confidence: 0.95,
            title: "Critical security issue",
            summary: "A critical vulnerability was detected",
            evidence: [{ id: "ev-1", path: "src/auth.ts", startLine: 15, kind: "text", excerptHash: "hash123" }],
          },
        ],
      });

      const result = generateGatefieldResult(findings);

      expect(result.status).toBe("blocked");
      expect(result.findings_summary.critical).toBe(1);
      expect(result.blocking_reasons.length).toBeGreaterThan(0);
    });

    it("should generate valid payload with high findings", () => {
      const findings = createMockFindings({
        findings: [
          {
            id: "finding-high-001",
            ruleId: "HIGH_RULE",
            category: "auth",
            severity: "high",
            confidence: 0.85,
            title: "High severity issue",
            summary: "Authentication weakness detected",
            evidence: [{ id: "ev-1", path: "src/guard.ts", startLine: 10, kind: "text", excerptHash: "hash456" }],
          },
        ],
      });

      const result = generateGatefieldResult(findings);

      expect(result.status).toBe("needs_review");
      expect(result.findings_summary.high).toBe(1);
    });

    it("should generate valid payload with mixed findings", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "Critical", summary: "S1", evidence: [{ id: "e1", path: "a.ts", kind: "text", excerptHash: "h" }] },
          { id: "f2", ruleId: "R2", category: "auth", severity: "high", confidence: 0.8, title: "High", summary: "S2", evidence: [{ id: "e2", path: "b.ts", kind: "text", excerptHash: "h" }] },
          { id: "f3", ruleId: "R3", category: "validation", severity: "medium", confidence: 0.7, title: "Medium", summary: "S3", evidence: [{ id: "e3", path: "c.ts", kind: "text", excerptHash: "h" }] },
          { id: "f4", ruleId: "R4", category: "maintainability", severity: "low", confidence: 0.6, title: "Low", summary: "S4", evidence: [{ id: "e4", path: "d.ts", kind: "text", excerptHash: "h" }] },
        ],
      });

      const result = generateGatefieldResult(findings);

      expect(result.findings_summary.total).toBe(4);
      expect(result.findings_summary.critical).toBe(1);
      expect(result.findings_summary.high).toBe(1);
      expect(result.findings_summary.medium).toBe(1);
      expect(result.findings_summary.low).toBe(1);
    });
  });

  describe("Status determination", () => {
    it("should set status to blocked when critical findings exist", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateGatefieldResult(findings);

      expect(result.status).toBe("blocked");
    });

    it("should set status to needs_review when high findings exist but no critical", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "auth", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateGatefieldResult(findings);

      expect(result.status).toBe("needs_review");
    });

    it("should set status to passed when no findings exist", () => {
      const findings = createMockFindings();
      const result = generateGatefieldResult(findings);

      expect(result.status).toBe("passed");
    });

    it("should set status to passed when only medium/low findings exist", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "validation", severity: "medium", confidence: 0.7, title: "T1", summary: "S1", evidence: [] },
          { id: "f2", ruleId: "R2", category: "maintainability", severity: "low", confidence: 0.6, title: "T2", summary: "S2", evidence: [] },
        ],
      });
      const result = generateGatefieldResult(findings);

      expect(result.status).toBe("passed");
    });

    it("should prioritize critical over high for status", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [] },
          { id: "f2", ruleId: "R2", category: "auth", severity: "high", confidence: 0.8, title: "T2", summary: "S2", evidence: [] },
        ],
      });
      const result = generateGatefieldResult(findings);

      expect(result.status).toBe("blocked");
    });
  });

  describe("Blocking reasons generation", () => {
    it("should include critical count in blocking reasons", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [] },
          { id: "f2", ruleId: "R2", category: "security", severity: "critical", confidence: 0.9, title: "T2", summary: "S2", evidence: [] },
        ],
      });
      const result = generateGatefieldResult(findings);

      expect(result.blocking_reasons.some(r => r.includes("2 critical"))).toBe(true);
    });

    it("should include high count in blocking reasons when needs_review", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "auth", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateGatefieldResult(findings);

      expect(result.blocking_reasons.some(r => r.includes("high"))).toBe(true);
    });

    it("should have empty blocking reasons when passed", () => {
      const findings = createMockFindings();
      const result = generateGatefieldResult(findings);

      expect(result.blocking_reasons.length).toBe(0);
    });
  });

  describe("Recommended actions generation", () => {
    it("should include actions for critical findings", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "CRITICAL_RULE", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [{ id: "e1", path: "src/auth.ts", kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateGatefieldResult(findings);

      expect(result.recommended_actions.length).toBeGreaterThan(0);
      expect(result.recommended_actions[0]).toContain("CRITICAL_RULE");
    });

    it("should include actions for high findings", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "HIGH_RULE", category: "auth", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [{ id: "e1", path: "src/guard.ts", kind: "text", excerptHash: "h" }] },
        ],
      });
      const result = generateGatefieldResult(findings);

      expect(result.recommended_actions.length).toBeGreaterThan(0);
      expect(result.recommended_actions[0]).toContain("HIGH_RULE");
    });

    it("should limit recommended actions to first 5 findings", () => {
      const findings = createMockFindings({
        findings: Array.from({ length: 10 }, (_, i) => ({
          id: `f${i}`,
          ruleId: `RULE_${i}`,
          category: "security",
          severity: "critical",
          confidence: 0.9,
          title: `T${i}`,
          summary: `S${i}`,
          evidence: [{ id: `e${i}`, path: `file${i}.ts`, kind: "text", excerptHash: "h" }],
        })),
      });
      const result = generateGatefieldResult(findings);

      expect(result.recommended_actions.length).toBeLessThanOrEqual(5);
    });
  });
});