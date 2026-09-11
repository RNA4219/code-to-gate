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
      "    low_max: 4 # inline limit",
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
      "rule_options:",
      "  LARGE_MODULE:",
      "    max_lines: 1200",
      "    max_functions: 45",
      "    max_size_kb: 125.5",
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
    expect(parsed.blocking?.countThreshold?.lowMax).toBe(4);
    expect(parsed.confidence?.filterLow).toBe(true);
    expect(parsed.llm?.mode).toBe("local-only");
    expect(parsed.baseline?.newFindingsBlock).toBe(true);
    expect(parsed.exit?.failOnCritical).toBe(true);
    expect(parsed.ruleOptions?.LARGE_MODULE).toEqual({
      maxLines: 1200,
      maxFunctions: 45,
      maxSizeKB: 125.5,
    });
    expect(parsed.dsl?.rules).toHaveLength(1);
    expect(mergeWithDefaults(parsed).policyId).toBe("custom");
  });

  it("rejects malformed YAML and defaults incomplete policy sections", () => {
    expect(() => parseYamlPolicy("dsl: [invalid")).toThrow();
    expect(parseYamlPolicy("dsl:\n  rules: []").dsl).toEqual({ rules: [] });
    expect(() => parseYamlPolicy("version:\npolicy_id:")).toThrow(/must be a string/);
    const merged = mergeWithDefaults({});
    expect(merged.blocking).toBeDefined();
    expect(merged.blocking.countThreshold).toBeUndefined();
    expect(merged.dsl.rules).toEqual([]);
  });

  it("preserves quoted root scalars containing colons and release-risk category", () => {
    const parsed = parseYamlPolicy([
      'version: "ctg/v1"',
      'policy_id: \'team: review\'',
      "blocking:",
      "  category:",
      "    release-risk: true",
    ].join("\n"));
    expect(parsed.version).toBe("ctg/v1");
    expect(parsed.policyId).toBe("team: review");
    expect(parsed.blocking?.category?.releaseRisk).toBe(true);
  });

  it("keeps inline values and rule keys from the YAML document", () => {
    const parsed = parseYamlPolicy([
      "blocking: { rules: { DEBT_MARKER: true }, severity: { high: false } } # inline policy",
      "confidence: { min_confidence: 0.9 }",
      'suppression: { file: "C:/work/repo/.ctg/suppressions.yaml" }',
    ].join("\n"));

    expect(parsed.blocking?.rules).toEqual({ DEBT_MARKER: true });
    expect(parsed.blocking?.severity?.high).toBe(false);
    expect(parsed.confidence?.minConfidence).toBe(0.9);
    expect(parsed.suppression?.file).toBe("C:/work/repo/.ctg/suppressions.yaml");
  });

  it("treats equivalent YAML layouts and legacy releaseRisk spelling identically", () => {
    const block = [
      'version: "ctg/v1" # schema',
      'policy_id: "layout:policy" # identifier',
      "blocking:",
      "    severity:",
      '        "high": false # explicit false',
      "    category:",
      "        release-risk: true",
      "    rules:",
      "        DEBT_MARKER: true # preserve rule key",
      "    count_threshold:",
      "        high_max: 0 # explicit zero",
      "confidence:",
      "    min_confidence: 0.9",
      "    filter_low: false # retain false",
      'suppression: { file: "C:/work/repo/.ctg/suppressions.yaml" }',
      "llm: { enabled: false, mode: none, min_confidence: 0 }",
      "baseline: { enabled: true }",
      "exit: { warn_only: true }",
    ].join("\n");
    const inlineLegacy = [
      "version: ctg/v1",
      "policy_id: 'layout:policy'",
      "blocking: { severity: { high: false }, category: { releaseRisk: true }, rules: { DEBT_MARKER: true }, count_threshold: { high_max: 0 } }",
      "confidence: { min_confidence: 0.9, filter_low: false }",
      'suppression: { file: "C:/work/repo/.ctg/suppressions.yaml" }',
      "llm: { enabled: false, mode: none, min_confidence: 0 }",
      "baseline: { enabled: true }",
      "exit: { warn_only: true }",
    ].join("\n");
    const select = (content: string) => {
      const parsed = mergeWithDefaults(parseYamlPolicy(content));
      return {
        version: parsed.version,
        policyId: parsed.policyId,
        high: parsed.blocking.severity.high,
        releaseRisk: parsed.blocking.category.releaseRisk,
        debtMarker: parsed.blocking.rules?.DEBT_MARKER,
        highMax: parsed.blocking.countThreshold?.highMax,
        minConfidence: parsed.confidence.minConfidence,
        filterLow: parsed.confidence.filterLow,
        suppressionFile: parsed.suppression?.file,
        llm: parsed.llm,
        baselineEnabled: parsed.baseline?.enabled,
        warnOnly: parsed.exit?.warnOnly,
      };
    };
    expect(select(block)).toEqual(select(inlineLegacy));
    expect(select(block)).toMatchObject({
      high: false,
      releaseRisk: true,
      debtMarker: true,
      highMax: 0,
      minConfidence: 0.9,
      filterLow: false,
      baselineEnabled: true,
      warnOnly: true,
    });
  });

  it.each([
    ["blocking", "blocking: []"],
    ["confidence", "confidence: []"],
    ["suppression", "suppression: []"],
    ["llm", "llm: []"],
    ["baseline", "baseline: []"],
    ["exit", "exit: []"],
  ])("rejects a non-map known section (%s)", (_section, content) => {
    expect(() => parseYamlPolicy(content)).toThrow(/must be an object/);
  });

  it.each([
    ["blocking severity", "blocking: { severity: { high: \"false\" } }", /blocking\.severity\.high must be a boolean/],
    ["blocking category", "blocking: { category: { security: 1 } }", /blocking\.category\.security must be a boolean/],
    ["blocking rule", "blocking: { rules: { DEBT_MARKER: \"true\" } }", /blocking\.rules\.DEBT_MARKER must be a boolean/],
    ["count threshold", "blocking: { count_threshold: { high_max: \"0\" } }", /blocking count threshold high_max must be a number/],
    ["confidence boolean", "confidence: { filter_low: \"false\" }", /confidence\.filter_low must be a boolean/],
    ["confidence number", "confidence: { min_confidence: \"0.9\" }", /confidence\.min_confidence must be a number/],
    ["suppression file", "suppression: { file: 1 }", /suppression\.file must be a string/],
    ["llm enabled", "llm: { enabled: \"false\" }", /llm\.enabled must be a boolean/],
    ["llm mode", "llm: { mode: invalid }", /llm\.mode is invalid/],
    ["baseline enabled", "baseline: { enabled: 1 }", /baseline\.enabled must be a boolean/],
    ["exit boolean", "exit: { warn_only: null }", /exit\.warn_only must be a boolean/],
  ])("rejects an invalid known value (%s)", (_label, content, error) => {
    expect(() => parseYamlPolicy(content)).toThrow(error);
  });

  it.each(["[]", "policy", "null"])("rejects a non-map YAML root: %s", (content) => {
    expect(() => parseYamlPolicy(content)).toThrow(/policy root must be an object/);
  });

  it("parses partial structurally across inline, quoted, and indented YAML", () => {
    const expected = { allowPartial: true, partialWarningThreshold: 0.4 };
    const variants = [
      "partial: { allow_partial: true, partial_warning_threshold: 0.4 }",
      '"partial": { allow_partial: true, partial_warning_threshold: 0.4 } # policy setting',
      ["partial:", "    allow_partial: true # allow bounded scans", "    partial_warning_threshold: 0.4"].join("\n"),
    ];

    for (const content of variants) expect(parseYamlPolicy(content).partial).toEqual(expected);
  });

  it.each([
    ["partial: null", /partial must be an object/],
    ["partial: []", /partial must be an object/],
    ["partial: { allow_partial: \"true\" }", /allow_partial must be a boolean/],
    ["partial: { allow_partial: 1 }", /allow_partial must be a boolean/],
    ["partial: { allow_partial: null }", /allow_partial must be a boolean/],
    ["partial: { partial_warning_threshold: \"0.4\" }", /partial_warning_threshold must be a number/],
    ["partial: { partial_warning_threshold: null }", /partial_warning_threshold must be a number/],
    ["partial: { partial_warning_threshold: [] }", /partial_warning_threshold must be a number/],
  ])("rejects malformed partial shape: %s", (content, error) => {
    expect(() => parseYamlPolicy(content)).toThrow(error);
  });

  it("keeps omitted and empty partial sections compatible with defaults", () => {
    expect(parseYamlPolicy("version: ctg/v1").partial).toBeUndefined();
    expect(mergeWithDefaults(parseYamlPolicy("partial: {}")).partial).toEqual(
      mergeWithDefaults({}).partial,
    );
  });

  it("uses YAML root scalars with comments and escapes", () => {
    const parsed = parseYamlPolicy([
      'version: "ctg/v1" # current schema',
      'policy_id: "team\\nreview" # escaped newline',
    ].join("\n"));
    expect(parsed.version).toBe("ctg/v1");
    expect(parsed.policyId).toBe("team\nreview");

    expect(() => parseYamlPolicy("version: 1\npolicy_id: 42")).toThrow(/version must be a string/);
    expect(() => parseYamlPolicy("version: ctg/v1\npolicy_id: 42")).toThrow(/policy_id must be a string/);
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
