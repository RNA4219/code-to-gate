import { describe, expect, it } from "vitest";
import type { HashService } from "../../../types/contracts.js";
import {
  createAssuranceFinding,
  createAssuranceUnsupportedClaim,
} from "../finding-factory.js";

// Inline mock to avoid dependency boundary violation (application tests should not import from adapters)
const mockHashService: HashService = {
  sha256(value: string): string {
    // Mock that produces 64-char hex-like output matching SHA-256 pattern
    // Use value length to generate deterministic but unique hash
    const base = value.length.toString(16).padStart(8, "0");
    // Repeat to get 64 characters (8 * 8 = 64)
    return base.repeat(8);
  },
  fingerprint(value: string): string {
    // Return 16-char hex-like string
    return value.length.toString(16).padStart(16, "0").slice(0, 16);
  },
};

describe("assurance finding factory", () => {
  it("creates a schema-compatible review-required finding", () => {
    const finding = createAssuranceFinding(
      {
        ruleId: "VALIDATION_REMOVED",
        title: "Validation removal candidate",
        summary: "No equivalent validation signal was recovered.",
        evidence: [{ path: "src\\api.ts", kind: "diff", startLine: 12, endLine: 15 }],
        affectedSymbols: ["validateInput"],
        tags: ["diff-semantic-candidate", "custom-tag"],
        baseRef: "main",
        headRef: "HEAD",
      },
      mockHashService
    );

    expect(finding.id).toMatch(/^assurance-validation-removed-[0-9a-f]{16}$/);
    expect(finding.fingerprint).toBeUndefined();
    expect(finding.title).toBe("Review required: Validation removal candidate");
    expect(finding.summary).toBe("Review required: No equivalent validation signal was recovered.");
    expect(finding.category).toBe("security");
    expect(finding.severity).toBe("high");
    expect(finding.confidence).toBe(0.8);
    expect(finding.tags).toEqual([
      "assurance-smell",
      "custom-tag",
      "diff-semantic-candidate",
      "review-required",
      "validation-removed",
    ]);
    expect(finding.evidence).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^evidence-assurance-validation-removed-/),
        path: "src/api.ts",
        kind: "diff",
        startLine: 12,
        endLine: 15,
      }),
    ]);
  });

  it("generates the same identity when line numbers or input order change", () => {
    const first = createAssuranceFinding(
      {
        ruleId: "EVIDENCE_MISSING",
        title: "Evidence gap candidate",
        summary: "An evidence reference needs review.",
        evidence: [
          { path: "src/z.ts", kind: "text", startLine: 20 },
          { path: "src/a.ts", kind: "external", externalRef: { tool: "intake" } },
        ],
        affectedEntrypoints: ["api", "worker"],
      },
      mockHashService
    );
    const second = createAssuranceFinding(
      {
        ruleId: "EVIDENCE_MISSING",
        title: "Evidence gap candidate",
        summary: "An evidence reference needs review.",
        evidence: [
          { path: "src/a.ts", kind: "external", externalRef: { tool: "intake" } },
          { path: "src/z.ts", kind: "text", startLine: 99 },
        ],
        affectedEntrypoints: ["worker", "api"],
      },
      mockHashService
    );

    expect(second.id).toBe(first.id);
    expect(second.evidence.map((evidence) => evidence.path)).toEqual(["src/a.ts", "src/z.ts"]);
  });

  it("distinguishes candidates for different symbols in the same file", () => {
    const createForSymbol = (symbolId: string) =>
      createAssuranceFinding(
        {
          ruleId: "VALIDATION_REMOVED",
          title: "Validation removal candidate",
          summary: "A validation signal needs review.",
          evidence: [{ path: "src/api.ts", kind: "diff", symbolId }],
        },
        mockHashService
      );

    expect(createForSymbol("validateUser").id).not.toBe(createForSymbol("validateOrder").id);
  });

  it("deduplicates evidence and preserves explicit excerpt hashes", () => {
    const finding = createAssuranceFinding(
      {
        ruleId: "GUARD_WEAKENED",
        title: "Guard gap candidate",
        summary: "A guard signal needs review.",
        evidence: [
          { path: "src/auth.ts", kind: "diff", symbolId: "guard", excerptHash: "known" },
          { path: "src/auth.ts", kind: "diff", symbolId: "guard", excerptHash: "known" },
        ],
      },
      mockHashService
    );

    expect(finding.evidence).toHaveLength(1);
    expect(finding.evidence[0].excerptHash).toBe("known");
  });

  it("fills text excerpt hashes and enforces evidence schema requirements", () => {
    const finding = createAssuranceFinding(
      {
        ruleId: "EVIDENCE_MISSING",
        title: "Evidence gap candidate",
        summary: "Evidence needs review.",
        evidence: [{ path: "findings.json", kind: "text" }],
      },
      mockHashService
    );

    expect(finding.evidence[0].excerptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(() =>
      createAssuranceFinding(
        {
          ruleId: "EVIDENCE_MISSING",
          title: "Evidence gap candidate",
          summary: "Evidence needs review.",
          evidence: [{ path: "intake.json", kind: "external" }],
        },
        mockHashService
      )
    ).toThrow("External evidence requires an externalRef");
  });

  it("rejects candidates without evidence", () => {
    expect(() =>
      createAssuranceFinding(
        {
          ruleId: "EVIDENCE_MISSING",
          title: "Evidence gap candidate",
          summary: "Evidence is required.",
          evidence: [],
        },
        mockHashService
      )
    ).toThrow("Assurance findings require at least one evidence reference");
  });

  it("rejects confidence values outside the schema range", () => {
    expect(() =>
      createAssuranceFinding(
        {
          ruleId: "EVIDENCE_MISSING",
          title: "Evidence gap candidate",
          summary: "Evidence needs review.",
          evidence: [{ path: "findings.json", kind: "external", externalRef: { tool: "bundle" } }],
          confidence: 1.1,
        },
        mockHashService
      )
    ).toThrow("Assurance finding confidence must be between 0 and 1");
  });

  it("creates stable schema-compatible unsupported claims", () => {
    const first = createAssuranceUnsupportedClaim(
      {
        ruleId: "RISK_WITHOUT_TEST",
        claim: "Risk/test linkage could not be evaluated.",
        reason: "partial_input",
        sourceSection: "risk-register.yaml",
      },
      mockHashService
    );
    const second = createAssuranceUnsupportedClaim(
      {
        ruleId: "RISK_WITHOUT_TEST",
        claim: "Risk/test linkage could not be evaluated.",
        reason: "partial_input",
        sourceSection: "risk-register.yaml",
      },
      mockHashService
    );

    expect(first).toEqual(second);
    expect(first.id).toMatch(/^unsupported-risk-without-test-[0-9a-f]{16}$/);
    expect(first.reason).toBe("missing_evidence");
  });
});
