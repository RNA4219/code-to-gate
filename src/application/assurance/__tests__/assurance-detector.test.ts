import { describe, expect, it } from "vitest";
import type { Finding } from "../../../types/artifacts.js";
import type { HashService } from "../../../types/contracts.js";
import { inspectAssurance } from "../assurance-detector.js";
import type { AssuranceRuleEvaluator } from "../detection-rules.js";

const hashService: HashService = {
  sha256: (value) => value,
  fingerprint: (value) => value.slice(0, 16),
};

function finding(id: string, confidence: number, severity: Finding["severity"]): Finding {
  return {
    id,
    ruleId: "EVIDENCE_MISSING",
    category: "release-risk",
    severity,
    confidence,
    title: "Review required: test",
    summary: "Review required: test",
    evidence: [{ id: `ev-${id}`, path: "findings.json", kind: "external", externalRef: { tool: "test" } }],
    tags: ["assurance-smell", "review-required"],
  };
}

function rule(candidates: Finding[]): AssuranceRuleEvaluator {
  return {
    ruleId: "EVIDENCE_MISSING",
    evaluate: () => ({ ruleId: "EVIDENCE_MISSING", candidates, unsupportedClaims: [] }),
  };
}

describe("inspectAssurance", () => {
  it("filters, deduplicates, sorts, and truncates deterministically", () => {
    const result = inspectAssurance({}, hashService, {
      minConfidence: 0.6,
      candidateLimit: 2,
      rules: [rule([
        finding("medium", 0.8, "medium"),
        finding("critical", 0.9, "critical"),
        finding("low-confidence", 0.5, "high"),
        finding("critical", 0.9, "critical"),
        finding("high", 0.8, "high"),
      ])],
    });

    expect(result.candidates.map((item) => item.id)).toEqual(["critical", "high"]);
    expect(result.truncated).toBe(true);
    expect(result.executedRuleIds).toEqual(["EVIDENCE_MISSING"]);
  });

  it("rejects invalid options", () => {
    expect(() => inspectAssurance({}, hashService, { minConfidence: 2 })).toThrow();
    expect(() => inspectAssurance({}, hashService, { candidateLimit: 0 })).toThrow();
  });
});
