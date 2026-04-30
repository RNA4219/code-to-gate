/**
 * Import command - External tool result import
 *
 * Imports findings from external tools like ESLint, Semgrep, TSC, Coverage
 * and normalizes them to code-to-gate findings format.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { sha256 } from "../core/path-utils.js";
import { ensureDir } from "../core/file-utils.js";
import { EXIT, getOption, VERSION } from "./exit-codes.js";

import {
  FindingsArtifact,
  Finding,
  EvidenceRef,
  Severity,
  FindingCategory,
  UpstreamTool,
  UnsupportedClaim,
  CTG_VERSION_V1ALPHA1,
} from "../types/artifacts.js";

const CTG_VERSION = CTG_VERSION_V1ALPHA1;
import {
  createArtifactHeader,
} from "../reporters/json-reporter.js";

interface ImportOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

// Type definitions for imported tool outputs

interface ESLintResult {
  filePath: string;
  messages: Array<{
    ruleId: string;
    severity: number; // 1 = warn, 2 = error
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
  category?: number; // 0 = warning, 1 = error
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
function generateImportId(tool: string, ruleId: string, path: string, line: number): string {
  const hash = sha256(`${tool}:${ruleId}:${path}:${line}`).slice(0, 12);
  return `import-${tool}-${hash}`;
}

/**
 * Generate evidence ID for imported finding
 */
function generateImportEvidenceId(findingId: string, index: number): string {
  return `evidence-${findingId}-${index.toString().padStart(2, "0")}`;
}

/**
 * Map ESLint severity to code-to-gate severity
 */
function mapESLintSeverity(severity: number): Severity {
  return severity === 2 ? "high" : severity === 1 ? "medium" : "low";
}

/**
 * Map Semgrep severity to code-to-gate severity
 */
function mapSemgrepSeverity(severity: string | undefined): Severity {
  if (!severity) return "medium";
  const normalized = severity.toLowerCase();
  if (normalized === "error" || normalized === "critical") return "critical";
  if (normalized === "warning" || normalized === "high") return "high";
  return "medium";
}

/**
 * Map TSC category to code-to-gate severity
 */
function mapTSCSeverity(category: number | undefined): Severity {
  return category === 1 ? "high" : "medium";
}

/**
 * Infer category from rule ID
 */
function inferCategoryFromRule(ruleId: string, tool: string): FindingCategory {
  // ESLint rules
  if (ruleId.includes("security") || ruleId.includes("no-eval") || ruleId.includes("no-implied-eval")) {
    return "security" as FindingCategory;
  }
  if (ruleId.includes("auth") || ruleId.includes("password") || ruleId.includes("secret")) {
    return "auth";
  }
  if (ruleId.includes("unused") || ruleId.includes("no-var") || ruleId.includes("prefer-")) {
    return "maintainability";
  }

  // Semgrep rules
  if (ruleId.includes("security") || ruleId.includes("injection") || ruleId.includes("xss")) {
    return "security" as FindingCategory;
  }
  if (ruleId.includes("auth") || ruleId.includes("password") || ruleId.includes("jwt")) {
    return "auth";
  }
  if (ruleId.includes("sql") || ruleId.includes("data")) {
    return "data";
  }

  // TSC rules
  if (ruleId.includes("type") || String(ruleId).startsWith("TS")) {
    return "maintainability";
  }

  return "maintainability";
}

/**
 * Import ESLint results
 */
function importESLint(inputFile: string): Finding[] {
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
        confidence: 0.9, // ESLint findings are deterministic
        title: msg.ruleId,
        summary: msg.message,
        evidence: [
          {
            id: generateImportEvidenceId(findingId, 0),
            path: result.filePath,
            startLine: msg.line,
            endLine: msg.endLine ?? msg.line,
            kind: "external",
            externalRef: {
              tool: "eslint",
              ruleId: msg.ruleId,
            },
          },
        ],
        upstream: {
          tool: "eslint",
          ruleId: msg.ruleId,
        },
      });
    }
  }

  return findings;
}

/**
 * Import Semgrep results
 */
function importSemgrep(inputFile: string): Finding[] {
  const content = readFileSync(inputFile, "utf8");
  const result: SemgrepResult = JSON.parse(content);

  const findings: Finding[] = [];

  for (const finding of result.results) {
    const findingId = generateImportId(
      "semgrep",
      finding.check_id,
      finding.path,
      finding.start.line
    );
    const category = inferCategoryFromRule(finding.check_id, "semgrep");

    findings.push({
      id: findingId,
      ruleId: `SEMGREP_${finding.check_id.toUpperCase().replace(/-/g, "_")}`,
      category,
      severity: mapSemgrepSeverity(finding.extra.severity),
      confidence: 0.85, // Semgrep has pattern-based detection
      title: finding.check_id,
      summary: finding.extra.message,
      evidence: [
        {
          id: generateImportEvidenceId(findingId, 0),
          path: finding.path,
          startLine: finding.start.line,
          endLine: finding.end.line,
          kind: "external",
          externalRef: {
            tool: "semgrep",
            ruleId: finding.check_id,
          },
        },
      ],
      upstream: {
        tool: "semgrep",
        ruleId: finding.check_id,
      },
      tags: finding.extra.metadata?.owasp
        ? [`owasp-${finding.extra.metadata.owasp}`]
        : undefined,
    });
  }

  return findings;
}

/**
 * Import TypeScript compiler results
 */
function importTSC(inputFile: string): Finding[] {
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
      confidence: 0.95, // TSC diagnostics are deterministic
      title: `TypeScript Error TS${diag.code}`,
      summary: diag.message,
      evidence: [
        {
          id: generateImportEvidenceId(findingId, 0),
          path: diag.file,
          startLine: line,
          endLine: diag.end?.line ?? line,
          kind: "external",
          externalRef: {
            tool: "tsc",
            ruleId: `TS${diag.code}`,
          },
        },
      ],
      upstream: {
        tool: "tsc",
        ruleId: `TS${diag.code}`,
      },
    });
  }

  return findings;
}

/**
 * Import coverage results
 */
function importCoverage(inputFile: string): Finding[] {
  const content = readFileSync(inputFile, "utf8");
  const result: CoverageResult = JSON.parse(content);

  const findings: Finding[] = [];

  for (const [filePath, coverage] of Object.entries(result.coverageMap)) {
    const lineCoverage = coverage.lines.covered / coverage.lines.total;
    const functionCoverage = coverage.functions.covered / coverage.functions.total;

    // Create findings for low coverage files
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
        evidence: [
          {
            id: generateImportEvidenceId(findingId, 0),
            path: filePath,
            kind: "coverage",
            externalRef: {
              tool: "coverage",
            },
          },
        ],
        upstream: {
          tool: "coverage",
        },
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
        evidence: [
          {
            id: generateImportEvidenceId(findingId, 0),
            path: filePath,
            kind: "coverage",
            externalRef: {
              tool: "coverage",
            },
          },
        ],
        upstream: {
          tool: "coverage",
        },
      });
    }
  }

  return findings;
}

/**
 * Import test results (generic format)
 */
function importTest(inputFile: string): Finding[] {
  const content = readFileSync(inputFile, "utf8");
  const results = JSON.parse(content);

  const findings: Finding[] = [];

  // Handle common test result formats
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
          evidence: [
            {
              id: generateImportEvidenceId(findingId, 0),
              path: filePath,
              startLine: line,
              kind: "test",
              externalRef: {
                tool: "test",
              },
            },
          ],
          upstream: {
            tool: "test",
          },
        });
      }
    }
  }

  return findings;
}

export async function importCommand(args: string[], options: ImportOptions): Promise<number> {
  const toolArg = args[0];
  const inputArg = args[1];
  const outDir = options.getOption(args, "--out") ?? ".qh";

  const supportedTools: UpstreamTool[] = ["eslint", "semgrep", "tsc", "coverage", "test"];

  if (!toolArg || !inputArg) {
    console.error("usage: code-to-gate import <tool> <input-file> --out <dir>");
    console.error(`supported tools: ${supportedTools.join(", ")}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!supportedTools.includes(toolArg as UpstreamTool)) {
    console.error(`unsupported tool: ${toolArg}`);
    console.error(`supported tools: ${supportedTools.join(", ")}`);
    return options.EXIT.USAGE_ERROR;
  }

  const cwd = process.cwd();
  const inputFile = path.resolve(cwd, inputArg);

  if (!existsSync(inputFile)) {
    console.error(`input file not found: ${inputArg}`);
    return options.EXIT.USAGE_ERROR;
  }

  if (!statSync(inputFile).isFile()) {
    console.error(`input is not a file: ${inputArg}`);
    return options.EXIT.USAGE_ERROR;
  }

  const absoluteOutDir = path.resolve(cwd, outDir);
  const importsDir = path.join(absoluteOutDir, "imports");

  try {
    // Parse input file based on tool type
    let findings: Finding[];

    switch (toolArg) {
      case "eslint":
        findings = importESLint(inputFile);
        break;
      case "semgrep":
        findings = importSemgrep(inputFile);
        break;
      case "tsc":
        findings = importTSC(inputFile);
        break;
      case "coverage":
        findings = importCoverage(inputFile);
        break;
      case "test":
        findings = importTest(inputFile);
        break;
      default:
        console.error(`unsupported tool: ${toolArg}`);
        return options.EXIT.USAGE_ERROR;
    }

    ensureDir(importsDir);

    // Build findings artifact
    const now = new Date().toISOString();
    const runId = `import-${toolArg}-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}`;

    const artifact: FindingsArtifact = {
      version: CTG_VERSION,
      generated_at: now,
      run_id: runId,
      repo: { root: "." },
      tool: {
        name: "code-to-gate",
        version: VERSION,
        plugin_versions: [],
      },
      artifact: "findings",
      schema: "findings@v1",
      completeness: findings.length > 0 ? "complete" : "partial",
      findings,
      unsupported_claims: [],
    };

    // Write output
    const outputPath = path.join(importsDir, `${toolArg}-findings.json`);
    writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");

    // Output summary
    console.log(
      JSON.stringify({
        tool: "code-to-gate",
        command: "import",
        source: toolArg,
        input: inputArg,
        output: path.relative(cwd, outputPath),
        summary: {
          findings: findings.length,
          critical: findings.filter((f) => f.severity === "critical").length,
          high: findings.filter((f) => f.severity === "high").length,
          medium: findings.filter((f) => f.severity === "medium").length,
          low: findings.filter((f) => f.severity === "low").length,
        },
      })
    );

    return options.EXIT.OK;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.IMPORT_FAILED;
  }
}