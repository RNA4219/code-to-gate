/**
 * Contract tests for State Gate adapter
 *
 * Validates that generated State Gate payloads conform to
 * the internal StateGateEvidence interface contract
 * and produce valid, well-structured output.
 */

import { describe, it, expect } from "vitest";
import {
  generateStateGateEvidence,
  StateGateEvidence,
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

describe("State Gate Adapter Contract Tests", () => {
  describe("Required fields validation", () => {
    it("should have all required fields present", () => {
      const findings = createMockFindings();
      const result = generateStateGateEvidence(findings);

      // Verify all required fields
      expect(result.version).toBeDefined();
      expect(result.generated_at).toBeDefined();
      expect(result.run_id).toBeDefined();
      expect(result.repo).toBeDefined();
      expect(result.artifact).toBeDefined();
      expect(result.schema).toBeDefined();
      expect(result.evidence_type).toBeDefined();
      expect(result.evidence_data).toBeDefined();
      expect(result.confidence_score).toBeDefined();
      expect(result.attestations).toBeDefined();
    });

    it("should require version field with correct format", () => {
      const findings = createMockFindings();
      const result = generateStateGateEvidence(findings);

      expect(result.version).toBeDefined();
      expect(result.version).toBe("ctg.state-gate/v1alpha1");
    });

    it("should require run_id field matching input", () => {
      const findings = createMockFindings({ run_id: "test-run-456" });
      const result = generateStateGateEvidence(findings);

      expect(result.run_id).toBeDefined();
      expect(result.run_id).toBe("test-run-456");
    });

    it("should require repo field with root", () => {
      const findings = createMockFindings({ repo: { root: "/app/project" } });
      const result = generateStateGateEvidence(findings);

      expect(result.repo).toBeDefined();
      expect(result.repo.root).toBeDefined();
      expect(result.repo.root).toBe("/app/project");
    });

    it("should require artifact field", () => {
      const findings = createMockFindings();
      const result = generateStateGateEvidence(findings);

      expect(result.artifact).toBeDefined();
      expect(result.artifact).toBe("state-gate-evidence");
    });

    it("should require schema field", () => {
      const findings = createMockFindings();
      const result = generateStateGateEvidence(findings);

      expect(result.schema).toBeDefined();
      expect(result.schema).toBe("state-gate-evidence@v1");
    });

    it("should require evidence_type field", () => {
      const findings = createMockFindings();
      const result = generateStateGateEvidence(findings);

      expect(result.evidence_type).toBeDefined();
      expect(typeof result.evidence_type).toBe("string");
      expect(result.evidence_type).toBe("static_analysis");
    });

    it("should require confidence_score field", () => {
      const findings = createMockFindings();
      const result = generateStateGateEvidence(findings);

      expect(result.confidence_score).toBeDefined();
      expect(typeof result.confidence_score).toBe("number");
    });
  });

  describe("Field type validation", () => {
    it("should have version as const string matching pattern", () => {
      const findings = createMockFindings();
      const result = generateStateGateEvidence(findings);

      expect(typeof result.version).toBe("string");
      expect(result.version).toMatch(/^ctg\.state-gate\/v\d+alpha\d+$/);
    });

    it("should have generated_at as ISO 8601 datetime", () => {
      const findings = createMockFindings({ generated_at: "2025-01-15T10:30:00Z" });
      const result = generateStateGateEvidence(findings);

      expect(typeof result.generated_at).toBe("string");
      expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("should have confidence_score as number between 0 and 1", () => {
      const findings = createMockFindings();
      const result = generateStateGateEvidence(findings);

      expect(typeof result.confidence_score).toBe("number");
      expect(result.confidence_score).toBeGreaterThanOrEqual(0);
      expect(result.confidence_score).toBeLessThanOrEqual(1);
    });

    it("should have evidence_data with correct structure", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateStateGateEvidence(findings);

      expect(result.evidence_data).toBeDefined();
      expect(typeof result.evidence_data.findings_count).toBe("number");
      expect(typeof result.evidence_data.risk_count).toBe("number");
      expect(typeof result.evidence_data.test_seed_count).toBe("number");
      expect(typeof result.evidence_data.readiness_status).toBe("string");
    });

    it("should have attestations as array with correct structure", () => {
      const findings = createMockFindings();
      const result = generateStateGateEvidence(findings);

      expect(Array.isArray(result.attestations)).toBe(true);
      expect(result.attestations.length).toBeGreaterThan(0);

      for (const attestation of result.attestations) {
        expect(typeof attestation.type).toBe("string");
        expect(typeof attestation.hash).toBe("string");
        expect(typeof attestation.timestamp).toBe("string");
      }
    });

    it("should have repo as object with string root", () => {
      const findings = createMockFindings({ repo: { root: "/project" } });
      const result = generateStateGateEvidence(findings);

      expect(typeof result.repo).toBe("object");
      expect(typeof result.repo.root).toBe("string");
    });
  });

  describe("Version string format validation", () => {
    it("should match expected version pattern ctg.state-gate/vXalphaY", () => {
      const findings = createMockFindings();
      const result = generateStateGateEvidence(findings);

      const versionPattern = /^ctg\.state-gate\/v\d+alpha\d+$/;
      expect(result.version).toMatch(versionPattern);
    });

    it("should have consistent version across multiple calls", () => {
      const findings1 = createMockFindings();
      const findings2 = createMockFindings({ run_id: "different-run" });

      const result1 = generateStateGateEvidence(findings1);
      const result2 = generateStateGateEvidence(findings2);

      expect(result1.version).toBe(result2.version);
    });

    it("should use alpha designation for pre-release stability", () => {
      const findings = createMockFindings();
      const result = generateStateGateEvidence(findings);

      expect(result.version).toContain("alpha");
    });
  });

  describe("Payload generation validation", () => {
    it("should generate valid payload with no findings", () => {
      const findings = createMockFindings();
      const result = generateStateGateEvidence(findings);

      expect(result.confidence_score).toBe(1.0);
      expect(result.evidence_data.findings_count).toBe(0);
      expect(result.evidence_data.readiness_status).toBe("passed");
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

      const result = generateStateGateEvidence(findings);

      expect(result.evidence_data.findings_count).toBe(1);
      expect(result.evidence_data.readiness_status).toBe("blocked");
      expect(result.confidence_score).toBeLessThan(1.0);
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

      const result = generateStateGateEvidence(findings);

      expect(result.evidence_data.findings_count).toBe(1);
      expect(result.evidence_data.readiness_status).toBe("needs_review");
    });

    it("should generate valid payload with mixed findings", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "Critical", summary: "S1", evidence: [{ id: "e1", path: "a.ts", kind: "text", excerptHash: "h" }] },
          { id: "f2", ruleId: "R2", category: "auth", severity: "high", confidence: 0.8, title: "High", summary: "S2", evidence: [{ id: "e2", path: "b.ts", kind: "text", excerptHash: "h" }] },
          { id: "f3", ruleId: "R3", category: "validation", severity: "medium", confidence: 0.7, title: "Medium", summary: "S3", evidence: [{ id: "e3", path: "c.ts", kind: "text", excerptHash: "h" }] },
        ],
      });

      const result = generateStateGateEvidence(findings);

      expect(result.evidence_data.findings_count).toBe(3);
    });
  });

  describe("Confidence score calculation", () => {
    it("should have confidence 1.0 with no findings", () => {
      const findings = createMockFindings();
      const result = generateStateGateEvidence(findings);

      expect(result.confidence_score).toBe(1.0);
    });

    it("should reduce confidence with critical findings (0.3 per finding)", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateStateGateEvidence(findings);

      expect(result.confidence_score).toBeLessThan(1.0);
      expect(result.confidence_score).toBeCloseTo(0.7, 1);
    });

    it("should reduce confidence with high findings (0.1 per finding)", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "auth", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateStateGateEvidence(findings);

      expect(result.confidence_score).toBeLessThan(1.0);
      expect(result.confidence_score).toBeCloseTo(0.9, 1);
    });

    it("should reduce confidence with medium/low findings (0.02 per finding)", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "validation", severity: "medium", confidence: 0.7, title: "T1", summary: "S1", evidence: [] },
          { id: "f2", ruleId: "R2", category: "maintainability", severity: "low", confidence: 0.6, title: "T2", summary: "S2", evidence: [] },
        ],
      });
      const result = generateStateGateEvidence(findings);

      expect(result.confidence_score).toBeLessThan(1.0);
      expect(result.confidence_score).toBeCloseTo(0.96, 1);
    });

    it("should not go below 0 for confidence", () => {
      const findings = createMockFindings({
        findings: Array.from({ length: 10 }, (_, i) => ({
          id: `f${i}`,
          ruleId: `R${i}`,
          category: "security",
          severity: "critical",
          confidence: 0.9,
          title: `T${i}`,
          summary: `S${i}`,
          evidence: [],
        })),
      });
      const result = generateStateGateEvidence(findings);

      expect(result.confidence_score).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Evidence data structure", () => {
    it("should have correct findings_count", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [] },
          { id: "f2", ruleId: "R2", category: "auth", severity: "medium", confidence: 0.7, title: "T2", summary: "S2", evidence: [] },
        ],
      });
      const result = generateStateGateEvidence(findings);

      expect(result.evidence_data.findings_count).toBe(2);
    });

    it("should have correct readiness_status for critical findings", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateStateGateEvidence(findings);

      expect(result.evidence_data.readiness_status).toBe("blocked");
    });

    it("should have correct readiness_status for high findings", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "auth", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateStateGateEvidence(findings);

      expect(result.evidence_data.readiness_status).toBe("needs_review");
    });

    it("should have correct readiness_status when passed", () => {
      const findings = createMockFindings();
      const result = generateStateGateEvidence(findings);

      expect(result.evidence_data.readiness_status).toBe("passed");
    });

    it("should have risk_count and test_seed_count as numbers", () => {
      const findings = createMockFindings();
      const result = generateStateGateEvidence(findings);

      expect(typeof result.evidence_data.risk_count).toBe("number");
      expect(typeof result.evidence_data.test_seed_count).toBe("number");
    });
  });

  describe("Attestations structure", () => {
    it("should have at least one attestation", () => {
      const findings = createMockFindings();
      const result = generateStateGateEvidence(findings);

      expect(result.attestations.length).toBeGreaterThanOrEqual(1);
    });

    it("should have static_analysis_complete attestation type", () => {
      const findings = createMockFindings();
      const result = generateStateGateEvidence(findings);

      expect(result.attestations.some(a => a.type === "static_analysis_complete")).toBe(true);
    });

    it("should have hash prefixed with sha256", () => {
      const findings = createMockFindings();
      const result = generateStateGateEvidence(findings);

      for (const attestation of result.attestations) {
        expect(attestation.hash).toMatch(/^sha256:/);
      }
    });

    it("should have timestamp matching generated_at", () => {
      const findings = createMockFindings({ generated_at: "2025-01-15T10:30:00Z" });
      const result = generateStateGateEvidence(findings);

      expect(result.attestations[0].timestamp).toBe("2025-01-15T10:30:00Z");
    });
  });
});