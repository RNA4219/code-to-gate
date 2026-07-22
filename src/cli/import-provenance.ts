import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Finding, ImportDiagnostic, UpstreamTool } from "../types/artifacts.js";

export type ImportTool = Exclude<UpstreamTool, "native" | "sonarqube">;

export const DEFAULT_MAX_INPUT_BYTES = 50 * 1024 * 1024;
export const MAX_IMPORT_INPUT_BYTES = 1024 * 1024 * 1024;
export const MAX_IMPORTED_FINDINGS = 100_000;
export const MAX_IMPORT_DIAGNOSTICS = 100;

export class ImportInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportInputError";
  }
}

export interface ImportInput {
  bytes: Buffer;
  data: unknown;
  sha256: `sha256:${string}`;
  sizeBytes: number;
}

export interface ImportInspection {
  seen: number;
  dropped: number;
  errors: number;
  diagnostics: ImportDiagnostic[];
  producerName: string;
  producerVersion: string;
  formatVersion?: string;
}

export interface NormalizedImport {
  findings: Finding[];
  dropped: number;
  diagnostics: ImportDiagnostic[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function diagnostic(code: string, message: string, recordIndex?: number): ImportDiagnostic {
  return {
    code: code.slice(0, 64),
    message: message.slice(0, 4096),
    ...(recordIndex === undefined ? {} : { record_index: recordIndex }),
  };
}

function boundedDiagnostics(values: ImportDiagnostic[]): ImportDiagnostic[] {
  return values.slice(0, MAX_IMPORT_DIAGNOSTICS);
}

function countEslintMessages(value: unknown): number {
  return records(value).reduce((total, result) => total + (Array.isArray(result.messages) ? result.messages.length : 0), 0);
}

function inspectSarif(tool: ImportTool, value: Record<string, unknown>): ImportInspection {
  if (value.version !== "2.1.0" || !Array.isArray(value.runs)) {
    throw new ImportInputError("SARIF input must be a SARIF 2.1.0 log with runs");
  }
  const diagnostics: ImportDiagnostic[] = [];
  let seen = 0;
  let dropped = 0;
  const producerNames = new Set<string>();
  const producerVersions = new Set<string>();

  for (const run of records(value.runs)) {
    const toolValue = isRecord(run.tool) ? run.tool : undefined;
    const driver = toolValue && isRecord(toolValue.driver) ? toolValue.driver : undefined;
    const producerName = stringValue(driver?.name);
    const producerVersion = stringValue(driver?.semanticVersion) ?? stringValue(driver?.version);
    if (producerName) producerNames.add(producerName);
    if (producerVersion) producerVersions.add(producerVersion);

    for (const invocation of records(run.invocations)) {
      if (invocation.executionSuccessful === false) {
        diagnostics.push(diagnostic("SARIF_INVOCATION_FAILED", "SARIF producer reported an unsuccessful invocation"));
      }
    }

    const results = records(run.results);
    seen += results.length;
    results.forEach((result, index) => {
      const locations = records(result.locations);
      const physical = locations[0] && isRecord(locations[0].physicalLocation) ? locations[0].physicalLocation as Record<string, unknown> : undefined;
      const artifactLocation = physical && isRecord(physical.artifactLocation) ? physical.artifactLocation : undefined;
      const region = physical && isRecord(physical.region) ? physical.region : undefined;
      if (!stringValue(artifactLocation?.uri) || !Number.isInteger(region?.startLine) || (region?.startLine as number) < 1) {
        dropped += 1;
        diagnostics.push(diagnostic("SARIF_LOCATION_MISSING", "SARIF result has no trustworthy repository path and start line", index));
      }
    });
  }

  if (tool === "codeql" && (producerNames.size === 0 || ![...producerNames].some((name) => /codeql/i.test(name)))) {
    throw new ImportInputError("CodeQL import requires SARIF whose driver identifies CodeQL");
  }

  return {
    seen,
    dropped,
    errors: diagnostics.filter((item) => item.code === "SARIF_INVOCATION_FAILED").length,
    diagnostics: boundedDiagnostics(diagnostics),
    producerName: [...producerNames].sort().join(",") || tool,
    producerVersion: [...producerVersions].sort().join(",") || "unknown",
    formatVersion: "2.1.0",
  };
}

export function inspectImportInput(tool: ImportTool, value: unknown): ImportInspection {
  if (tool === "eslint") {
    if (!Array.isArray(value)) throw new ImportInputError("ESLint input must be an array");
    return { seen: countEslintMessages(value), dropped: 0, errors: 0, diagnostics: [], producerName: "eslint", producerVersion: "unknown" };
  }

  if (tool === "semgrep") {
    if (!isRecord(value) || !Array.isArray(value.results)) {
      throw new ImportInputError("Semgrep input must contain a results array");
    }
    const scannerErrors = records(value.errors);
    const diagnostics = scannerErrors.map((entry, index) =>
      diagnostic("SEMGREP_ERROR", stringValue(entry.message) ?? "Semgrep reported an error", index));
    return {
      seen: value.results.length,
      dropped: 0,
      errors: scannerErrors.length,
      diagnostics: boundedDiagnostics(diagnostics),
      producerName: "semgrep",
      producerVersion: stringValue(value.version) ?? "unknown",
    };
  }

  if (tool === "sarif" || tool === "codeql") {
    if (!isRecord(value)) throw new ImportInputError("SARIF input must be an object");
    return inspectSarif(tool, value);
  }

  if (tool === "tsc") {
    const values = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.diagnostics) ? value.diagnostics : undefined;
    if (!values) throw new ImportInputError("TSC input must be an array or contain diagnostics");
    return { seen: values.length, dropped: 0, errors: 0, diagnostics: [], producerName: "typescript", producerVersion: "unknown" };
  }

  if (tool === "coverage") {
    if (!isRecord(value) || !isRecord(value.coverageMap)) {
      throw new ImportInputError("Coverage input must contain coverageMap");
    }
    return { seen: Object.keys(value.coverageMap).length, dropped: 0, errors: 0, diagnostics: [], producerName: "coverage", producerVersion: "unknown" };
  }

  if (tool === "test") {
    if (!Array.isArray(value)) throw new ImportInputError("Test input must be an array");
    return { seen: value.length, dropped: 0, errors: 0, diagnostics: [], producerName: "test", producerVersion: "unknown" };
  }

  if (tool === "npm-audit") {
    if (!isRecord(value) || !isRecord(value.vulnerabilities)) {
      throw new ImportInputError("npm audit input must contain vulnerabilities");
    }
    const auditError = isRecord(value.error) ? value.error : undefined;
    const diagnostics = auditError
      ? [diagnostic("NPM_AUDIT_ERROR", stringValue(auditError.summary) ?? stringValue(auditError.message) ?? "npm audit reported an error")]
      : [];
    return {
      seen: Object.keys(value.vulnerabilities).length,
      dropped: 0,
      errors: diagnostics.length,
      diagnostics,
      producerName: "npm",
      producerVersion: "unknown",
      formatVersion: String(value.auditReportVersion ?? "unknown"),
    };
  }

  throw new ImportInputError(`unsupported import tool: ${tool}`);
}

export function readImportInput(inputFile: string, maxInputBytes: number): ImportInput {
  const sizeBytes = statSync(inputFile).size;
  if (sizeBytes > maxInputBytes) {
    throw new ImportInputError(`input exceeds configured maximum of ${maxInputBytes} bytes`);
  }
  const bytes = readFileSync(inputFile);
  let data: unknown;
  try {
    data = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new ImportInputError(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    bytes,
    data,
    sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    sizeBytes,
  };
}

function normalizedAbsolutePath(rawPath: string, repoRoot: string): string | undefined {
  const hasControlCharacter = [...rawPath].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (!rawPath || rawPath === "unknown" || hasControlCharacter || /^\\\\|^\/\//.test(rawPath)) return undefined;
  let candidate = rawPath;
  if (/^file:/i.test(candidate)) {
    try {
      candidate = fileURLToPath(candidate);
    } catch {
      return undefined;
    }
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(candidate) && !path.win32.isAbsolute(candidate)) {
    return undefined;
  }
  return path.isAbsolute(candidate) || path.win32.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(repoRoot, candidate);
}

function inside(root: string, target: string): boolean {
  const normalizedRoot = process.platform === "win32" ? root.toLowerCase() : root;
  const normalizedTarget = process.platform === "win32" ? target.toLowerCase() : target;
  const relative = path.relative(normalizedRoot, normalizedTarget);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function nearestExistingAncestor(candidate: string): string | undefined {
  let current = candidate;
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return current;
}

export function normalizeEvidencePath(rawPath: string, repoRoot: string): string | undefined {
  const realRoot = realpathSync(repoRoot);
  const candidate = normalizedAbsolutePath(rawPath, realRoot);
  if (!candidate || !inside(realRoot, candidate)) return undefined;
  const ancestor = nearestExistingAncestor(candidate);
  if (!ancestor || !inside(realRoot, realpathSync(ancestor))) return undefined;
  if (existsSync(candidate) && !inside(realRoot, realpathSync(candidate))) return undefined;
  const relative = path.relative(realRoot, candidate).replace(/\\/g, "/");
  return relative && relative !== ".." && !relative.startsWith("../") ? relative : undefined;
}

export function normalizeImportFindings(findings: Finding[], repoRoot: string): NormalizedImport {
  const accepted: Finding[] = [];
  const diagnostics: ImportDiagnostic[] = [];
  const ids = new Set<string>();
  let dropped = 0;

  for (let index = 0; index < findings.length; index += 1) {
    const finding = findings[index];
    if (ids.has(finding.id)) {
      dropped += 1;
      diagnostics.push(diagnostic("DUPLICATE_FINDING_ID", `duplicate finding id: ${finding.id}`, index));
      continue;
    }
    const normalizedEvidence = finding.evidence.map((evidence) => {
      const normalizedPath = normalizeEvidencePath(evidence.path, repoRoot);
      return normalizedPath ? { ...evidence, path: normalizedPath } : undefined;
    });
    if (normalizedEvidence.some((value) => value === undefined)) {
      dropped += 1;
      diagnostics.push(diagnostic("EVIDENCE_PATH_REJECTED", "finding evidence is outside the repository or is not safely resolvable", index));
      continue;
    }
    if (accepted.length >= MAX_IMPORTED_FINDINGS) {
      dropped += 1;
      diagnostics.push(diagnostic("FINDING_LIMIT_EXCEEDED", `import accepts at most ${MAX_IMPORTED_FINDINGS} findings`, index));
      continue;
    }
    ids.add(finding.id);
    accepted.push({ ...finding, evidence: normalizedEvidence as Finding["evidence"] });
  }

  return { findings: accepted, dropped, diagnostics: boundedDiagnostics(diagnostics) };
}

export function repositoryRevision(repoRoot: string): string | undefined {
  try {
    const revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim().toLowerCase();
    return /^[0-9a-f]{40}$/.test(revision) ? revision : undefined;
  } catch {
    return undefined;
  }
}

export function portableSourcePath(inputFile: string, repoRoot: string, digest: string): { path: string; kind: "repo_relative" | "external_redacted" } {
  const resolvedRepo = realpathSync(repoRoot);
  const requestedInput = path.resolve(inputFile);
  const resolvedInput = realpathSync(inputFile);
  if (inside(resolvedRepo, resolvedInput)) {
    return { path: path.relative(resolvedRepo, resolvedInput).replace(/\\/g, "/"), kind: "repo_relative" };
  }
  const base = path.basename(requestedInput).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "report.json";
  return { path: `external/${digest.replace(/^sha256:/, "").slice(0, 16)}-${base}`, kind: "external_redacted" };
}

export function sha256Bytes(value: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function sha256Text(value: string): `sha256:${string}` {
  return sha256Bytes(Buffer.from(value, "utf8"));
}

export function atomicWriteArtifacts(files: Array<{ filePath: string; content: string }>): void {
  const nonce = `${process.pid}-${Date.now()}-${randomUUID()}`;
  const staged = files.map((file, index) => `${file.filePath}.tmp-${nonce}-${index}`);
  const backups: Array<{ destination: string; backup: string }> = [];
  const committed: string[] = [];

  try {
    for (let index = 0; index < files.length; index += 1) {
      writeFileSync(staged[index], files[index].content, { encoding: "utf8", flag: "wx" });
    }

    for (let index = 0; index < files.length; index += 1) {
      const destination = files[index].filePath;
      if (existsSync(destination)) {
        const backup = `${destination}.bak-${nonce}-${index}`;
        renameSync(destination, backup);
        backups.push({ destination, backup });
      }
    }

    // The caller orders the manifest last so it acts as the pair commit marker.
    for (let index = 0; index < files.length; index += 1) {
      renameSync(staged[index], files[index].filePath);
      committed.push(files[index].filePath);
    }
  } catch (error) {
    for (const destination of [...committed].reverse()) {
      if (existsSync(destination)) {
        try { unlinkSync(destination); } catch { /* preserve the original error */ }
      }
    }
    for (const { destination, backup } of [...backups].reverse()) {
      if (existsSync(backup) && !existsSync(destination)) {
        try { renameSync(backup, destination); } catch { /* leave the backup for recovery */ }
      }
    }
    throw error;
  } finally {
    for (const tempPath of staged) {
      if (existsSync(tempPath)) {
        try { unlinkSync(tempPath); } catch { /* best effort cleanup */ }
      }
    }
  }

  for (const { backup } of backups) {
    if (existsSync(backup)) {
      try { unlinkSync(backup); } catch { /* committed outputs remain authoritative */ }
    }
  }
}
