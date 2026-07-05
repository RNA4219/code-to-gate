import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { FindingCategory, Severity } from "../rules/index.js";

const VALID_RULE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const CATEGORIES = [
  "auth",
  "payment",
  "validation",
  "data",
  "config",
  "maintainability",
  "testing",
  "compatibility",
  "release-risk",
  "security",
] as const satisfies readonly FindingCategory[];

const SEVERITIES = ["low", "medium", "high", "critical"] as const satisfies readonly Severity[];

export interface RuleScaffoldOptions {
  id: string;
  outRoot: string;
  category?: string;
  severity?: string;
  description?: string;
  force?: boolean;
  cwd?: string;
}

export interface RuleScaffoldResult {
  ruleId: string;
  ruleName: string;
  outputDir: string;
  files: string[];
}

function assertRuleId(id: string): void {
  if (!VALID_RULE_ID.test(id)) {
    throw new Error("rule id must be lowercase kebab-case, for example unsafe-redirect");
  }
}

function parseCategory(category: string | undefined): FindingCategory {
  const value = category ?? "security";
  if (!CATEGORIES.includes(value as FindingCategory)) {
    throw new Error(`invalid category: ${value}. expected one of ${CATEGORIES.join(", ")}`);
  }
  return value as FindingCategory;
}

function parseSeverity(severity: string | undefined): Severity {
  const value = severity ?? "high";
  if (!SEVERITIES.includes(value as Severity)) {
    throw new Error(`invalid severity: ${value}. expected one of ${SEVERITIES.join(", ")}`);
  }
  return value as Severity;
}

function toRuleId(id: string): string {
  return id.toUpperCase().replaceAll("-", "_");
}

function toRuleName(id: string): string {
  return id
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function toConstName(ruleId: string): string {
  return `${ruleId}_RULE`;
}

function ensureWritableTarget(targetDir: string, force: boolean): void {
  if (!existsSync(targetDir)) {
    return;
  }
  const existing = readdirSync(targetDir);
  if (existing.length > 0 && !force) {
    throw new Error(`rule scaffold already exists: ${targetDir}. pass --force to overwrite`);
  }
}

function writeTemplate(targetDir: string, relativePath: string, content: string): string {
  const fullPath = join(targetDir, relativePath);
  mkdirSync(resolve(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  return relativePath.replaceAll("\\", "/");
}

function ruleTemplate(input: {
  constName: string;
  ruleId: string;
  ruleName: string;
  category: FindingCategory;
  severity: Severity;
  description: string;
}): string {
  return `import {
  createEvidence,
  generateFindingId,
  type Finding,
  type RuleContext,
  type RulePlugin,
} from "@quality-harness/code-to-gate/rule-sdk";

const MATCH_PATTERN = /CTG_RULE_MATCH/;

export const ${input.constName}: RulePlugin = {
  id: ${JSON.stringify(input.ruleId)},
  name: ${JSON.stringify(input.ruleName)},
  description: ${JSON.stringify(input.description)},
  category: ${JSON.stringify(input.category)},
  defaultSeverity: ${JSON.stringify(input.severity)},
  defaultConfidence: 0.7,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of context.graph.files) {
      if (file.role !== "source") continue;

      const content = context.getFileContent(file.path);
      if (!content || !MATCH_PATTERN.test(content)) continue;

      const lines = content.split(/\\r?\\n/);
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (!MATCH_PATTERN.test(line)) continue;

        findings.push({
          id: generateFindingId(${JSON.stringify(input.ruleId)}, file.path, index + 1),
          ruleId: ${JSON.stringify(input.ruleId)},
          category: ${JSON.stringify(input.category)},
          severity: ${JSON.stringify(input.severity)},
          confidence: 0.7,
          title: ${JSON.stringify(`${input.ruleName} pattern detected`)},
          summary: \`Found ${input.ruleName} marker in \${file.path}:\${index + 1}\`,
          evidence: [createEvidence(file.path, index + 1, index + 1, "text", line.trim())],
        });
      }
    }

    return findings;
  },
};
`;
}

function testTemplate(input: { constName: string; ruleId: string; category: FindingCategory; severity: Severity }): string {
  return `import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { runRuleFixture } from "@quality-harness/code-to-gate/rule-sdk";
import { ${input.constName} } from "./rule.js";

function fixture(name: string): string {
  return readFileSync(new URL(\`./fixtures/\${name}.ts\`, import.meta.url), "utf8");
}

describe(${JSON.stringify(input.ruleId)}, () => {
  it("detects the positive fixture", () => {
    const findings = runRuleFixture(${input.constName}, [
      { path: "src/positive.ts", content: fixture("positive") },
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: ${JSON.stringify(input.ruleId)},
      category: ${JSON.stringify(input.category)},
      severity: ${JSON.stringify(input.severity)},
    });
    expect(findings[0].evidence[0]).toMatchObject({
      path: "src/positive.ts",
      kind: "text",
    });
  });

  it("does not flag the negative fixture", () => {
    const findings = runRuleFixture(${input.constName}, [
      { path: "src/negative.ts", content: fixture("negative") },
    ]);

    expect(findings).toEqual([]);
  });
});
`;
}

function manifestTemplate(input: {
  id: string;
  ruleId: string;
  ruleName: string;
  category: FindingCategory;
  severity: Severity;
  description: string;
}): string {
  return `${JSON.stringify({
    $schema: "./schema/rule.manifest.schema.json",
    apiVersion: "ctg.rule/v1",
    kind: "rule",
    id: input.id,
    ruleId: input.ruleId,
    name: input.ruleName,
    version: "0.1.0",
    description: input.description,
    category: input.category,
    defaultSeverity: input.severity,
    confidence: 0.7,
    entry: "./rule.ts",
    fixtures: {
      positive: "./fixtures/positive.ts",
      negative: "./fixtures/negative.ts",
    },
  }, null, 2)}
`;
}

function schemaTemplate(): string {
  return `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://quality-harness.org/schemas/rule.manifest.schema.json",
  "title": "code-to-gate Rule Manifest",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "$schema",
    "apiVersion",
    "kind",
    "id",
    "ruleId",
    "name",
    "version",
    "category",
    "defaultSeverity",
    "confidence",
    "entry",
    "fixtures"
  ],
  "properties": {
    "$schema": { "type": "string" },
    "apiVersion": { "const": "ctg.rule/v1" },
    "kind": { "const": "rule" },
    "id": { "type": "string", "pattern": "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$" },
    "ruleId": { "type": "string", "pattern": "^[A-Z][A-Z0-9_]*$" },
    "name": { "type": "string", "minLength": 1 },
    "version": { "type": "string", "pattern": "^\\\\d+\\\\.\\\\d+\\\\.\\\\d+(?:-[a-zA-Z0-9.-]+)?$" },
    "description": { "type": "string" },
    "category": {
      "type": "string",
      "enum": ${JSON.stringify(CATEGORIES)}
    },
    "defaultSeverity": {
      "type": "string",
      "enum": ${JSON.stringify(SEVERITIES)}
    },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "entry": { "type": "string" },
    "fixtures": {
      "type": "object",
      "additionalProperties": false,
      "required": ["positive", "negative"],
      "properties": {
        "positive": { "type": "string" },
        "negative": { "type": "string" }
      }
    }
  }
}
`;
}

function readmeTemplate(input: { id: string; ruleId: string; ruleName: string; description: string }): string {
  return `# ${input.ruleName}

Rule ID: \`${input.ruleId}\`

${input.description}

## Files

| Path | Purpose |
|---|---|
| \`rule.ts\` | Rule implementation |
| \`rule.test.ts\` | Fixture-based Vitest harness |
| \`fixtures/positive.ts\` | Positive detection fixture |
| \`fixtures/negative.ts\` | Negative fixture |
| \`rule.manifest.json\` | Rule metadata |
| \`schema/rule.manifest.schema.json\` | Local manifest schema |

## Test

\`\`\`bash
npx vitest run .ctg/rules/${input.id}/rule.test.ts
\`\`\`

Replace the \`CTG_RULE_MATCH\` marker logic with the production detector before publishing.
`;
}

export function createRuleScaffold(options: RuleScaffoldOptions): RuleScaffoldResult {
  assertRuleId(options.id);
  const category = parseCategory(options.category);
  const severity = parseSeverity(options.severity);
  const cwd = options.cwd ?? process.cwd();
  const targetDir = resolve(cwd, options.outRoot, options.id);
  const ruleId = toRuleId(options.id);
  const ruleName = toRuleName(options.id);
  const constName = toConstName(ruleId);
  const description = options.description ?? `Detects ${ruleName} patterns.`;

  ensureWritableTarget(targetDir, options.force ?? false);
  mkdirSync(targetDir, { recursive: true });

  const files = [
    writeTemplate(targetDir, "rule.ts", ruleTemplate({ constName, ruleId, ruleName, category, severity, description })),
    writeTemplate(targetDir, "index.ts", `export { ${constName} } from "./rule.js";\n`),
    writeTemplate(targetDir, "rule.test.ts", testTemplate({ constName, ruleId, category, severity })),
    writeTemplate(targetDir, "fixtures/positive.ts", "export const value = 'CTG_RULE_MATCH: replace with a real positive fixture';\n"),
    writeTemplate(targetDir, "fixtures/negative.ts", "export const value = 'ordinary code path';\n"),
    writeTemplate(targetDir, "rule.manifest.json", manifestTemplate({ id: options.id, ruleId, ruleName, category, severity, description })),
    writeTemplate(targetDir, "schema/rule.manifest.schema.json", schemaTemplate()),
    writeTemplate(targetDir, "README.md", readmeTemplate({ id: options.id, ruleId, ruleName, description })),
  ];

  return {
    ruleId,
    ruleName,
    outputDir: targetDir,
    files,
  };
}
