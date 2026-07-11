import { describe, expect, it } from "vitest";
import {
  generateGatefieldResult,
  generateGatefieldResultV1,
  generateManualBbSeed,
  generateManualBbSeedV1,
  generateQeos039040ManualBbSeedV1,
  generateSarif,
  generateStateGateEvidence,
  generateStateGateEvidenceV1,
  generateWorkflowEvidence,
  generateWorkflowEvidenceV1,
} from "../export-generators.js";
import { createMockFinding, createMockFindingsArtifact } from "../../test-utils/index.js";

function artifact(kind: "clean" | "high" | "critical") {
  if (kind === "clean") return createMockFindingsArtifact({ run_id: "clean", findings: [] });
  return createMockFindingsArtifact({
    run_id: kind,
    findings: [
      createMockFinding(kind, "security", {
        id: kind + "-security",
        ruleId: kind === "critical" ? "CRITICAL_RULE" : "HIGH_RULE",
        evidence: [{ id: "e1", path: "src/security.ts", kind: "text" }],
      }),
      createMockFinding("high", "auth", {
        id: "weak-auth", ruleId: "WEAK_AUTH_GUARD", confidence: 0.6, evidence: [],
      }),
      createMockFinding("medium", "testing", {
        id: "testing", ruleId: "TEST_GAP",
        evidence: [{ id: "e2", path: "test/app.test.ts", startLine: 1, kind: "test" }],
      }),
      createMockFinding("medium", "testing", {
        id: "testing-empty", ruleId: "TEST_GAP_EMPTY", evidence: [],
      }),
      createMockFinding("low", "maintainability", {
        id: "maintainability", ruleId: "LARGE_MODULE",
        evidence: [{ id: "e3", path: "src/large.ts", startLine: 4, kind: "text" }],
      }),
      createMockFinding("high", "payment", {
        id: "price", ruleId: "CLIENT_TRUSTED_PRICE",
        evidence: [{ id: "e4", path: "src/payment.ts", startLine: 8, kind: "text" }],
      }),
    ],
  });
}

describe("export generators", () => {
  it("covers clean, warning, and blocked V1 outputs", () => {
    const clean = artifact("clean");
    const high = artifact("high");
    const critical = artifact("critical");
    expect(generateGatefieldResultV1(clean)).toMatchObject({
      status: "passed", non_binding_gate_hint: "pass",
    });
    expect(generateGatefieldResultV1(high)).toMatchObject({
      status: "warning", non_binding_gate_hint: "hold",
    });
    expect(generateGatefieldResultV1(critical)).toMatchObject({
      status: "blocked_input", non_binding_gate_hint: "block",
    });
    expect(generateStateGateEvidenceV1(clean).approval_relevance)
      .toEqual({ requires_human_attention: false, reasons: [] });
    expect(generateStateGateEvidenceV1(high)).toMatchObject({
      release_readiness: { status: "needs_review" },
    });
    expect(generateStateGateEvidenceV1(critical)).toMatchObject({
      release_readiness: { status: "blocked_input" },
    });
    expect(generateWorkflowEvidenceV1(clean).summary.status).toBe("passed");
    expect(generateWorkflowEvidenceV1(high).summary.status).toBe("needs_review");
    expect(generateWorkflowEvidenceV1(critical).summary.status).toBe("blocked_input");
  });

  it("covers manual BB gaps and QEOS seeds", () => {
    const seed = generateManualBbSeedV1(artifact("critical"));
    expect(seed.risk_seeds.length).toBeGreaterThan(1);
    expect(seed.known_gaps.length).toBeGreaterThan(0);
    expect(seed.oracle_gaps).toEqual(expect.arrayContaining([
      expect.stringContaining("Pen-test"),
      expect.stringContaining("Manual verification"),
    ]));
    expect(seed.scope.affected_entrypoints).toContain("test/app.test.ts");
    expect(generateQeos039040ManualBbSeedV1(artifact("clean")).risk_seeds[0].evidence)
      .toContain("clean");
    expect(generateQeos039040ManualBbSeedV1(artifact("high")).risk_seeds[0].evidence.length)
      .toBeGreaterThan(2);
  });

  it("covers deprecated formats and manual expected-result branches", () => {
    const clean = artifact("clean");
    const high = artifact("high");
    const critical = artifact("critical");
    expect(generateGatefieldResult(clean)).toMatchObject({
      status: "passed", blocking_reasons: [],
    });
    expect(generateGatefieldResult(high).status).toBe("needs_review");
    expect(generateGatefieldResult(critical).status).toBe("blocked_input");
    expect(generateStateGateEvidence(clean).confidence_score).toBe(1);
    expect(generateStateGateEvidence(high).evidence_data.readiness_status).toBe("needs_review");
    expect(generateStateGateEvidence(critical).evidence_data.readiness_status).toBe("blocked_input");
    const manual = generateManualBbSeed(critical);
    expect(manual.test_cases.map((item) => item.risk_area)).toEqual(
      expect.arrayContaining(["authentication", "payment", "security"])
    );
    expect(manual.test_cases.map((item) => item.expected_result)).toEqual(
      expect.arrayContaining([
        "Server should reject client-supplied price",
        "Authentication should be required",
        "Expected behavior based on finding",
      ])
    );
    expect(generateManualBbSeed(createMockFindingsArtifact({
      findings: [createMockFinding("medium", "maintainability")],
    })).test_cases[0].id).toContain("bb-general-");
    expect(generateManualBbSeed(clean).test_cases).toEqual([]);
    expect(generateWorkflowEvidence(clean).overall_status).toBe("success");
    expect(generateWorkflowEvidence(critical).overall_status).toBe("failure");
  });

  it("deduplicates SARIF rules and keeps optional evidence lines", () => {
    const source = artifact("critical");
    source.findings.push({
      ...source.findings[0],
      id: "duplicate-rule",
      evidence: [{
        id: "duplicate-evidence", path: "src/duplicate.ts",
        startLine: 2, endLine: 3, kind: "text",
      }],
    });
    const sarif = generateSarif(source);
    expect(sarif.runs[0].tool.driver.rules.length).toBeLessThan(source.findings.length);
    expect(sarif.runs[0].results.some(
      (result) => result.locations.some(
        (location) => location.physicalLocation.region.endLine === 3
      )
    )).toBe(true);
  });
});
