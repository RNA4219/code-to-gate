import { describe, expect, it } from "vitest";
import { applyLlmEnrichment } from "../llm-enrichment.js";
import type { FindingsArtifact } from "../../types/artifacts.js";

function createFindings(): FindingsArtifact {
  return {
    version: "ctg/v1",
    generated_at: "2025-01-01T00:00:00Z",
    run_id: "run-001",
    repo: { root: "/test/repo" },
    tool: {
      name: "code-to-gate",
      version: "0.1.0",
      plugin_versions: [],
    },
    artifact: "findings",
    schema: "findings@v1",
    completeness: "complete",
    findings: [
      {
        id: "finding-auth-001",
        ruleId: "WEAK_AUTH_GUARD",
        category: "auth",
        severity: "high",
        confidence: 0.85,
        title: "Weak auth guard",
        summary: "Admin route is not protected.",
        evidence: [{ id: "e1", path: "src/auth/admin.ts", kind: "text" }],
      },
    ],
    unsupported_claims: [],
  };
}

describe("llm-enrichment", () => {
  it("reflects supported LLM claims on matching findings", () => {
    const enriched = applyLlmEnrichment(
      createFindings(),
      "Authentication-related code detected. Verify security best practices.",
      "deterministic"
    );

    expect(enriched.findings[0].tags).toContain("llm-reviewed");
    expect(enriched.findings[0].tags).toContain("llm-provider:deterministic");
    expect(enriched.findings[0].summary).toContain("LLM review:");
    expect(enriched.unsupported_claims).toHaveLength(0);
  });

  it("keeps ungrounded LLM claims as unsupported claims", () => {
    const enriched = applyLlmEnrichment(
      createFindings(),
      "Payment gateway settlement failure detected in provider callbacks.",
      "deterministic"
    );

    expect(enriched.findings[0].tags).not.toContain("llm-reviewed");
    expect(enriched.unsupported_claims).toHaveLength(1);
    expect(enriched.unsupported_claims[0].reason).toBe("missing_evidence");
  });
});
