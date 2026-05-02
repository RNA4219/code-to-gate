/**
 * Tests for DEBT_MARKER rule
 */

import { describe, expect, it } from "vitest";
import { DEBT_MARKER_RULE } from "../debt-marker.js";
import type { RuleContext, RepoFile } from "../index.js";

function createMockFile(
  path: string,
  content: string,
  language: "ts" | "js" | "py" = "ts",
  role: RepoFile["role"] = "source"
): RepoFile {
  return {
    id: `file:${path}`,
    path,
    language,
    role,
    hash: "abc123",
    sizeBytes: content.length,
    lineCount: content.split("\n").length,
    parser: { status: "parsed", adapter: "test" },
  };
}

function createContext(files: RepoFile[], contents: Map<string, string>): RuleContext {
  return {
    graph: {
      files,
      run_id: "test-run",
      generated_at: new Date().toISOString(),
      repo: { root: "/repo" },
      stats: { partial: false },
    },
    getFileContent(path: string): string | null {
      return contents.get(path) ?? null;
    },
  };
}

describe("DEBT_MARKER_RULE", () => {
  it("detects explicit debt markers in source comments", () => {
    const content = [
      "export function processOrder() {",
      "  // TODO: refactor this after checkout migration",
      "  return true;",
      "}",
    ].join("\n");
    const files = [createMockFile("src/order.ts", content)];
    const findings = DEBT_MARKER_RULE.evaluate(createContext(files, new Map([["src/order.ts", content]])));

    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("DEBT_MARKER");
    expect(findings[0].severity).toBe("medium");
    expect(findings[0].evidence[0]?.startLine).toBe(2);
  });

  it("ignores marker-looking text inside string literals", () => {
    const content = [
      "export const help = 'TODO: this is user-facing sample text';",
      "export function ok() { return help; }",
    ].join("\n");
    const files = [createMockFile("src/help.ts", content)];
    const findings = DEBT_MARKER_RULE.evaluate(createContext(files, new Map([["src/help.ts", content]])));

    expect(findings).toHaveLength(0);
  });

  it("detects Python hash comments", () => {
    const content = [
      "def calculate():",
      "    # FIXME: replace legacy rounding",
      "    return 1",
    ].join("\n");
    const files = [createMockFile("src/billing.py", content, "py")];
    const findings = DEBT_MARKER_RULE.evaluate(createContext(files, new Map([["src/billing.py", content]])));

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("medium");
    expect(findings[0].evidence[0]?.startLine).toBe(2);
  });

  it("skips tests and fixtures", () => {
    const content = "// TODO: allowed in test sample";
    const files = [
      createMockFile("src/order.test.ts", content, "ts", "test"),
      createMockFile("fixtures/demo.ts", content, "ts", "fixture"),
    ];
    const findings = DEBT_MARKER_RULE.evaluate(createContext(files, new Map([
      ["src/order.test.ts", content],
      ["fixtures/demo.ts", content],
    ])));

    expect(findings).toHaveLength(0);
  });
});
