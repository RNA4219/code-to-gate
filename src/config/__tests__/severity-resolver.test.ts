import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Finding } from "../../types/artifacts.js";
import { createDefaultPolicy } from "../policy-types.js";
import { parseYamlPolicy } from "../policy-yaml-parser.js";
import { loadPolicyFile, validatePolicy } from "../policy-loader.js";
import { evaluatePolicy } from "../policy-evaluator.js";
import { resolveSeverities } from "../severity-resolver.js";

const finding: Finding = {
  id: "f1", ruleId: "R1", category: "security", severity: "critical", confidence: 1,
  title: "finding", summary: "finding", evidence: [{ id: "e1", path: "src/a.ts", kind: "text" }],
};

function policy() {
  const result = createDefaultPolicy();
  result.policyId = "severity-policy";
  result.blocking.severity = { critical: true, high: true, medium: false, low: false };
  result.blocking.category = {};
  result.severityOverrides = [
    { ruleId: "R1", path: "src/**", severity: "low", reason: "first" },
    { ruleId: "R1", severity: "medium", reason: "second" },
  ];
  return result;
}

describe("severity resolver", () => {
  it("uses first match, requires AND selectors, and is idempotent", () => {
    const resolved = resolveSeverities([finding], policy())[0];
    expect(resolved.severity).toBe("low");
    expect(resolved.originalSeverity).toBe("critical");
    expect(resolved.severityResolution?.reason).toBe("first");
    expect(resolveSeverities([resolved], { ...policy(), severityOverrides: [{ ruleId: "R1", severity: "medium", reason: "changed" }] })[0].severity).toBe("medium");
    expect(resolveSeverities([resolved], createDefaultPolicy())[0].severity).toBe("critical");
  });

  it("parses camel/snake aliases and rejects invalid override arguments", () => {
    const parsed = parseYamlPolicy(`version: ctg/v1\npolicy_id: p\nseverity_overrides:\n  - ruleId: R1\n    category: security\n    severity: low\n    reason: test\n`);
    expect(parsed.severityOverrides?.[0]).toMatchObject({ ruleId: "R1", category: "security", severity: "low" });
    expect(() => parseYamlPolicy("severity_overrides:\n  - severity: low\n    reason: missing-selector\n")).toThrow(/selector/);
  });

  it("applies effective severity to policy blocking and count thresholds", () => {
    const result = evaluatePolicy([finding], policy());
    expect(result.blockedFindings).toHaveLength(0);
    expect(result.summary.severityCounts.low).toBe(1);
  });

  it("fails policy validation for malformed programmatic overrides", () => {
    const invalid = { ...policy(), severityOverrides: [{ severity: "invalid", reason: "x" }] } as never;
    expect(validatePolicy(invalid).valid).toBe(false);
  });

  it("returns load errors for malformed override YAML", () => {
    const directory = mkdtempSync(join(tmpdir(), "severity-policy-"));
    try {
      writeFileSync(join(directory, "policy.yml"), "version: ctg/v1\nseverity_overrides: [\n");
      const result = loadPolicyFile("policy.yml", directory);
      expect(result.errors.some((error) => error.includes("severity override"))).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
