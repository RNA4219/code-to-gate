/**
 * Contract tests for Workflow evidence adapter
 *
 * Validates that generated Workflow evidence payloads conform to
 * the internal WorkflowEvidence interface contract
 * and produce valid, well-structured output.
 */

import { describe, it, expect } from "vitest";
import {
  generateWorkflowEvidence,
  WorkflowEvidence,
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

describe("Workflow Evidence Adapter Contract Tests", () => {
  describe("Required fields validation", () => {
    it("should have all required fields present", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      // Verify all required fields
      expect(result.version).toBeDefined();
      expect(result.generated_at).toBeDefined();
      expect(result.run_id).toBeDefined();
      expect(result.repo).toBeDefined();
      expect(result.artifact).toBeDefined();
      expect(result.schema).toBeDefined();
      expect(result.workflow_run_id).toBeDefined();
      expect(result.workflow_name).toBeDefined();
      expect(result.steps).toBeDefined();
      expect(result.overall_status).toBeDefined();
      expect(result.evidence_refs).toBeDefined();
    });

    it("should require version field with correct format", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(result.version).toBeDefined();
      expect(result.version).toBe("ctg.workflow-evidence/v1alpha1");
    });

    it("should require run_id field matching input", () => {
      const findings = createMockFindings({ run_id: "workflow-run-123" });
      const result = generateWorkflowEvidence(findings);

      expect(result.run_id).toBeDefined();
      expect(result.run_id).toBe("workflow-run-123");
    });

    it("should require repo field with root", () => {
      const findings = createMockFindings({ repo: { root: "/app/project" } });
      const result = generateWorkflowEvidence(findings);

      expect(result.repo).toBeDefined();
      expect(result.repo.root).toBeDefined();
      expect(result.repo.root).toBe("/app/project");
    });

    it("should require artifact field", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(result.artifact).toBeDefined();
      expect(result.artifact).toBe("workflow-evidence");
    });

    it("should require schema field", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(result.schema).toBeDefined();
      expect(result.schema).toBe("workflow-evidence@v1");
    });

    it("should require workflow_run_id field", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(result.workflow_run_id).toBeDefined();
      expect(typeof result.workflow_run_id).toBe("string");
    });

    it("should require workflow_name field", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(result.workflow_name).toBeDefined();
      expect(typeof result.workflow_name).toBe("string");
      expect(result.workflow_name).toBe("code-to-gate-analysis");
    });

    it("should require steps field", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(result.steps).toBeDefined();
      expect(Array.isArray(result.steps)).toBe(true);
    });

    it("should require overall_status field", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(result.overall_status).toBeDefined();
      expect(["success", "failure"]).toContain(result.overall_status);
    });

    it("should require evidence_refs field", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(result.evidence_refs).toBeDefined();
      expect(Array.isArray(result.evidence_refs)).toBe(true);
    });
  });

  describe("Field type validation", () => {
    it("should have version as const string matching pattern", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(typeof result.version).toBe("string");
      expect(result.version).toMatch(/^ctg\.workflow-evidence\/v\d+alpha\d+$/);
    });

    it("should have generated_at as ISO 8601 datetime", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(typeof result.generated_at).toBe("string");
      expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("should have steps as array with correct structure", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(Array.isArray(result.steps)).toBe(true);

      for (const step of result.steps) {
        expect(typeof step.name).toBe("string");
        expect(["success", "failure", "skipped"]).toContain(step.status);
        expect(typeof step.duration_ms).toBe("number");
        expect(Array.isArray(step.artifacts_produced)).toBe(true);
      }
    });

    it("should have overall_status as valid enum", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(["success", "failure"]).toContain(result.overall_status);
    });

    it("should have evidence_refs as array of strings", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(Array.isArray(result.evidence_refs)).toBe(true);
      for (const ref of result.evidence_refs) {
        expect(typeof ref).toBe("string");
      }
    });

    it("should have repo as object with string root", () => {
      const findings = createMockFindings({ repo: { root: "/project" } });
      const result = generateWorkflowEvidence(findings);

      expect(typeof result.repo).toBe("object");
      expect(typeof result.repo.root).toBe("string");
    });
  });

  describe("Version string format validation", () => {
    it("should match expected version pattern ctg.workflow-evidence/vXalphaY", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      const versionPattern = /^ctg\.workflow-evidence\/v\d+alpha\d+$/;
      expect(result.version).toMatch(versionPattern);
    });

    it("should have consistent version across multiple calls", () => {
      const findings1 = createMockFindings();
      const findings2 = createMockFindings({ run_id: "different-run" });

      const result1 = generateWorkflowEvidence(findings1);
      const result2 = generateWorkflowEvidence(findings2);

      expect(result1.version).toBe(result2.version);
    });

    it("should use alpha designation for pre-release stability", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(result.version).toContain("alpha");
    });
  });

  describe("Payload generation validation", () => {
    it("should generate valid payload with no findings", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(result.overall_status).toBe("success");
      expect(result.steps.length).toBeGreaterThanOrEqual(3);
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

      const result = generateWorkflowEvidence(findings);

      expect(result.overall_status).toBe("failure");
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

      const result = generateWorkflowEvidence(findings);

      expect(result.overall_status).toBe("success"); // High doesn't trigger failure
    });

    it("should generate valid payload with mixed findings", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "Critical", summary: "S1", evidence: [{ id: "e1", path: "a.ts", kind: "text", excerptHash: "h" }] },
          { id: "f2", ruleId: "R2", category: "auth", severity: "high", confidence: 0.8, title: "High", summary: "S2", evidence: [{ id: "e2", path: "b.ts", kind: "text", excerptHash: "h" }] },
          { id: "f3", ruleId: "R3", category: "validation", severity: "medium", confidence: 0.7, title: "Medium", summary: "S3", evidence: [{ id: "e3", path: "c.ts", kind: "text", excerptHash: "h" }] },
        ],
      });

      const result = generateWorkflowEvidence(findings);

      expect(result.overall_status).toBe("failure");
    });
  });

  describe("Workflow steps structure", () => {
    it("should have exactly 3 workflow steps", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(result.steps.length).toBe(3);
    });

    it("should have scan step", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      const scanStep = result.steps.find(s => s.name === "scan");
      expect(scanStep).toBeDefined();
      expect(scanStep?.status).toBe("success");
    });

    it("should have analyze step", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      const analyzeStep = result.steps.find(s => s.name === "analyze");
      expect(analyzeStep).toBeDefined();
      expect(analyzeStep?.status).toBe("success");
    });

    it("should have readiness step", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      const readinessStep = result.steps.find(s => s.name === "readiness");
      expect(readinessStep).toBeDefined();
    });

    it("should mark readiness step as failure when critical findings exist", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateWorkflowEvidence(findings);

      const readinessStep = result.steps.find(s => s.name === "readiness");
      expect(readinessStep?.status).toBe("failure");
    });

    it("should mark readiness step as success when no critical findings", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      const readinessStep = result.steps.find(s => s.name === "readiness");
      expect(readinessStep?.status).toBe("success");
    });

    it("should mark readiness step as success when only high findings", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "auth", severity: "high", confidence: 0.8, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateWorkflowEvidence(findings);

      const readinessStep = result.steps.find(s => s.name === "readiness");
      expect(readinessStep?.status).toBe("success");
    });
  });

  describe("Step duration validation", () => {
    it("should have positive duration_ms for all steps", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      for (const step of result.steps) {
        expect(step.duration_ms).toBeGreaterThan(0);
      }
    });

    it("should have realistic duration values", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      for (const step of result.steps) {
        expect(step.duration_ms).toBeLessThan(100000); // Less than 100 seconds
      }
    });
  });

  describe("Overall status determination", () => {
    it("should set overall_status to success when all steps succeed", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(result.overall_status).toBe("success");
      expect(result.steps.every(s => s.status === "success")).toBe(true);
    });

    it("should set overall_status to failure when readiness step fails", () => {
      const findings = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const result = generateWorkflowEvidence(findings);

      expect(result.overall_status).toBe("failure");
    });

    it("should set overall_status based on critical findings", () => {
      const findingsWithCritical = createMockFindings({
        findings: [
          { id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 0.9, title: "T1", summary: "S1", evidence: [] },
        ],
      });
      const findingsNoCritical = createMockFindings();

      const resultWithCritical = generateWorkflowEvidence(findingsWithCritical);
      const resultNoCritical = generateWorkflowEvidence(findingsNoCritical);

      expect(resultWithCritical.overall_status).toBe("failure");
      expect(resultNoCritical.overall_status).toBe("success");
    });
  });

  describe("Evidence references", () => {
    it("should include findings.json in evidence_refs", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(result.evidence_refs).toContain("findings.json");
    });

    it("should include risk-register.yaml in evidence_refs", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(result.evidence_refs).toContain("risk-register.yaml");
    });

    it("should include release-readiness.json in evidence_refs", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(result.evidence_refs).toContain("release-readiness.json");
    });

    it("should have exactly 3 evidence refs", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      expect(result.evidence_refs.length).toBe(3);
    });
  });

  describe("Step artifacts produced", () => {
    it("should have correct artifacts for scan step", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      const scanStep = result.steps.find(s => s.name === "scan");
      expect(scanStep?.artifacts_produced).toContain("repo-graph.json");
    });

    it("should have correct artifacts for analyze step", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      const analyzeStep = result.steps.find(s => s.name === "analyze");
      expect(analyzeStep?.artifacts_produced).toContain("findings.json");
      expect(analyzeStep?.artifacts_produced).toContain("risk-register.yaml");
    });

    it("should have correct artifacts for readiness step", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      const readinessStep = result.steps.find(s => s.name === "readiness");
      expect(readinessStep?.artifacts_produced).toContain("release-readiness.json");
    });

    it("should have artifacts_produced as array of strings", () => {
      const findings = createMockFindings();
      const result = generateWorkflowEvidence(findings);

      for (const step of result.steps) {
        for (const artifact of step.artifacts_produced) {
          expect(typeof artifact).toBe("string");
        }
      }
    });
  });

  describe("Workflow run ID linkage", () => {
    it("should use findings run_id as workflow_run_id", () => {
      const findings = createMockFindings({ run_id: "custom-run-id" });
      const result = generateWorkflowEvidence(findings);

      expect(result.workflow_run_id).toBe("custom-run-id");
    });
  });
});