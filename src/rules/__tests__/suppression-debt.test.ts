/**
 * Tests for SUPPRESSION_DEBT rule
 */

import { describe, expect, it, vi } from "vitest";
import { SUPPRESSION_DEBT_RULE } from "../suppression-debt.js";
import type { RuleContext, RepoFile } from "../index.js";

function createMockFile(path: string, content: string): RepoFile {
  return {
    id: `file:${path}`,
    path,
    language: "unknown",
    role: "config",
    hash: "abc123",
    sizeBytes: content.length,
    lineCount: content.split("\n").length,
    parser: { status: "skipped", adapter: "ctg-text-v0" },
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

describe("SUPPRESSION_DEBT_RULE", () => {
  it("detects broad long-lived suppressions", () => {
    vi.setSystemTime(new Date("2026-05-02T00:00:00Z"));
    const content = [
      "version: ctg/v1alpha1",
      "suppressions:",
      "  -",
      "    rule_id: LARGE_MODULE",
      "    path: src/*",
      "    reason: Architecture decision",
      "    expiry: 2027-04-30",
    ].join("\n");

    const findings = SUPPRESSION_DEBT_RULE.evaluate(createContext(".ctg/suppressions.yaml", content));

    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("SUPPRESSION_DEBT");
    expect(findings[0].severity).toBe("high");
    expect(findings[0].summary).toContain("broad path pattern");
    vi.useRealTimers();
  });

  it("detects missing expiry", () => {
    const content = [
      "suppressions:",
      "  -",
      "    rule_id: TRY_CATCH_SWALLOW",
      "    path: src/cache/cache-manager.ts",
      "    reason: cache cleanup fallback",
    ].join("\n");

    const findings = SUPPRESSION_DEBT_RULE.evaluate(createContext(".ctg/suppressions.yaml", content));

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("medium");
    expect(findings[0].summary).toContain("missing expiry");
  });

  it("ignores narrow suppressions with expiry and specific reason", () => {
    vi.setSystemTime(new Date("2026-05-02T00:00:00Z"));
    const content = [
      "suppressions:",
      "  -",
      "    rule_id: RAW_SQL",
      "    path: src/plugin/sample-plugin.ts",
      "    reason: sample plugin intentionally contains SQL examples for parser contract coverage",
      "    expiry: 2026-06-01",
    ].join("\n");

    const findings = SUPPRESSION_DEBT_RULE.evaluate(createContext(".ctg/suppressions.yaml", content));

    expect(findings).toHaveLength(0);
    vi.useRealTimers();
  });

  it("ignores non-suppression config files", () => {
    const content = "name: example";
    const findings = SUPPRESSION_DEBT_RULE.evaluate(createContext("ctg.config.yaml", content));

    expect(findings).toHaveLength(0);
  });
});
