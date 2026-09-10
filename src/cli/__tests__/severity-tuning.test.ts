import { describe, expect, it } from "vitest";
import { analyzeCommand } from "../analyze.js";
import { readinessCommand } from "../readiness.js";
import { EXIT, VERSION, getOption } from "../exit-codes.js";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

const exit = { ...EXIT };

function policyYaml(policyId = "severity-cli-test", withOverride = true): string {
  const override = withOverride ? `severity_overrides:
  - path: "**"
    severity: low
    reason: CLI severity tuning test
` : "";
  return `version: ctg/v1
policy_id: ${policyId}
blocking:
  severity:
    critical: false
    high: false
    medium: false
    low: false
  category:
    auth: false
    payment: false
    validation: false
    data: false
    config: false
    maintainability: false
    testing: false
    compatibility: false
    release-risk: false
    security: false
${override}
`;
}

function writeFindings(dir: string, severity: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "findings.json"), JSON.stringify({
    version: "ctg/v1", generated_at: new Date().toISOString(), run_id: "baseline-test",
    repo: { root: dir }, tool: { name: "code-to-gate", version: VERSION, plugin_versions: [] },
    artifact: "findings", schema: "findings@v1", completeness: "complete", unsupported_claims: [],
    findings: [{ id: "same", ruleId: "R", category: "security", severity, confidence: 1,
      title: "x", summary: "x", fingerprint: "baseline-tuning01", evidence: [{ id: "e", path: "src/a.ts", kind: "text" }] }],
  }), "utf8");
}

describe("severity tuning CLI integration", () => {
  it("keeps raw detection severity while writing effective findings", async () => {
    const root = path.join(tmpdir(), `ctg-severity-cli-${Date.now()}`);
    const out = path.join(root, "out");
    mkdirSync(root, { recursive: true });
    try {
      writeFileSync(path.join(root, "policy.yaml"), policyYaml(), "utf8");
      const fixture = path.resolve(import.meta.dirname, "../../../fixtures/demo-shop-ts");
      const result = await analyzeCommand([
        fixture, "--policy", path.join(root, "policy.yaml"), "--out", out,
        "--llm-provider", "deterministic", "--llm-mode", "local-only", "--cache", "disabled", "--emit", "all",
      ], { VERSION, EXIT: exit, getOption });
      expect(result).toBe(EXIT.OK);
      const raw = JSON.parse(readFileSync(path.join(out, "raw-findings.json"), "utf8"));
      const effective = JSON.parse(readFileSync(path.join(out, "findings.json"), "utf8"));
      expect(effective.findings.length).toBe(raw.findings.length);
      expect(effective.findings.length).toBeGreaterThan(0);
      for (const finding of effective.findings) {
        expect(finding.severity).toBe("low");
        expect(finding.originalSeverity).toBeDefined();
        expect(finding.severityResolution.reason).toBe("CLI severity tuning test");
      }
      for (const finding of raw.findings) expect(finding.originalSeverity).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps raw counts in Markdown and self-analysis when suppression removes findings", async () => {
    const root = path.join(tmpdir(), `ctg-severity-raw-report-${Date.now()}`);
    const out = path.join(root, "out");
    mkdirSync(root, { recursive: true });
    try {
      const policyPath = path.join(root, "policy.yaml");
      const suppressionsPath = path.join(root, "suppressions.yaml");
      writeFileSync(policyPath, policyYaml(), "utf8");
      writeFileSync(suppressionsPath, `version: ctg/v1
suppressions:
  - rule_id: CLIENT_TRUSTED_PRICE
    path: "**"
    reason: raw report test
`, "utf8");
      const fixture = path.resolve(import.meta.dirname, "../../../fixtures/demo-shop-ts");
      const result = await analyzeCommand([
        fixture, "--policy", policyPath, "--suppress", suppressionsPath, "--out", out,
        "--llm-provider", "deterministic", "--llm-mode", "local-only", "--cache", "disabled", "--emit", "all",
      ], { VERSION, EXIT: exit, getOption });
      expect(result).toBe(EXIT.OK);
      const raw = JSON.parse(readFileSync(path.join(out, "raw-findings.json"), "utf8"));
      const effective = JSON.parse(readFileSync(path.join(out, "findings.json"), "utf8"));
      const debt = JSON.parse(readFileSync(path.join(out, "self-analysis-debt.json"), "utf8"));
      const markdown = readFileSync(path.join(out, "analysis-report.md"), "utf8");
      expect(raw.findings.length).toBeGreaterThan(effective.findings.length);
      expect(debt.rawFindings.total).toBe(raw.findings.length);
      expect(debt.effectiveFindings.total).toBe(effective.findings.length);
      expect(markdown).toContain(`| Total Raw Findings | ${raw.findings.length} |`);
      expect(markdown).toContain(`| High | ${raw.bySeverity.high} |`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("normalizes current and baseline with the same policy before ratchet", async () => {
    const root = path.join(tmpdir(), `ctg-severity-baseline-${Date.now()}`);
    const current = path.join(root, "current");
    const baseline = path.join(root, "baseline");
    const out = path.join(root, "out");
    mkdirSync(root, { recursive: true });
    try {
      writeFileSync(path.join(root, "package.json"), "{}", "utf8");
      writeFileSync(path.join(root, "policy.yaml"), policyYaml("baseline-policy"), "utf8");
      writeFindings(current, "high");
      writeFindings(baseline, "medium");
      const result = await readinessCommand([root, "--policy", path.join(root, "policy.yaml"), "--from", current, "--baseline", path.join(baseline, "findings.json"), "--out", out], { VERSION, EXIT: exit, getOption });
      const readiness = JSON.parse(readFileSync(path.join(out, "release-readiness.json"), "utf8"));
      expect(result).toBe(EXIT.OK);
      expect(readiness.baseline.worsenedFindings).toBe(0);
      expect(readiness.baseline.gatedFindingIds).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("restores original severity when a previously stored override is removed", async () => {
    const root = path.join(tmpdir(), `ctg-severity-removed-${Date.now()}`);
    const current = path.join(root, "current");
    const baseline = path.join(root, "baseline");
    const out = path.join(root, "out");
    mkdirSync(root, { recursive: true });
    try {
      writeFileSync(path.join(root, "policy.yaml"), policyYaml("removed-policy", false), "utf8");
      writeFindings(current, "low");
      writeFindings(baseline, "low");
      for (const directory of [current, baseline]) {
        const file = path.join(directory, "findings.json");
        const artifact = JSON.parse(readFileSync(file, "utf8"));
        artifact.findings[0].originalSeverity = "high";
        artifact.findings[0].severityResolution = {
          policyId: "old-policy", originalSeverity: "high", severity: "low", reason: "old", matchedSelectors: { path: "**" },
        };
        writeFileSync(file, JSON.stringify(artifact), "utf8");
      }
      const result = await readinessCommand([root, "--policy", path.join(root, "policy.yaml"), "--from", current, "--baseline", path.join(baseline, "findings.json"), "--out", out], { VERSION, EXIT: exit, getOption });
      const readiness = JSON.parse(readFileSync(path.join(out, "release-readiness.json"), "utf8"));
      expect(result).toBe(EXIT.OK);
      expect(readiness.baseline.worsenedFindings).toBe(0);
      expect(readiness.counts.high).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["version", "version: ctg/invalid\npolicy_id: named-policy\n"],
    ["DSL action", "version: ctg/v1\npolicy_id: named-policy\ndsl:\n  rules:\n    - id: invalid-rule\n      action: invalid-action\n      when:\n        severity: high\n"],
    ["DSL category", "version: ctg/v1\npolicy_id: named-policy\ndsl:\n  rules:\n    - id: invalid-rule\n      action: block\n      when:\n        category: invalid-category\n"],
    ["count threshold", "version: ctg/v1\npolicy_id: named-policy\nblocking:\n  count_threshold:\n    high_max: nope\n"],
    ["confidence", "version: ctg/v1\npolicy_id: named-policy\nconfidence:\n  min_confidence: Infinity\n"],
    ["version type", "version: 1\npolicy_id: named-policy\n"],
    ["YAML syntax", "version: [\npolicy_id: named-policy\n"],
  ])("rejects invalid %s even when a policy ID exists", async (_label, content) => {
    const root = mkdtempSync(path.join(tmpdir(), "ctg-policy-invalid-"));
    const fixture = path.resolve(import.meta.dirname, "../../../fixtures/demo-shop-ts");
    const policyPath = path.join(root, "policy.yaml");
    try {
      writeFileSync(policyPath, content, "utf8");
      const analyzeOut = path.join(root, "analyze-out");
      expect(await analyzeCommand([
        fixture, "--policy", policyPath, "--out", analyzeOut,
        "--llm-provider", "deterministic", "--llm-mode", "local-only", "--cache", "disabled",
      ], { VERSION, EXIT: exit, getOption })).toBe(EXIT.POLICY_FAILED);
      expect(existsSync(analyzeOut)).toBe(false);
      const readinessOut = path.join(root, "readiness-out");
      expect(await readinessCommand([
        root, "--policy", policyPath, "--from", root, "--out", readinessOut,
      ], { VERSION, EXIT: exit, getOption })).toBe(EXIT.POLICY_FAILED);
      expect(existsSync(readinessOut)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed on invalid severity override YAML", async () => {
    const root = path.join(tmpdir(), `ctg-severity-invalid-${Date.now()}`);
    const out = path.join(root, "out");
    mkdirSync(root, { recursive: true });
    try {
      writeFileSync(path.join(root, "policy.yaml"), "version: ctg/v1\npolicy_id: bad\nseverity_overrides: null\n", "utf8");
      const result = await readinessCommand([root, "--policy", path.join(root, "policy.yaml"), "--from", root, "--out", out], { VERSION, EXIT: exit, getOption });
      expect(result).toBe(EXIT.POLICY_FAILED);
      expect(existsSync(path.join(out, "release-readiness.json"))).toBe(false);

      writeFileSync(path.join(root, "policy.yaml"), "version: ctg/v1\npolicy_id: bad\n\"severity_overrides\": [\n", "utf8");
      expect(await readinessCommand([root, "--policy", path.join(root, "policy.yaml"), "--from", root, "--out", out], { VERSION, EXIT: exit, getOption })).toBe(EXIT.POLICY_FAILED);

      writeFileSync(path.join(root, "policy.yaml"), "{version: ctg/v1, policy_id: bad, severity_overrides: [}\n", "utf8");
      expect(await readinessCommand([root, "--policy", path.join(root, "policy.yaml"), "--from", root, "--out", out], { VERSION, EXIT: exit, getOption })).toBe(EXIT.POLICY_FAILED);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
