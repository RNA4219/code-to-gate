import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  generateImportEvidenceId,
  generateImportId,
  importCoverage,
  importESLint,
  importSARIF,
  importSemgrep,
  importTSC,
  importTest,
  inferCategoryFromRule,
  mapESLintSeverity,
  mapSemgrepSeverity,
  mapTSCSeverity,
} from "../import-parsers.js";

const TEST_DIR = path.join(process.cwd(), ".test-temp", "import-parsers");

function jsonFile(name: string, value: unknown): string {
  const file = path.join(TEST_DIR, name);
  writeFileSync(file, JSON.stringify(value), "utf8");
  return file;
}

describe("import parsers", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("maps identifiers, severities, and categories", () => {
    expect(generateImportId("tool", "rule", "file.ts", 1)).toMatch(/^import-tool-/);
    expect(generateImportEvidenceId("finding", 2)).toBe("evidence-finding-02");
    expect([0, 1, 2].map(mapESLintSeverity)).toEqual(["low", "medium", "high"]);
    expect([
      mapSemgrepSeverity(undefined),
      mapSemgrepSeverity("ERROR"),
      mapSemgrepSeverity("critical"),
      mapSemgrepSeverity("warning"),
      mapSemgrepSeverity("high"),
      mapSemgrepSeverity("info"),
    ]).toEqual(["medium", "critical", "critical", "high", "high", "medium"]);
    expect([mapTSCSeverity(1), mapTSCSeverity(0), mapTSCSeverity(undefined)])
      .toEqual(["high", "medium", "medium"]);
    expect([
      inferCategoryFromRule("no-eval", "eslint"),
      inferCategoryFromRule("password-secret", "tool"),
      inferCategoryFromRule("no-unused-vars", "eslint"),
      inferCategoryFromRule("xss-injection", "tool"),
      inferCategoryFromRule("jwt-check", "tool"),
      inferCategoryFromRule("raw-sql", "tool"),
      inferCategoryFromRule("TS123", "tsc"),
      inferCategoryFromRule("other", "tool"),
    ]).toEqual([
      "security",
      "auth",
      "maintainability",
      "security",
      "auth",
      "data",
      "maintainability",
      "maintainability",
    ]);
  });

  it("imports ESLint and Semgrep optional metadata branches", () => {
    const eslint = importESLint(jsonFile("eslint.json", [{
      filePath: "src/a.ts",
      messages: [
        {
          ruleId: "no-eval",
          severity: 2,
          message: "unsafe",
          line: 3,
          column: 1,
          endLine: 4,
        },
        {
          ruleId: "no-unused-vars",
          severity: 1,
          message: "unused",
          line: 8,
          column: 1,
        },
      ],
    }]));
    expect(eslint).toHaveLength(2);
    expect(eslint[0].evidence[0].endLine).toBe(4);
    expect(eslint[1].evidence[0].endLine).toBe(8);

    const semgrep = importSemgrep(jsonFile("semgrep.json", {
      results: [
        {
          check_id: "security-xss",
          path: "src/a.ts",
          start: { line: 1, col: 1 },
          end: { line: 2, col: 2 },
          extra: {
            message: "xss",
            severity: "ERROR",
            metadata: { owasp: "A03" },
          },
        },
        {
          check_id: "other",
          path: "src/b.ts",
          start: { line: 1, col: 1 },
          end: { line: 1, col: 2 },
          extra: { message: "other" },
        },
      ],
    }));
    expect(semgrep[0].tags).toEqual(["owasp-A03"]);
    expect(semgrep[1].tags).toBeUndefined();
  });

  it("imports SARIF and CodeQL severity, metadata, fallback, and fingerprint branches", () => {
    const sarifFile = jsonFile("results.sarif", {
      runs: [
        {},
        {
          tool: {
            driver: {
              name: "Code Scanner",
              rules: [
                {
                  id: "auth/rule",
                  name: "Auth rule",
                  properties: {
                    "security-severity": "9.5",
                    tags: ["security", "", 3],
                  },
                },
                {
                  id: "rule-high",
                  shortDescription: { text: "short" },
                  properties: { "security-severity": 7.5 },
                },
                {
                  id: "rule-medium",
                  fullDescription: { text: "full" },
                  properties: { "security-severity": 4 },
                },
                {
                  id: "rule-low",
                  properties: { "security-severity": 1 },
                },
              ],
            },
          },
          results: [
            {
              ruleIndex: 0,
              message: { text: "message" },
              locations: [{ physicalLocation: {
                artifactLocation: { uri: "src/a.ts" },
                region: { startLine: 2, endLine: 3 },
              } }],
              partialFingerprints: { primaryLocationLineHash: "fp-one" },
              properties: { tags: ["jwt"] },
            },
            { ruleIndex: 1, level: "error" },
            { ruleIndex: 2, level: "warning" },
            { ruleIndex: 3, level: "note" },
            {
              ruleId: "xss-rule",
              level: "none",
              fingerprints: { primaryLocationLineHash: "fp-two" },
            },
            { ruleId: "unknown level", level: "other" },
          ],
        },
      ],
    });
    const sarif = importSARIF(sarifFile);
    expect(sarif.map((item) => item.severity)).toEqual([
      "critical", "high", "medium", "low", "low", "medium",
    ]);
    expect(sarif[0].category).toBe("auth");
    expect(sarif[0].tags).toEqual(["jwt", "security"]);
    expect(sarif[0].fingerprint).toHaveLength(16);
    expect(sarif[1].summary).toBe("short");
    expect(sarif[2].summary).toBe("full");
    expect(sarif[3].summary).toContain("result");
    expect(sarif[5].ruleId).toContain("UNKNOWN_LEVEL");

    const codeql = importSARIF(sarifFile, "codeql");
    expect(codeql[0].confidence).toBe(0.9);
    expect(codeql[0].upstream?.tool).toBe("codeql");
  });

  it("imports TSC diagnostics with optional locations", () => {
    const findings = importTSC(jsonFile("tsc.json", [
      { code: 1, message: "global", category: 1 },
      {
        file: "src/a.ts",
        code: 2322,
        message: "type",
        category: 1,
        start: { line: 4, character: 1 },
        end: { line: 5, character: 2 },
      },
      {
        file: "src/b.ts",
        code: "custom",
        message: "type",
      },
    ]));
    expect(findings).toHaveLength(2);
    expect(findings[0].evidence[0].endLine).toBe(5);
    expect(findings[1].evidence[0].startLine).toBe(1);
  });

  it("imports line/function coverage threshold branches", () => {
    const findings = importCoverage(jsonFile("coverage.json", {
      coverageMap: {
        "critical.ts": {
          lines: { total: 10, covered: 2, skipped: 0 },
          functions: { total: 10, covered: 2 },
          branches: { total: 0, covered: 0 },
        },
        "medium.ts": {
          lines: { total: 10, covered: 4, skipped: 0 },
          functions: { total: 10, covered: 4 },
          branches: { total: 0, covered: 0 },
        },
        "good.ts": {
          lines: { total: 10, covered: 9, skipped: 0 },
          functions: { total: 10, covered: 9 },
          branches: { total: 0, covered: 0 },
        },
      },
    }));
    expect(findings).toHaveLength(4);
    expect(findings.map((item) => item.severity)).toEqual([
      "high", "medium", "medium", "low",
    ]);
  });

  it("imports only failed/error tests with fallback fields", () => {
    expect(importTest(jsonFile("not-array.json", {}))).toEqual([]);
    const findings = importTest(jsonFile("tests.json", [
      { status: "passed", name: "ok" },
      {
        status: "failed",
        file: "test/a.test.ts",
        line: 4,
        name: "fails",
        message: "failure",
      },
      {
        status: "error",
        path: "test/b.test.ts",
        error: "error text",
      },
      { status: "failed" },
    ]));
    expect(findings).toHaveLength(3);
    expect(findings[0].summary).toBe("failure");
    expect(findings[1].summary).toBe("error text");
    expect(findings[2].evidence[0].path).toBe("unknown");
    expect(findings[2].title).toBe("Failed test");
  });
});
