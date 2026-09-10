import { describe, expect, it } from "vitest";
import AjvImport from "ajv";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Finding, FindingsArtifact } from "../../types/artifacts.js";
import { validateArtifactObject } from "../../cli/schema-validate.js";
import { createDefaultPolicy, type CtgPolicy, type SeverityOverride } from "../policy-types.js";
import { parseYamlPolicy } from "../policy-yaml-parser.js";
import { evaluatePolicy } from "../policy-evaluator.js";
import { resolveSeverity } from "../severity-resolver.js";

const Ajv = AjvImport.default || AjvImport;
const policySchema = JSON.parse(readFileSync(
  path.resolve(import.meta.dirname, "../../../schemas/policy.schema.json"),
  "utf8",
));
const validatePolicySchema = new Ajv({ allErrors: true, strict: false, validateSchema: false }).compile(policySchema);

const finding: Finding = {
  id: "f-1",
  ruleId: "RULE_ONE",
  category: "security",
  severity: "high",
  confidence: 1,
  title: "finding",
  summary: "finding",
  evidence: [{ id: "e-1", path: "src\\auth\\handler.ts", kind: "ast" }],
};

function policyWith(overrides: SeverityOverride[] = []): CtgPolicy {
  const policy = createDefaultPolicy();
  policy.policyId = "severity-regression";
  policy.blocking = {
    severity: { critical: false, high: false, medium: false, low: false },
    category: {
      auth: false, payment: false, validation: false, data: false, config: false,
      maintainability: false, testing: false, compatibility: false, releaseRisk: false, security: false,
    },
    countThreshold: undefined,
  };
  policy.severityOverrides = overrides;
  return policy;
}

function basePolicy(): Record<string, unknown> {
  return {
    version: "ctg/v1",
    policy_id: "schema-regression",
    blocking: { severity: {}, category: {} },
    confidence: { min_confidence: 0.6 },
  };
}

describe("severity tuning regression boundaries", () => {
  it("requires all selectors, preserves first match, and is idempotent", () => {
    const mismatch = resolveSeverity(finding, policyWith([{
      ruleId: "OTHER", path: "src/**", category: "security", severity: "low", reason: "mismatch",
    }]));
    expect(mismatch).toBe(finding);

    const policy = policyWith([
      { category: "security", severity: "low", reason: "first" },
      { ruleId: "RULE_ONE", severity: "medium", reason: "second" },
    ]);
    const resolved = resolveSeverity(finding, policy);
    expect(resolved).toMatchObject({ severity: "low", originalSeverity: "high" });
    expect(resolveSeverity(resolved, policy)).toEqual(resolved);
  });

  it("keeps plain findings identical without an override and restores them when removed", () => {
    const plain = policyWith();
    expect(resolveSeverity(finding, plain)).toBe(finding);
    expect(JSON.stringify(resolveSeverity(finding, plain))).toBe(JSON.stringify(finding));

    const overridden = resolveSeverity(finding, policyWith([{ category: "security", severity: "low", reason: "temporary" }]));
    expect(resolveSeverity(overridden, plain)).toEqual(finding);
    expect(resolveSeverity(overridden, plain)).not.toHaveProperty("originalSeverity");
    expect(resolveSeverity(overridden, plain)).not.toHaveProperty("severityResolution");
  });

  it("normalizes Windows paths and matches categories", () => {
    const pathResolved = resolveSeverity(finding, policyWith([{ path: "src/auth/**", severity: "low", reason: "path" }]));
    expect(pathResolved.severity).toBe("low");
    const categoryResolved = resolveSeverity({ ...finding, category: "auth" }, policyWith([
      { category: "auth", severity: "medium", reason: "category" },
    ]));
    expect(categoryResolved.severity).toBe("medium");
    expect(parseYamlPolicy('severity_overrides:\n  - path: "src\\\\auth\\\\**"\n    severity: low\n    reason: path').severityOverrides?.[0].path).toBe("src/auth/**");
  });

  it.each([
    ["null selector", "rule_id: null"],
    ["numeric selector", "rule_id: 7"],
    ["empty selector", "category: ''"],
  ])("rejects %s", (_label, selector) => {
    expect(() => parseYamlPolicy(`severity_overrides:\n  - ${selector}\n    path: src/**\n    severity: low\n    reason: invalid`)).toThrow();
  });

  it.each([
    ["both selector spellings", "rule_id: RULE_ONE\n    ruleId: RULE_ONE"],
    ["invalid severity enum", "category: security\n    severity: urgent"],
    ["invalid category enum", "category: unknown\n    severity: low"],
    ["negated glob", "path: \"!src/**\"\n    severity: low"],
  ])("rejects %s", (_label, fields) => {
    expect(() => parseYamlPolicy(`severity_overrides:\n  - ${fields}\n    reason: invalid`)).toThrow();
  });

  it("rejects a null override array", () => {
    expect(() => parseYamlPolicy("severity_overrides: null")).toThrow(/array/);
  });

  it("rejects simultaneous top-level snake and camel override keys", () => {
    expect(() => parseYamlPolicy([
      "severity_overrides:",
      "  - category: security",
      "    severity: low",
      "    reason: snake",
      "severityOverrides:",
      "  - category: security",
      "    severity: low",
      "    reason: camel",
    ].join("\n"))).toThrow(/both/);
  });

  it.each([
    ["snake parent with ruleId item alias", {
      severity_overrides: [{ ruleId: "RULE_ONE", severity: "low", reason: "alias" }],
    }, true],
    ["both top-level aliases", {
      severity_overrides: [{ category: "security", severity: "low", reason: "snake" }],
      severityOverrides: [{ category: "security", severity: "low", reason: "camel" }],
    }, false],
    ["both item aliases", {
      severityOverrides: [{ rule_id: "RULE_ONE", ruleId: "RULE_ONE", severity: "low", reason: "both" }],
    }, false],
    ["blank reason", {
      severity_overrides: [{ path: "src/**", severity: "low", reason: " " }],
    }, false],
    ["negated glob", {
      severity_overrides: [{ path: "!src/**", severity: "low", reason: "negated" }],
    }, false],
  ] as const)("validates policy schema boundary: %s", (_label, overrides, valid) => {
    const candidate = { ...basePolicy(), ...overrides };
    expect(validatePolicySchema(candidate)).toBe(valid);
  });

  it("uses effective severity for DSL and count thresholds", () => {
    const dslPolicy = policyWith([{ ruleId: "RULE_ONE", severity: "low", reason: "tuned" }]);
    dslPolicy.dsl = { rules: [{ id: "low-block", when: { severity: "low" }, action: "block" }] };
    const dsl = evaluatePolicy([finding], dslPolicy);
    expect(dsl.blockedFindings[0]).toMatchObject({ severity: "low" });
    expect(dsl.failedConditions).toContainEqual(expect.objectContaining({ type: "dsl_block" }));

    const thresholdPolicy = policyWith([{ ruleId: "RULE_ONE", severity: "low", reason: "tuned" }]);
    thresholdPolicy.blocking.severity.low = undefined;
    thresholdPolicy.blocking.countThreshold = { lowMax: 0 };
    const threshold = evaluatePolicy([finding], thresholdPolicy);
    expect(threshold.failedConditions).toContainEqual(expect.objectContaining({
      type: "count_threshold", severity: "low", count: 1, threshold: 0,
    }));
  });

  it("accepts optional resolution fields and rejects invalid severity enums in findings schema", async () => {
    const artifact: FindingsArtifact = {
      version: "ctg/v1",
      generated_at: "2026-09-10T00:00:00Z",
      run_id: "severity-regression",
      repo: { root: "." },
      tool: { name: "code-to-gate", version: "1.6.0", plugin_versions: [] },
      artifact: "findings",
      schema: "findings@v1",
      completeness: "complete",
      findings: [{
        ...finding,
        originalSeverity: "high",
        severity: "low",
        severityResolution: {
          policyId: "severity-regression", originalSeverity: "high", severity: "low", reason: "tuned",
          matchedSelectors: { category: "security" },
        },
      }],
      unsupported_claims: [],
    };
    await expect(validateArtifactObject(artifact)).resolves.toMatchObject({ status: "ok" });
    const invalid = structuredClone(artifact) as unknown as Record<string, unknown>;
    (invalid.findings as Array<Record<string, unknown>>)[0].originalSeverity = "urgent";
    await expect(validateArtifactObject(invalid)).resolves.toMatchObject({ status: "error" });
  });
});
