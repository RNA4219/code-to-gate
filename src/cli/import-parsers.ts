/**
 * Import Parsers - External tool result parsers
 *
 * Parses results from ESLint, Semgrep, TSC, Coverage, Test
 * and converts to code-to-gate Finding format.
 */

import { readFileSync } from "node:fs";
import { sha256 } from "../core/path-utils.js";
import type { Finding, Severity, FindingCategory } from "../types/artifacts.js";

// Type definitions for imported tool outputs

interface ESLintResult {
  filePath: string;
  messages: Array<{
    ruleId: string;
    severity: number;
    message: string;
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
  }>;
}

interface SemgrepResult {
  results: Array<{
    check_id: string;
    path: string;
    start: { line: number; col: number };
    end: { line: number; col: number };
    extra: {
      message: string;
      severity?: string;
      metadata?: {
        category?: string;
        owasp?: string;
        cwe?: string;
      };
    };
  }>;
  errors?: Array<{ message: string }>;
}

interface TSCDiagnostic {
  file?: string;
  code: number | string;
  message: string;
  start?: { line: number; character: number };
  end?: { line: number; character: number };
  category?: number;
}

interface CoverageResult {
  coverageMap: Record<string, {
    lines: { total: number; covered: number; skipped: number };
    functions: { total: number; covered: number };
    branches: { total: number; covered: number };
  }>;
}

/**
 * Generate unique ID for imported finding
 */
export function generateImportId(tool: string, ruleId: string, path: string, line: number): string {
  const hash = sha256(`${tool}:${ruleId}:${path}:${line}`).slice(0, 12);
  return `import-${tool}-${hash}`;
}

/**
 * Generate evidence ID for imported finding
 */
export function generateImportEvidenceId(findingId: string, index: number): string {
  return `evidence-${findingId}-${index.toString().padStart(2, "0")}`;
}

/**
 * Map ESLint severity to code-to-gate severity
 */
export function mapESLintSeverity(severity: number): Severity {
  return severity === 2 ? "high" : severity === 1 ? "medium" : "low";
}

/**
 * Map Semgrep severity to code-to-gate severity
 */
export function mapSemgrepSeverity(severity: string | undefined): Severity {
  if (!severity) return "medium";
  const normalized = severity.toLowerCase();
  if (normalized === "error" || normalized === "critical") return "critical";
  if (normalized === "warning" || normalized === "high") return "high";
  return "medium";
}

/**
 * Map TSC category to code-to-gate severity
 */
export function mapTSCSeverity(category: number | undefined): Severity {
  return category === 1 ? "high" : "medium";
}

/**
 * Infer category from rule ID
 */
export function inferCategoryFromRule(ruleId: string, tool: string): FindingCategory {
  if (ruleId.includes("security") || ruleId.includes("no-eval") || ruleId.includes("no-implied-eval")) {
    return "security" as FindingCategory;
  }
  if (ruleId.includes("auth") || ruleId.includes("password") || ruleId.includes("secret")) {
    return "auth";
  }
  if (ruleId.includes("unused") || ruleId.includes("no-var") || ruleId.includes("prefer-")) {
    return "maintainability";
  }
  if (ruleId.includes("injection") || ruleId.includes("xss")) {
    return "security" as FindingCategory;
  }
  if (ruleId.includes("jwt")) {
    return "auth";
  }
  if (ruleId.includes("sql") || ruleId.includes("data")) {
    return "data";
  }
  if (ruleId.includes("type") || String(ruleId).startsWith("TS")) {
    return "maintainability";
  }
  return "maintainability";
}

/**
 * Import ESLint results
 */
export function importESLint(inputFile: string): Finding[] {
  const content = readFileSync(inputFile, "utf8");
  const results: ESLintResult[] = JSON.parse(content);
  const findings: Finding[] = [];

  for (const result of results) {
    for (const msg of result.messages) {
      const findingId = generateImportId("eslint", msg.ruleId, result.filePath, msg.line);
      const category = inferCategoryFromRule(msg.ruleId, "eslint");

      findings.push({
        id: findingId,
        ruleId: `ESLINT_${msg.ruleId.toUpperCase().replace(/-/g, "_")}`,
        category,
        severity: mapESLintSeverity(msg.severity),
        confidence: 0.9,
        title: msg.ruleId,
        summary: msg.message,
        evidence: [{
          id: generateImportEvidenceId(findingId, 0),
          path: result.filePath,
          startLine: msg.line,
          endLine: msg.endLine ?? msg.line,
          kind: "external",
          externalRef: { tool: "eslint", ruleId: msg.ruleId },
        }],
        upstream: { tool: "eslint", ruleId: msg.ruleId },
      });
    }
  }

  return findings;
}

/**
 * Import Semgrep results
 */
export function importSemgrep(inputFile: string): Finding[] {
  const content = readFileSync(inputFile, "utf8");
  const result: SemgrepResult = JSON.parse(content);
  const findings: Finding[] = [];

  for (const finding of result.results) {
    const findingId = generateImportId("semgrep", finding.check_id, finding.path, finding.start.line);
    const category = inferCategoryFromRule(finding.check_id, "semgrep");

    findings.push({
      id: findingId,
      ruleId: `SEMGREP_${finding.check_id.toUpperCase().replace(/-/g, "_")}`,
      category,
      severity: mapSemgrepSeverity(finding.extra.severity),
      confidence: 0.85,
      title: finding.check_id,
      summary: finding.extra.message,
      evidence: [{
        id: generateImportEvidenceId(findingId, 0),
        path: finding.path,
        startLine: finding.start.line,
        endLine: finding.end.line,
        kind: "external",
        externalRef: { tool: "semgrep", ruleId: finding.check_id },
      }],
      upstream: { tool: "semgrep", ruleId: finding.check_id },
      tags: finding.extra.metadata?.owasp ? [`owasp-${finding.extra.metadata.owasp}`] : undefined,
    });
  }

  return findings;
}

/**
 * Import TypeScript compiler results
 */
export function importTSC(inputFile: string): Finding[] {
  const content = readFileSync(inputFile, "utf8");
  const diagnostics: TSCDiagnostic[] = JSON.parse(content);
  const findings: Finding[] = [];

  for (const diag of diagnostics) {
    if (!diag.file) continue;

    const line = diag.start?.line ?? 1;
    const findingId = generateImportId("tsc", String(diag.code), diag.file, line);
    const category = inferCategoryFromRule(String(diag.code), "tsc");

    findings.push({
      id: findingId,
      ruleId: `TSC_TS${diag.code}`,
      category,
      severity: mapTSCSeverity(diag.category),
      confidence: 0.95,
      title: `TypeScript Error TS${diag.code}`,
      summary: diag.message,
      evidence: [{
        id: generateImportEvidenceId(findingId, 0),
        path: diag.file,
        startLine: line,
        endLine: diag.end?.line ?? line,
        kind: "external",
        externalRef: { tool: "tsc", ruleId: `TS${diag.code}` },
      }],
      upstream: { tool: "tsc", ruleId: `TS${diag.code}` },
    });
  }

  return findings;
}

/**
 * Import coverage results
 */
export function importCoverage(inputFile: string): Finding[] {
  const content = readFileSync(inputFile, "utf8");
  const result: CoverageResult = JSON.parse(content);
  const findings: Finding[] = [];

  for (const [filePath, coverage] of Object.entries(result.coverageMap)) {
    const lineCoverage = coverage.lines.covered / coverage.lines.total;
    const functionCoverage = coverage.functions.covered / coverage.functions.total;

    if (lineCoverage < 0.5) {
      const findingId = generateImportId("coverage", "low-coverage", filePath, 1);

      findings.push({
        id: findingId,
        ruleId: "COVERAGE_LOW_LINE_COVERAGE",
        category: "testing",
        severity: lineCoverage < 0.3 ? "high" : "medium",
        confidence: 0.95,
        title: `Low line coverage (${Math.round(lineCoverage * 100)}%)`,
        summary: `File ${filePath} has only ${Math.round(lineCoverage * 100)}% line coverage (${coverage.lines.covered}/${coverage.lines.total} lines)`,
        evidence: [{
          id: generateImportEvidenceId(findingId, 0),
          path: filePath,
          kind: "coverage",
          externalRef: { tool: "coverage" },
        }],
        upstream: { tool: "coverage" },
      });
    }

    if (functionCoverage < 0.5) {
      const findingId = generateImportId("coverage", "low-function-coverage", filePath, 1);

      findings.push({
        id: findingId,
        ruleId: "COVERAGE_LOW_FUNCTION_COVERAGE",
        category: "testing",
        severity: functionCoverage < 0.3 ? "medium" : "low",
        confidence: 0.95,
        title: `Low function coverage (${Math.round(functionCoverage * 100)}%)`,
        summary: `File ${filePath} has only ${Math.round(functionCoverage * 100)}% function coverage (${coverage.functions.covered}/${coverage.functions.total} functions)`,
        evidence: [{
          id: generateImportEvidenceId(findingId, 0),
          path: filePath,
          kind: "coverage",
          externalRef: { tool: "coverage" },
        }],
        upstream: { tool: "coverage" },
      });
    }
  }

  return findings;
}

/**
 * Import test results (generic format)
 */
export function importTest(inputFile: string): Finding[] {
  const content = readFileSync(inputFile, "utf8");
  const results = JSON.parse(content);
  const findings: Finding[] = [];

  if (Array.isArray(results)) {
    for (const test of results) {
      if (test.status === "failed" || test.status === "error") {
        const filePath = test.file || test.path || "unknown";
        const line = test.line || 1;
        const findingId = generateImportId("test", "failed", filePath, line);

        findings.push({
          id: findingId,
          ruleId: "TEST_FAILED",
          category: "testing",
          severity: "high",
          confidence: 1.0,
          title: test.name || "Failed test",
          summary: test.message || test.error || "Test failed",
          evidence: [{
            id: generateImportEvidenceId(findingId, 0),
            path: filePath,
            startLine: line,
            kind: "test",
            externalRef: { tool: "test" },
          }],
          upstream: { tool: "test" },
        });
      }
    }
  }

  return findings;
}