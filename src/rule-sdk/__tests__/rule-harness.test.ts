import { describe, expect, it } from "vitest";

import {
  createEvidence,
  generateFindingId,
  runRuleFixture,
  type Finding,
  type RuleContext,
  type RulePlugin,
} from "../index.js";

const MARKER_RULE: RulePlugin = {
  id: "MARKER_RULE",
  name: "Marker Rule",
  description: "Detects fixture markers.",
  category: "testing",
  defaultSeverity: "medium",
  defaultConfidence: 0.8,
  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];
    for (const file of context.graph.files) {
      const content = context.getFileContent(file.path);
      if (!content?.includes("CTG_RULE_MATCH")) continue;

      findings.push({
        id: generateFindingId("MARKER_RULE", file.path, 1),
        ruleId: "MARKER_RULE",
        category: "testing",
        severity: "medium",
        confidence: 0.8,
        title: "Marker detected",
        summary: `Marker detected in ${file.path}`,
        evidence: [createEvidence(file.path, 1, 1, "text", "CTG_RULE_MATCH")],
      });
    }
    return findings;
  },
};

describe("rule fixture harness", () => {
  it("runs a rule against in-memory fixture files", () => {
    const findings = runRuleFixture(MARKER_RULE, [
      { path: "src/positive.ts", content: "const value = 'CTG_RULE_MATCH';\n" },
      { path: "src/negative.ts", content: "const value = 'ordinary';\n" },
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "MARKER_RULE",
      category: "testing",
      severity: "medium",
    });
    expect(findings[0].evidence[0]).toMatchObject({
      path: "src/positive.ts",
      kind: "text",
    });
  });

  it("infers fixture graph metadata needed by rules", () => {
    const findings = runRuleFixture(MARKER_RULE, [
      { path: "src/positive.tsx", content: "CTG_RULE_MATCH\n", role: "source" },
    ]);

    expect(findings).toHaveLength(1);
  });
});
