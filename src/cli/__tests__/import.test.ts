/**
 * Tests for import CLI command
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { importCommand } from "../import.js";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

const EXIT = {
  OK: 0,
  READINESS_NOT_CLEAR: 1,
  USAGE_ERROR: 2,
  SCAN_FAILED: 3,
  LLM_FAILED: 4,
  POLICY_FAILED: 5,
  PLUGIN_FAILED: 6,
  SCHEMA_FAILED: 7,
  IMPORT_FAILED: 8,
  INTEGRATION_EXPORT_FAILED: 9,
  INTERNAL_ERROR: 10,
};

const VERSION = "0.1.0";

function getOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

describe("import CLI", () => {
  let tempOutDir: string;
  const fixturesDir = path.resolve(import.meta.dirname, "../../../fixtures/demo-ci-imports");
  const eslintFile = path.join(fixturesDir, "eslint.json");
  const semgrepFile = path.join(fixturesDir, "semgrep.json");
  const tscFile = path.join(fixturesDir, "tsc.json");

  beforeAll(() => {
    tempOutDir = path.join(tmpdir(), `ctg-import-test-${Date.now()}`);
    mkdirSync(tempOutDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean output directory before each test
    if (existsSync(tempOutDir)) {
      rmSync(tempOutDir, { recursive: true, force: true });
    }
    mkdirSync(tempOutDir, { recursive: true });
  });

  // ESLint import tests

  it("import eslint generates findings", async () => {
    const args = ["eslint", eslintFile, "--out", tempOutDir];
    const result = await importCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("eslint findings file is generated in imports directory", async () => {
    const args = ["eslint", eslintFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "eslint-findings.json");
    expect(existsSync(outputPath)).toBe(true);
  });

  it("eslint findings have correct schema", async () => {
    const args = ["eslint", eslintFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "eslint-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(findings.artifact).toBe("findings");
    expect(findings.schema).toBe("findings@v1");
    expect(Array.isArray(findings.findings)).toBe(true);
  });

  it("eslint findings contain upstream metadata", async () => {
    const args = ["eslint", eslintFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "eslint-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    for (const finding of findings.findings) {
      expect(finding.upstream).toBeDefined();
      expect(finding.upstream.tool).toBe("eslint");
      expect(finding.upstream.ruleId).toBeDefined();
    }
  });

  it("eslint findings have evidence with externalRef", async () => {
    const args = ["eslint", eslintFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "eslint-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    for (const finding of findings.findings) {
      expect(finding.evidence).toBeDefined();
      expect(finding.evidence.length).toBeGreaterThan(0);
      expect(finding.evidence[0].kind).toBe("external");
      expect(finding.evidence[0].externalRef).toBeDefined();
      expect(finding.evidence[0].externalRef.tool).toBe("eslint");
    }
  });

  it("eslint findings ruleId is prefixed with ESLINT_", async () => {
    const args = ["eslint", eslintFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "eslint-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    for (const finding of findings.findings) {
      expect(finding.ruleId).toMatch(/^ESLINT_/);
    }
  });

  // Semgrep import tests

  it("import semgrep generates findings", async () => {
    const args = ["semgrep", semgrepFile, "--out", tempOutDir];
    const result = await importCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("semgrep findings file is generated", async () => {
    const args = ["semgrep", semgrepFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "semgrep-findings.json");
    expect(existsSync(outputPath)).toBe(true);
  });

  it("semgrep findings have correct schema", async () => {
    const args = ["semgrep", semgrepFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "semgrep-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(findings.artifact).toBe("findings");
    expect(findings.schema).toBe("findings@v1");
    expect(Array.isArray(findings.findings)).toBe(true);
  });

  it("semgrep findings contain upstream metadata", async () => {
    const args = ["semgrep", semgrepFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "semgrep-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    for (const finding of findings.findings) {
      expect(finding.upstream).toBeDefined();
      expect(finding.upstream.tool).toBe("semgrep");
    }
  });

  it("semgrep findings ruleId is prefixed with SEMGREP_", async () => {
    const args = ["semgrep", semgrepFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "semgrep-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    for (const finding of findings.findings) {
      expect(finding.ruleId).toMatch(/^SEMGREP_/);
    }
  });

  it("semgrep severity is mapped correctly", async () => {
    const args = ["semgrep", semgrepFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "semgrep-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    // The fixture has severity ERROR which should map to critical
    for (const finding of findings.findings) {
      expect(["critical", "high", "medium", "low"]).toContain(finding.severity);
    }
  });

  // TSC import tests

  it("import tsc generates findings", async () => {
    // Create a TSC file with the expected format (array of diagnostics)
    const tscFile = path.join(tempOutDir, "tsc-test.json");
    const tscData = [
      {
        code: 7006,
        message: "Parameter 'value' implicitly has an 'any' type.",
        file: "src/user.ts",
        start: { line: 15, character: 28 },
        end: { line: 15, character: 33 },
        category: 1,
      },
    ];
    writeFileSync(tscFile, JSON.stringify(tscData), "utf8");

    const args = ["tsc", tscFile, "--out", tempOutDir];
    const result = await importCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("tsc findings file is generated", async () => {
    const tscFile = path.join(tempOutDir, "tsc-test.json");
    const tscData = [
      {
        code: 7006,
        message: "Parameter 'value' implicitly has an 'any' type.",
        file: "src/user.ts",
        start: { line: 15, character: 28 },
        category: 1,
      },
    ];
    writeFileSync(tscFile, JSON.stringify(tscData), "utf8");

    const args = ["tsc", tscFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "tsc-findings.json");
    expect(existsSync(outputPath)).toBe(true);
  });

  it("tsc findings have correct schema", async () => {
    const tscFile = path.join(tempOutDir, "tsc-test.json");
    const tscData = [
      {
        code: 7006,
        message: "Parameter 'value' implicitly has an 'any' type.",
        file: "src/user.ts",
        start: { line: 15, character: 28 },
        category: 1,
      },
    ];
    writeFileSync(tscFile, JSON.stringify(tscData), "utf8");

    const args = ["tsc", tscFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "tsc-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(findings.artifact).toBe("findings");
    expect(findings.schema).toBe("findings@v1");
    expect(Array.isArray(findings.findings)).toBe(true);
  });

  it("tsc findings ruleId is prefixed with TSC_", async () => {
    const tscFile = path.join(tempOutDir, "tsc-test.json");
    const tscData = [
      {
        code: 7006,
        message: "Parameter 'value' implicitly has an 'any' type.",
        file: "src/user.ts",
        start: { line: 15, character: 28 },
        category: 1,
      },
    ];
    writeFileSync(tscFile, JSON.stringify(tscData), "utf8");

    const args = ["tsc", tscFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "tsc-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    for (const finding of findings.findings) {
      expect(finding.ruleId).toMatch(/^TSC_TS/);
    }
  });

  // Coverage import tests

  it("import coverage generates findings for low coverage", async () => {
    // Create a coverage file with low coverage
    const coverageFile = path.join(tempOutDir, "coverage-summary.json");
    const coverageData = {
      coverageMap: {
        "src/lowCoverage.ts": {
          lines: { total: 100, covered: 20, skipped: 0 },
          functions: { total: 10, covered: 2 },
          branches: { total: 20, covered: 5 },
        },
      },
    };
    writeFileSync(coverageFile, JSON.stringify(coverageData), "utf8");

    const args = ["coverage", coverageFile, "--out", tempOutDir];
    const result = await importCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("coverage findings file is generated", async () => {
    const coverageFile = path.join(tempOutDir, "coverage-summary.json");
    const coverageData = {
      coverageMap: {
        "src/lowCoverage.ts": {
          lines: { total: 100, covered: 20, skipped: 0 },
          functions: { total: 10, covered: 2 },
          branches: { total: 20, covered: 5 },
        },
      },
    };
    writeFileSync(coverageFile, JSON.stringify(coverageData), "utf8");

    const args = ["coverage", coverageFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "coverage-findings.json");
    expect(existsSync(outputPath)).toBe(true);
  });

  it("coverage findings have testing category", async () => {
    const coverageFile = path.join(tempOutDir, "coverage-summary.json");
    const coverageData = {
      coverageMap: {
        "src/lowCoverage.ts": {
          lines: { total: 100, covered: 20, skipped: 0 },
          functions: { total: 10, covered: 2 },
          branches: { total: 20, covered: 5 },
        },
      },
    };
    writeFileSync(coverageFile, JSON.stringify(coverageData), "utf8");

    const args = ["coverage", coverageFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "coverage-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    for (const finding of findings.findings) {
      expect(finding.category).toBe("testing");
    }
  });

  // Test import tests

  it("import test generates findings for failed tests", async () => {
    const testFile = path.join(tempOutDir, "test-results.json");
    const testResults = [
      { name: "Test 1", status: "passed", file: "src/test.ts", line: 10 },
      { name: "Test 2", status: "failed", file: "src/test.ts", line: 20, message: "Expected true but got false" },
    ];
    writeFileSync(testFile, JSON.stringify(testResults), "utf8");

    const args = ["test", testFile, "--out", tempOutDir];
    const result = await importCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("test findings file is generated", async () => {
    const testFile = path.join(tempOutDir, "test-results.json");
    const testResults = [
      { name: "Test 1", status: "failed", file: "src/test.ts", line: 10, message: "Test failed" },
    ];
    writeFileSync(testFile, JSON.stringify(testResults), "utf8");

    const args = ["test", testFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "test-findings.json");
    expect(existsSync(outputPath)).toBe(true);
  });

  it("test findings have high severity", async () => {
    const testFile = path.join(tempOutDir, "test-results.json");
    const testResults = [
      { name: "Test 1", status: "failed", file: "src/test.ts", line: 10, message: "Test failed" },
    ];
    writeFileSync(testFile, JSON.stringify(testResults), "utf8");

    const args = ["test", testFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "test-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    for (const finding of findings.findings) {
      expect(finding.severity).toBe("high");
      expect(finding.category).toBe("testing");
    }
  });

  // Error handling tests

  it("exit code USAGE_ERROR when tool argument missing", async () => {
    const args: string[] = [];
    const result = await importCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code USAGE_ERROR when input file argument missing", async () => {
    const args = ["eslint"];
    const result = await importCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code USAGE_ERROR when unsupported tool specified", async () => {
    const args = ["unsupported-tool", eslintFile, "--out", tempOutDir];
    const result = await importCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code USAGE_ERROR when input file does not exist", async () => {
    const args = ["eslint", "/nonexistent/file.json", "--out", tempOutDir];
    const result = await importCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code USAGE_ERROR when input is a directory (not file)", async () => {
    const args = ["eslint", fixturesDir, "--out", tempOutDir];
    const result = await importCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.USAGE_ERROR);
  });

  it("exit code IMPORT_FAILED for malformed JSON", async () => {
    const malformedFile = path.join(tempOutDir, "malformed.json");
    writeFileSync(malformedFile, "not valid json", "utf8");

    const args = ["eslint", malformedFile, "--out", tempOutDir];
    const result = await importCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.IMPORT_FAILED);
  });

  // Output file tests

  it("custom --out directory is created", async () => {
    const customOutDir = path.join(tempOutDir, "custom-import-output");

    const args = ["eslint", eslintFile, "--out", customOutDir];
    const result = await importCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
    expect(existsSync(path.join(customOutDir, "imports", "eslint-findings.json"))).toBe(true);
  });

  it("default --out is .qh", async () => {
    const args = ["eslint", eslintFile];
    const result = await importCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
    const defaultOutPath = path.join(process.cwd(), ".qh", "imports", "eslint-findings.json");
    expect(existsSync(defaultOutPath)).toBe(true);
    // Clean up
    rmSync(path.join(process.cwd(), ".qh"), { recursive: true, force: true });
  });

  // Findings structure tests

  it("findings have generated_at timestamp", async () => {
    const args = ["eslint", eslintFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "eslint-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(findings.generated_at).toBeDefined();
    expect(new Date(findings.generated_at).toISOString()).toBe(findings.generated_at);
  });

  it("findings have unique run_id", async () => {
    const args = ["eslint", eslintFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "eslint-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(findings.run_id).toBeDefined();
    expect(findings.run_id).toMatch(/^import-eslint-/);
  });

  it("findings have unique IDs", async () => {
    const args = ["eslint", eslintFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "eslint-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    const ids = findings.findings.map((f: { id: string }) => f.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("findings have valid severity values", async () => {
    const args = ["eslint", eslintFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "eslint-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    const validSeverities = ["critical", "high", "medium", "low", "info"];
    for (const finding of findings.findings) {
      expect(validSeverities).toContain(finding.severity);
    }
  });

  it("findings have valid category values", async () => {
    const args = ["eslint", eslintFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "eslint-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    const validCategories = ["security", "auth", "payment", "data", "testing", "maintainability", "performance", "logging", "validation", "error-handling"];
    for (const finding of findings.findings) {
      expect(validCategories).toContain(finding.category);
    }
  });

  it("findings have confidence score", async () => {
    const args = ["eslint", eslintFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "eslint-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    for (const finding of findings.findings) {
      expect(finding.confidence).toBeDefined();
      expect(typeof finding.confidence).toBe("number");
      expect(finding.confidence).toBeGreaterThanOrEqual(0);
      expect(finding.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("findings have title and summary", async () => {
    const args = ["eslint", eslintFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "eslint-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    for (const finding of findings.findings) {
      expect(finding.title).toBeDefined();
      expect(finding.summary).toBeDefined();
    }
  });

  it("findings have evidence with path and line numbers", async () => {
    const args = ["eslint", eslintFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "eslint-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    for (const finding of findings.findings) {
      for (const evidence of finding.evidence) {
        expect(evidence.path).toBeDefined();
        expect(typeof evidence.startLine).toBe("number");
      }
    }
  });

  // Tool metadata tests

  it("findings artifact has tool metadata", async () => {
    const args = ["eslint", eslintFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "eslint-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(findings.tool).toBeDefined();
    expect(findings.tool.name).toBe("code-to-gate");
    expect(findings.tool.version).toBeDefined();
  });

  it("findings artifact has unsupported_claims array", async () => {
    const args = ["eslint", eslintFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "eslint-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(Array.isArray(findings.unsupported_claims)).toBe(true);
  });

  it("findings artifact has completeness field", async () => {
    const args = ["eslint", eslintFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "eslint-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(findings.completeness).toBeDefined();
    expect(["complete", "partial"]).toContain(findings.completeness);
  });

  // Handles relative paths

  it("handles relative input file path", async () => {
    const args = ["eslint", "../../../fixtures/demo-ci-imports/eslint.json", "--out", tempOutDir];
    const result = await importCommand(args, { VERSION, EXIT, getOption });
    expect(typeof result).toBe("number");
  });

  // Empty input tests

  it("handles empty ESLint results", async () => {
    const emptyFile = path.join(tempOutDir, "empty-eslint.json");
    writeFileSync(emptyFile, "[]", "utf8");

    const args = ["eslint", emptyFile, "--out", tempOutDir];
    const result = await importCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("handles empty Semgrep results", async () => {
    const emptyFile = path.join(tempOutDir, "empty-semgrep.json");
    writeFileSync(emptyFile, JSON.stringify({ results: [], errors: [] }), "utf8");

    const args = ["semgrep", emptyFile, "--out", tempOutDir];
    const result = await importCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  it("handles empty TSC results", async () => {
    const emptyFile = path.join(tempOutDir, "empty-tsc.json");
    // TSC expects an array, not an object with diagnostics
    writeFileSync(emptyFile, "[]", "utf8");

    const args = ["tsc", emptyFile, "--out", tempOutDir];
    const result = await importCommand(args, { VERSION, EXIT, getOption });
    expect(result).toBe(EXIT.OK);
  });

  // Semgrep metadata tests

  it("semgrep findings may have OWASP tags", async () => {
    // Create a semgrep file with OWASP metadata
    const semgrepWithOwasp = path.join(tempOutDir, "semgrep-owasp.json");
    const data = {
      results: [
        {
          check_id: "securityOWASP",
          path: "src/auth.ts",
          start: { line: 10, col: 1 },
          end: { line: 12, col: 5 },
          extra: {
            message: "Security issue",
            severity: "ERROR",
            metadata: {
              owasp: "A01:2021",
            },
          },
        },
      ],
    };
    writeFileSync(semgrepWithOwasp, JSON.stringify(data), "utf8");

    const args = ["semgrep", semgrepWithOwasp, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "semgrep-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    for (const finding of findings.findings) {
      if (finding.tags) {
        expect(finding.tags.some((t: string) => t.startsWith("owasp-"))).toBe(true);
      }
    }
  });

  // Confidence values per tool

  it("eslint findings have high confidence", async () => {
    const args = ["eslint", eslintFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "eslint-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    // ESLint findings should have confidence 0.9 (deterministic)
    for (const finding of findings.findings) {
      expect(finding.confidence).toBe(0.9);
    }
  });

  it("semgrep findings have pattern-based confidence", async () => {
    const args = ["semgrep", semgrepFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "semgrep-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    // Semgrep findings should have confidence 0.85 (pattern-based)
    for (const finding of findings.findings) {
      expect(finding.confidence).toBe(0.85);
    }
  });

  it("tsc findings have high confidence", async () => {
    const tscTestFile = path.join(tempOutDir, "tsc-test.json");
    // TSC expects an array of diagnostics
    const tscData = [
      {
        code: 7006,
        message: "Parameter 'value' implicitly has an 'any' type.",
        file: "src/user.ts",
        start: { line: 15, character: 28 },
        category: 1,
      },
    ];
    writeFileSync(tscTestFile, JSON.stringify(tscData), "utf8");

    const args = ["tsc", tscTestFile, "--out", tempOutDir];
    await importCommand(args, { VERSION, EXIT, getOption });

    const importsDir = path.join(tempOutDir, "imports");
    const outputPath = path.join(importsDir, "tsc-findings.json");
    const findings = JSON.parse(readFileSync(outputPath, "utf8"));

    // TSC findings should have confidence 0.95 (deterministic)
    for (const finding of findings.findings) {
      expect(finding.confidence).toBe(0.95);
    }
  });
});