import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { schemaValidate } from "../../cli/schema-validate.js";
import type { Finding } from "../../types/artifacts.js";
import {
  ASSURANCE_FINDING_RULE_IDS,
  ASSURANCE_FINDING_TAGS,
  assuranceFindingTags,
  isAssuranceFindingRuleId,
} from "../../types/assurance-findings.js";

describe("Assurance Finding vocabulary", () => {
  it("defines future assurance-gap rule IDs without detector behavior", () => {
    expect(ASSURANCE_FINDING_RULE_IDS).toContain("INTENT_NOT_RECOVERABLE");
    expect(ASSURANCE_FINDING_RULE_IDS).toContain("RISK_WITHOUT_TEST");
    expect(ASSURANCE_FINDING_RULE_IDS).toContain("RELEASE_DECISION_UNSUPPORTED");
    expect(isAssuranceFindingRuleId("EVIDENCE_MISSING")).toBe(true);
    expect(isAssuranceFindingRuleId("CLIENT_TRUSTED_PRICE")).toBe(false);
  });

  it("represents an assurance gap with the existing Finding shape", () => {
    const finding: Finding = {
      id: "assurance-1",
      ruleId: "RISK_WITHOUT_TEST",
      category: "testing",
      severity: "medium",
      confidence: 0.7,
      title: "Risk/test linkage gap",
      summary: "Review required: no linked test evidence was recovered.",
      evidence: [{ type: "file", path: "docs/risk.md" }],
      tags: assuranceFindingTags(ASSURANCE_FINDING_TAGS.RISK_WITHOUT_TEST),
    };

    expect(finding.tags).toEqual(["assurance-smell", "risk-without-test"]);
    expect(finding.category).toBe("testing");
  });

  it("deduplicates the base assurance-smell tag", () => {
    expect(
      assuranceFindingTags(
        ASSURANCE_FINDING_TAGS.ASSURANCE_SMELL,
        ASSURANCE_FINDING_TAGS.MISSING_EVIDENCE
      )
    ).toEqual(["assurance-smell", "missing-evidence"]);
  });

  it("keeps assurance tags compatible with findings.json schema", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ctg-assurance-"));
    const artifactPath = path.join(dir, "findings.json");
    writeFileSync(artifactPath, JSON.stringify({
      version: "ctg/v1",
      generated_at: "2026-06-08T00:00:00.000Z",
      run_id: "assurance-vocabulary-test",
      repo: { root: "." },
      tool: { name: "code-to-gate", version: "test", plugin_versions: [] },
      artifact: "findings",
      schema: "findings@v1",
      completeness: "complete",
      findings: [{
        id: "assurance-1",
        ruleId: "EVIDENCE_MISSING",
        category: "release-risk",
        severity: "medium",
        confidence: 0.7,
        title: "Evidence gap",
        summary: "Review required: expected evidence was not recovered.",
        evidence: [{ id: "evidence-1", path: "docs/release.md", kind: "ast" }],
        tags: assuranceFindingTags(ASSURANCE_FINDING_TAGS.MISSING_EVIDENCE),
      }],
      unsupported_claims: [],
    }));

    try {
      expect(await schemaValidate(["validate", artifactPath])).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
