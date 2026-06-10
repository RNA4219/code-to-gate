import { describe, expect, it } from "vitest";
import type { ReleaseReadinessArtifact } from "../../../types/artifacts.js";
import type { HashService } from "../../../types/contracts.js";
import { buildAssuranceGraph } from "../assurance-graph.js";
import { releaseDecisionUnsupportedRule } from "../rules/release-decision-unsupported.js";

const hashService: HashService = {
  sha256: (value) => `sha-${value.length}`,
  fingerprint: (value) => `fp-${value.length}`,
};

function readiness(overrides: Partial<ReleaseReadinessArtifact> = {}): ReleaseReadinessArtifact {
  return {
    version: "ctg/v1",
    generated_at: "2026-06-09T00:00:00.000Z",
    run_id: "run-1",
    repo: { root: "." },
    tool: { name: "code-to-gate", version: "1.4.2", plugin_versions: [] },
    artifact: "release-readiness",
    schema: "release-readiness@v1",
    completeness: "complete",
    status: "passed",
    summary: "ready",
    counts: { findings: 0, critical: 0, high: 0, risks: 0, testSeeds: 0, unsupportedClaims: 0 },
    failedConditions: [],
    recommendedActions: [],
    artifactRefs: {},
    ...overrides,
  };
}

describe("RELEASE_DECISION_UNSUPPORTED rule", () => {
  it("creates an unsupported claim when readiness is missing", () => {
    const result = releaseDecisionUnsupportedRule.evaluate(buildAssuranceGraph({}), hashService);
    expect(result.candidates).toHaveLength(0);
    expect(result.unsupportedClaims).toHaveLength(1);
  });

  it("does not challenge non-passing readiness statuses", () => {
    const graph = buildAssuranceGraph({ releaseReadiness: readiness({ status: "needs_review" }) });
    const result = releaseDecisionUnsupportedRule.evaluate(graph, hashService);
    expect(result.candidates).toHaveLength(0);
    expect(result.unsupportedClaims).toHaveLength(0);
  });

  it("does not create a candidate for supported complete readiness", () => {
    const graph = buildAssuranceGraph({ releaseReadiness: readiness() });
    expect(releaseDecisionUnsupportedRule.evaluate(graph, hashService).candidates).toHaveLength(0);
  });

  it("creates one evidence-only candidate for partial passed readiness", () => {
    const graph = buildAssuranceGraph({
      releaseReadiness: readiness({ completeness: "partial", status: "passed_with_risk" }),
    });
    const result = releaseDecisionUnsupportedRule.evaluate(graph, hashService);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].ruleId).toBe("RELEASE_DECISION_UNSUPPORTED");
    expect(result.candidates[0].tags).toContain("review-required");
    expect(result.candidates[0]).not.toHaveProperty("decision");
  });

  it("detects a missing referenced artifact", () => {
    const graph = buildAssuranceGraph({
      releaseReadiness: readiness({ artifactRefs: { findings: "findings.json" } }),
    });
    const result = releaseDecisionUnsupportedRule.evaluate(graph, hashService);
    expect(result.candidates[0].summary).toContain("referenced artifact is not loaded");
  });
});
