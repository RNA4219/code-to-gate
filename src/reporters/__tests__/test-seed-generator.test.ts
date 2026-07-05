/**
 * Tests for Test Seed Generator
 */

import { describe, expect, it } from "vitest";
import { buildTestSeedsFromFindings } from "../test-seed-generator.js";
import type { Finding, FindingsArtifact } from "../../types/artifacts.js";

function createFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "finding-CLIENT_TRUSTED_PRICE-001",
    ruleId: "CLIENT_TRUSTED_PRICE",
    category: "payment",
    severity: "critical",
    confidence: 0.9,
    title: "Client trusted price",
    summary: "Price is trusted from client",
    evidence: [
      {
        id: "evidence-001",
        path: "src/api/order.ts",
        startLine: 10,
        endLine: 12,
        kind: "text",
        excerptHash: "hash",
      },
    ],
    ...overrides,
  };
}

function createFindings(completeness: "complete" | "partial" = "complete"): FindingsArtifact {
  return {
    version: "ctg/v1",
    generated_at: "2026-07-04T00:00:00.000Z",
    run_id: "test-run",
    repo: { root: "/repo" },
    tool: { name: "code-to-gate", version: "1.0.0", plugin_versions: [] },
    artifact: "findings",
    schema: "findings@v1",
    completeness,
    findings: [createFinding()],
    unsupported_claims: [],
  };
}

describe("Test Seed Generator", () => {
  it("inherits partial completeness from findings", () => {
    const seeds = buildTestSeedsFromFindings(createFindings("partial"), "test-run", "/repo");

    expect(seeds.seeds.length).toBeGreaterThan(0);
    expect(seeds.completeness).toBe("partial");
  });
});
