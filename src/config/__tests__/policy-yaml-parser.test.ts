import { describe, expect, it } from "vitest";
import {
  mergeWithDefaults,
  parseSuppressionFile,
  parseYamlPolicy,
} from "../policy-yaml-parser.js";

describe("policy YAML parser", () => {
  it("parses all policy sections and DSL rules", () => {
    const content = [
      "version: ctg.policy/v1",
      "policy_id: custom",
      "blocking:",
      "  severity:",
      "    critical: true",
      "    high: false",
      "    medium: true",
      "    low: false",
      "  category:",
      "    security: true",
      "    auth: false",
      "  rules:",
      "    RULE_ONE: true",
      "  count_threshold:",
      "    critical_max: 1",
      "    high_max: 2",
      "    medium_max: 3",
      "    low_max: 4",
      "confidence:",
      "  min_confidence: 0.8",
      "  low_confidence_threshold: 0.5",
      "  filter_low: true",
      "suppression:",
      "  file: suppressions.yaml",
      "  expiry_warning_days: 10",
      "  max_suppressions_per_rule: 3",
      "llm:",
      "  enabled: true",
      "  mode: local-only",
      "  min_confidence: 0.7",
      "  require_llm: false",
      "  unsupported_claims_max: 2",
      "partial:",
      "  allow_partial: true",
      "  partial_warning_threshold: 0.4",
      "baseline:",
      "  enabled: true",
      "  file: baseline.json",
      "  new_findings_block: true",
      "exit:",
      "  fail_on_critical: true",
      "  fail_on_high: false",
      "  warn_only: false",
      "dsl:",
      "  rules:",
      "    - id: rule-one",
      "      description: rule",
      "      action: block",
      "      reason: reason",
      "      when:",
      "        severity: high",
      "        category: security",
      "        rule_id: RULE_ONE",
      "        baseline: new",
      "        manual_evidence: missing",
    ].join("\n");
    const parsed = parseYamlPolicy(content);
    expect(parsed.version).toBe("ctg.policy/v1");
    expect(parsed.policyId).toBe("custom");
    expect(parsed.blocking?.countThreshold?.highMax).toBe(2);
    expect(parsed.confidence?.filterLow).toBe(true);
    expect(parsed.llm?.mode).toBe("local-only");
    expect(parsed.baseline?.newFindingsBlock).toBe(true);
    expect(parsed.exit?.failOnCritical).toBe(true);
    expect(parsed.dsl?.rules).toHaveLength(1);
    expect(mergeWithDefaults(parsed).policyId).toBe("custom");
  });

  it("falls back safely for malformed or incomplete DSL", () => {
    expect(parseYamlPolicy("dsl: [invalid")).not.toHaveProperty("dsl");
    expect(parseYamlPolicy("dsl:\n  rules: []").dsl).toEqual({ rules: [] });
    expect(parseYamlPolicy("version:\npolicy_id:").version).toBeDefined();
    const merged = mergeWithDefaults({});
    expect(merged.blocking).toBeDefined();
    expect(merged.dsl.rules).toEqual([]);
  });

  it("parses suppression entries, inline fields, classes, and defaults", () => {
    const suppression = parseSuppressionFile([
      "version: ctg.policy/v1",
      "- rule_id: RULE_ONE",
      "  path: src/one.ts",
      "  reason: quoted reason",
      "  expiry: 2027-01-01",
      "  author: tester",
      "  class: accepted-design",
      "- rule_id: RULE_TWO",
      "  path: src/two.ts",
      "  class: invalid-class",
      "- rule_id: INCOMPLETE",
      "  reason: no path",
      "-",
      "  rule_id: RULE_THREE",
      "  path: src/three.ts",
    ].join("\n"));
    expect(suppression.version).toBe("ctg.policy/v1");
    expect(suppression.suppressions).toHaveLength(3);
    expect(suppression.suppressions[0].class).toBe("accepted-design");
    expect(suppression.suppressions[1].class).toBe("temporary-debt");
    expect(suppression.suppressions[2].path).toBe("src/three.ts");
    expect(parseSuppressionFile("- rule_id: ONLY_ID").suppressions).toEqual([]);
    expect(parseSuppressionFile(["-", "  not-a-field"].join("\n")).suppressions).toEqual([]);
  });
});
