/**
 * Tests for HARDCODED_SECRET rule
 */

import { describe, expect, it } from "vitest";
import { HARDCODED_SECRET_RULE } from "../hardcoded-secret.js";
import type { RepoFile, RuleContext } from "../index.js";

function createMockFile(path: string, content: string): RepoFile {
  return {
    id: `file:${path}`,
    path,
    language: "ts",
    role: "source",
    hash: "abc123",
    sizeBytes: content.length,
    lineCount: content.split("\n").length,
    parser: { status: "parsed", adapter: "test" },
  };
}

function createContext(path: string, content: string): RuleContext {
  return {
    graph: {
      files: [createMockFile(path, content)],
      run_id: "test-run",
      generated_at: new Date().toISOString(),
      repo: { root: "/repo" },
      stats: { partial: false },
    },
    getFileContent(filePath: string): string | null {
      return filePath === path ? content : null;
    },
  };
}

describe("HARDCODED_SECRET_RULE", () => {
  it("detects hardcoded secret variable assignments", () => {
    const content = `const api_key = "sk_live_1234567890abcdef";`;
    const findings = HARDCODED_SECRET_RULE.evaluate(createContext("src/config.ts", content));

    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("HARDCODED_SECRET");
  });

  it("ignores JSON schema property definitions", () => {
    const content = [
      "export const pluginSchema = {",
      "  secrets: {",
      "    type: 'array',",
      "  },",
      "};",
    ].join("\n");
    const findings = HARDCODED_SECRET_RULE.evaluate(createContext("src/plugin/plugin-schemas.ts", content));

    expect(findings).toHaveLength(0);
  });

  it("ignores descriptive metadata fields that mention secret handling", () => {
    const content = [
      "export const pack = {",
      '  description: "Baseline security policy for secrets, auth guards, input validation, redirects, rate limits, and SQL usage.",',
      "};",
    ].join("\n");
    const findings = HARDCODED_SECRET_RULE.evaluate(createContext("src/quality-packs/quality-packs.ts", content));

    expect(findings).toHaveLength(0);
  });

  it("ignores unrelated assignments on lines that only mention sensitive selectors or fixture IDs", () => {
    const content = [
      'await page.addStyleTag({ content: \'input[type="password"], input[name*="token"] { color: transparent }\' });',
      'const run = configure({ actionCatalog: [{ id: "secret-candidate-value", inputProfileId: "protected-profile" }] });',
    ].join("\n");
    const findings = HARDCODED_SECRET_RULE.evaluate(createContext("src/runtime.ts", content));

    expect(findings).toHaveLength(0);
  });

  it("ignores the rule implementation itself", () => {
    const content = [
      'const SECRET_VAR_NAMES = ["password", "api_key"];',
      'const pattern = /BEGIN PRIVATE KEY/g;',
      'const example = "AKIA1234567890ABCDEF";',
    ].join("\n");
    const findings = HARDCODED_SECRET_RULE.evaluate(createContext("src/rules/hardcoded-secret.ts", content));

    expect(findings).toHaveLength(0);
  });
});
