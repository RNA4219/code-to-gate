/**
 * Import Parsers - External tool result parsers
 *
 * Parses results from ESLint, Semgrep, TSC, Coverage, Test
 * and converts to code-to-gate Finding format.
 */

import { readFileSync } from "node:fs";
import { sha256 } from "../core/path-utils.js";
import type { Finding, Severity, FindingCategory, UpstreamTool } from "../types/artifacts.js";

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

interface SarifRule {
  id?: string;
  name?: string;
  shortDescription?: { text?: string };
  fullDescription?: { text?: string };
  properties?: Record<string, unknown>;
}

interface SarifResult {
  ruleId?: string;
  ruleIndex?: number;
  level?: string;
  message?: { text?: string };
  locations?: Array<{
    physicalLocation?: {
      artifactLocation?: { uri?: string };
      region?: {
        startLine?: number;
        startColumn?: number;
        endLine?: number;
        endColumn?: number;
      };
    };
  }>;
  partialFingerprints?: Record<string, string>;
  fingerprints?: Record<string, string>;
  properties?: Record<string, unknown>;
}

interface SarifRun {
  tool?: {
    driver?: {
      name?: string;
      rules?: SarifRule[];
    };
  };
  results?: SarifResult[];
}

interface SarifLog {
  version?: string;
  runs?: SarifRun[];
}

interface TSCDiagnostic {
  file?: string;
  code: number | string;
  message?: unknown;
  messageText?: unknown;
  start?: { line: number; character: number };
  end?: { line: number; character: number };
  category?: number | string;
}

interface NpmAuditAdvisory {
  title?: string;
  url?: string;
  severity?: string;
  cwe?: string[];
}

interface NpmAuditVulnerability {
  name?: string;
  severity?: string;
  isDirect?: boolean;
  via?: Array<string | NpmAuditAdvisory>;
  range?: string;
  nodes?: string[];
}

interface NpmAuditResult {
  vulnerabilities: Record<string, NpmAuditVulnerability>;
}

interface CoverageResult {
  coverageMap: Record<string, {
    lines: { total: number; covered: number; skipped: number };
    functions: { total: number; covered: number };
    branches: { total: number; covered: number };
  }>;
}

function importedJson<T>(inputFile: string, input?: unknown): T {
  return (input === undefined ? JSON.parse(readFileSync(inputFile, "utf8")) : input) as T;
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
 * Map SARIF/CodeQL level and security metadata to code-to-gate severity
 */
function mapSARIFSeverity(level: string | undefined, rule?: SarifRule, result?: SarifResult): Severity {
  const rawSecuritySeverity = result?.properties?.["security-severity"]
    ?? rule?.properties?.["security-severity"];
  const securitySeverity = typeof rawSecuritySeverity === "number"
    ? rawSecuritySeverity
    : typeof rawSecuritySeverity === "string"
      ? Number.parseFloat(rawSecuritySeverity)
      : undefined;

  if (securitySeverity !== undefined && !Number.isNaN(securitySeverity)) {
    if (securitySeverity >= 9) return "critical";
    if (securitySeverity >= 7) return "high";
    if (securitySeverity >= 4) return "medium";
    return "low";
  }

  const normalized = (level ?? "warning").toLowerCase();
  if (normalized === "error") return "high";
  if (normalized === "warning") return "medium";
  if (normalized === "note" || normalized === "none") return "low";
  return "medium";
}

/**
 * Map TSC category to code-to-gate severity
 */
export function mapTSCSeverity(category: number | string | undefined): Severity {
  return category === 1 || String(category).toLowerCase() === "error" ? "high" : "medium";
}

export function mapNpmAuditSeverity(severity: string | undefined): Severity {
  switch ((severity ?? "").toLowerCase()) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "moderate":
      return "medium";
    default:
      return "low";
  }
}

/**
 * Infer category from rule ID
 */
export function inferCategoryFromRule(ruleId: string, _tool: string): FindingCategory {
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeTags(...tagSets: unknown[]): string[] | undefined {
  const tags = new Set<string>();
  for (const tagSet of tagSets) {
    for (const tag of stringArray(tagSet)) {
      if (tag.length > 0) {
        tags.add(tag);
      }
    }
  }
  return tags.size > 0 ? [...tags].sort() : undefined;
}

function inferCategoryFromSarif(ruleId: string, rule?: SarifRule, result?: SarifResult): FindingCategory {
  const tags = [
    ...stringArray(rule?.properties?.tags),
    ...stringArray(result?.properties?.tags),
  ].map((tag) => tag.toLowerCase());
  const combined = [ruleId.toLowerCase(), ...tags].join(" ");

  if (combined.includes("auth") || combined.includes("jwt") || combined.includes("password")) {
    return "auth";
  }
  if (
    combined.includes("security")
    || combined.includes("cwe")
    || combined.includes("owasp")
    || combined.includes("injection")
    || combined.includes("xss")
  ) {
    return "security";
  }
  return inferCategoryFromRule(ruleId, "sarif");
}

function sanitizeRuleIdForPrefix(ruleId: string): string {
  return ruleId.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "UNKNOWN";
}

/**
 * Import ESLint results
 */
export function importESLint(inputFile: string, input?: unknown): Finding[] {
  const results = importedJson<ESLintResult[]>(inputFile, input);
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
export function importSemgrep(inputFile: string, input?: unknown): Finding[] {
  const result = importedJson<SemgrepResult>(inputFile, input);
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
 * Import SARIF 2.1.0 results. CodeQL is accepted through the same parser by
 * passing sourceTool="codeql".
 */
export function importSARIF(inputFile: string, sourceTool: Extract<UpstreamTool, "sarif" | "codeql"> = "sarif", input?: unknown): Finding[] {
  const log = importedJson<SarifLog>(inputFile, input);
  const findings: Finding[] = [];

  for (const run of log.runs ?? []) {
    const rules = run.tool?.driver?.rules ?? [];
    const toolName = run.tool?.driver?.name ?? sourceTool;

    for (const result of run.results ?? []) {
      const rule = result.ruleIndex !== undefined ? rules[result.ruleIndex] : undefined;
      const ruleId = result.ruleId ?? rule?.id ?? "unknown-rule";
      const location = result.locations?.[0]?.physicalLocation;
      const filePath = location?.artifactLocation?.uri;
      const line = location?.region?.startLine;
      if (!filePath || !Number.isInteger(line) || (line as number) < 1) {
        continue;
      }
      const trustedLine = line as number;
      const endLine = Number.isInteger(location?.region?.endLine) && (location?.region?.endLine as number) >= trustedLine
        ? location?.region?.endLine as number
        : trustedLine;
      const findingId = generateImportId(sourceTool, ruleId, filePath, trustedLine);
      const category = inferCategoryFromSarif(ruleId, rule, result);
      const tags = normalizeTags(rule?.properties?.tags, result.properties?.tags);
      const rawFingerprint = result.partialFingerprints?.primaryLocationLineHash
        ?? result.fingerprints?.["primaryLocationLineHash"];

      findings.push({
        id: findingId,
        ruleId: `${sourceTool.toUpperCase()}_${sanitizeRuleIdForPrefix(ruleId)}`,
        category,
        severity: mapSARIFSeverity(result.level, rule, result),
        confidence: sourceTool === "codeql" ? 0.9 : 0.85,
        title: rule?.name ?? ruleId,
        summary: result.message?.text
          ?? rule?.shortDescription?.text
          ?? rule?.fullDescription?.text
          ?? `${toolName} result ${ruleId}`,
        evidence: [{
          id: generateImportEvidenceId(findingId, 0),
          path: filePath,
          startLine: trustedLine,
          endLine,
          kind: "external",
          externalRef: { tool: sourceTool, ruleId },
        }],
        upstream: { tool: sourceTool, ruleId },
        tags,
        fingerprint: rawFingerprint ? sha256(rawFingerprint).slice(0, 16) : undefined,
      });
    }
  }

  return findings;
}

/**
 * Import TypeScript compiler results
 */
function tscMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as { messageText?: unknown; next?: unknown[] };
    const head = tscMessage(record.messageText);
    const tail = Array.isArray(record.next) ? record.next.map(tscMessage).filter(Boolean) : [];
    return [head, ...tail].filter(Boolean).join(" ");
  }
  return "TypeScript compiler diagnostic";
}

export function importTSC(inputFile: string, input?: unknown): Finding[] {
  const parsed = importedJson<TSCDiagnostic[] | { diagnostics?: TSCDiagnostic[] }>(inputFile, input);
  const diagnostics = Array.isArray(parsed) ? parsed : parsed.diagnostics;
  if (!Array.isArray(diagnostics)) {
    throw new Error("TSC input must be an array or contain diagnostics");
  }
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
      summary: tscMessage(diag.message ?? diag.messageText),
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
 * Import npm audit v7+ JSON results.
 */
export function importNpmAudit(inputFile: string, evidencePath = "package-lock.json", input?: unknown): Finding[] {
  const result = importedJson<NpmAuditResult>(inputFile, input);
  if (!result.vulnerabilities || typeof result.vulnerabilities !== "object") {
    throw new Error("npm audit input must contain vulnerabilities");
  }

  const findings: Finding[] = [];
  for (const [packageName, vulnerability] of Object.entries(result.vulnerabilities)) {
    const advisories = Array.isArray(vulnerability.via)
      ? vulnerability.via.filter((item): item is NpmAuditAdvisory => typeof item === "object" && item !== null)
      : [];
    const severity = vulnerability.severity
      ?? advisories.map((item) => item.severity).find((value): value is string => typeof value === "string");
    const findingId = generateImportId("npm-audit", packageName, evidencePath, 1);
    const advisoryTitles = advisories
      .map((item) => item.title)
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    const tags = new Set<string>([
      vulnerability.isDirect ? "direct-dependency" : "transitive-dependency",
      ...advisories.flatMap((item) => item.cwe ?? []),
    ]);

    findings.push({
      id: findingId,
      ruleId: `NPM_AUDIT_${sanitizeRuleIdForPrefix(packageName)}`,
      category: "security",
      severity: mapNpmAuditSeverity(severity),
      confidence: 0.95,
      title: `Vulnerable dependency: ${vulnerability.name ?? packageName}`,
      summary: advisoryTitles.length > 0
        ? advisoryTitles.join("; ")
        : `npm audit reported ${severity ?? "unknown"} severity for ${packageName}${vulnerability.range ? ` (${vulnerability.range})` : ""}`,
      evidence: [{
        id: generateImportEvidenceId(findingId, 0),
        path: evidencePath,
        kind: "external",
        externalRef: {
          tool: "npm-audit",
          ruleId: packageName,
          ...(advisories[0]?.url ? { url: advisories[0].url } : {}),
        },
      }],
      upstream: { tool: "npm-audit", ruleId: packageName },
      tags: [...tags].sort(),
    });
  }

  return findings;
}

/**
 * Import coverage results
 */
export function importCoverage(inputFile: string, input?: unknown): Finding[] {
  const result = importedJson<CoverageResult>(inputFile, input);
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
export function importTest(inputFile: string, input?: unknown): Finding[] {
  const results = importedJson<unknown>(inputFile, input);
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
