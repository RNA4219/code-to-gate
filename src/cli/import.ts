/**
 * Import command - External tool result import
 *
 * Validates provenance and normalizes external reports into findings@v1 plus
 * an import-manifest@v1 commit marker.
 */

import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { ensureDir } from "../core/file-utils.js";
import { EXIT, getOption } from "./exit-codes.js";
import {
  CTG_VERSION,
  type FindingsArtifact,
  type Finding,
  type ImportDiagnostic,
  type ImportManifestArtifact,
} from "../types/artifacts.js";
import {
  importCoverage,
  importESLint,
  importNpmAudit,
  importSARIF,
  importSemgrep,
  importTest,
  importTSC,
} from "./import-parsers.js";
import {
  atomicWriteArtifacts,
  DEFAULT_MAX_INPUT_BYTES,
  inspectImportInput,
  MAX_IMPORT_DIAGNOSTICS,
  MAX_IMPORT_INPUT_BYTES,
  normalizeImportFindings,
  portableSourcePath,
  readImportInput,
  repositoryRevision,
  sha256Text,
  type ImportTool,
} from "./import-provenance.js";
import { validateArtifactObject } from "./schema-validate.js";

interface ImportOptions {
  VERSION: string;
  EXIT: typeof EXIT;
  getOption: typeof getOption;
}

const SUPPORTED_TOOLS: ImportTool[] = [
  "eslint",
  "semgrep",
  "sarif",
  "codeql",
  "npm-audit",
  "tsc",
  "coverage",
  "test",
];

function parseMaxInputBytes(raw: string | undefined): number | undefined {
  if (raw === undefined) return DEFAULT_MAX_INPUT_BYTES;
  const megabytes = Number(raw);
  if (!Number.isFinite(megabytes) || megabytes <= 0) return undefined;
  const bytes = Math.floor(megabytes * 1024 * 1024);
  return bytes <= MAX_IMPORT_INPUT_BYTES ? bytes : undefined;
}

function reportFormat(tool: ImportTool): string {
  if (tool === "sarif" || tool === "codeql") return "sarif";
  if (tool === "npm-audit") return "npm-audit-json";
  return tool + "-json";
}

function parserFindings(tool: ImportTool, inputFile: string, data: unknown, repoRoot: string): Finding[] {
  switch (tool) {
    case "eslint":
      return importESLint(inputFile, data);
    case "semgrep":
      return importSemgrep(inputFile, data);
    case "sarif":
      return importSARIF(inputFile, "sarif", data);
    case "codeql":
      return importSARIF(inputFile, "codeql", data);
    case "npm-audit": {
      const evidencePath = existsSync(path.join(repoRoot, "package-lock.json"))
        ? "package-lock.json"
        : "package.json";
      return importNpmAudit(inputFile, evidencePath, data);
    }
    case "tsc":
      return importTSC(inputFile, data);
    case "coverage":
      return importCoverage(inputFile, data);
    case "test":
      return importTest(inputFile, data);
  }
}

function validationMessage(name: string, errors: string[] | undefined): string {
  return "schema validation failed for " + name + ": " + (errors ?? ["unknown validation error"]).join("; ");
}

export async function importCommand(args: string[], options: ImportOptions): Promise<number> {
  const toolArg = args[0];
  const inputArg = args[1];
  const outDir = options.getOption(args, "--out") ?? ".qh";
  const repoArg = options.getOption(args, "--repo-root") ?? ".";
  const producerVersionOverride = options.getOption(args, "--producer-version");
  const maxInputBytes = parseMaxInputBytes(options.getOption(args, "--max-input-mb"));

  if (!toolArg || !inputArg) {
    console.error("usage: code-to-gate import <tool> <input-file> [--out <dir>] [--repo-root <dir>] [--max-input-mb <number>] [--producer-version <version>]");
    console.error("supported tools: " + SUPPORTED_TOOLS.join(", "));
    return options.EXIT.USAGE_ERROR;
  }

  if (!SUPPORTED_TOOLS.includes(toolArg as ImportTool)) {
    console.error("unsupported tool: " + toolArg);
    console.error("supported tools: " + SUPPORTED_TOOLS.join(", "));
    return options.EXIT.USAGE_ERROR;
  }

  if (maxInputBytes === undefined) {
    console.error("--max-input-mb must be greater than 0 and no more than 1024");
    return options.EXIT.USAGE_ERROR;
  }

  if (producerVersionOverride !== undefined && (producerVersionOverride.length === 0 || producerVersionOverride.length > 128)) {
    console.error("--producer-version must contain 1 to 128 characters");
    return options.EXIT.USAGE_ERROR;
  }

  const tool = toolArg as ImportTool;
  const cwd = process.cwd();
  const repoRoot = path.resolve(cwd, repoArg);
  const inputFile = path.resolve(cwd, inputArg);

  if (!existsSync(repoRoot) || !statSync(repoRoot).isDirectory()) {
    console.error("repository root is not a directory: " + repoArg);
    return options.EXIT.USAGE_ERROR;
  }

  if (!existsSync(inputFile)) {
    console.error("input file not found: " + inputArg);
    return options.EXIT.USAGE_ERROR;
  }

  if (!statSync(inputFile).isFile()) {
    console.error("input is not a file: " + inputArg);
    return options.EXIT.USAGE_ERROR;
  }

  const absoluteOutDir = path.resolve(cwd, outDir);
  const importsDir = path.join(absoluteOutDir, "imports");
  const findingsPath = path.join(importsDir, tool + "-findings.json");
  const manifestPath = path.join(importsDir, tool + "-import-manifest.json");

  try {
    const input = readImportInput(inputFile, maxInputBytes);
    const inspection = inspectImportInput(tool, input.data);
    const parsed = parserFindings(tool, inputFile, input.data, repoRoot);
    const normalized = normalizeImportFindings(parsed, repoRoot);
    const revision = repositoryRevision(repoRoot);

    const diagnostics: ImportDiagnostic[] = [
      ...inspection.diagnostics,
      ...normalized.diagnostics,
    ];
    if (!revision) {
      diagnostics.push({
        code: "REPOSITORY_REVISION_UNAVAILABLE",
        message: "repository HEAD is not an exact 40 character lowercase commit SHA",
      });
    }

    const dropped = inspection.dropped + normalized.dropped;
    const completeness = dropped > 0 || inspection.errors > 0 || !revision
      ? "partial"
      : "complete";
    const now = new Date().toISOString();
    const runId = "import-" + tool + "-" + now.replace(/[-:.TZ]/g, "").slice(0, 17);
    const repo = {
      root: ".",
      ...(revision ? { revision } : {}),
    };
    const toolRef = {
      name: "code-to-gate" as const,
      version: options.VERSION,
      plugin_versions: [],
    };

    const findingsArtifact: FindingsArtifact = {
      version: CTG_VERSION,
      generated_at: now,
      run_id: runId,
      repo,
      tool: toolRef,
      artifact: "findings",
      schema: "findings@v1",
      completeness,
      findings: normalized.findings,
      unsupported_claims: completeness === "partial"
        ? [{
          id: "import-partial",
          claim: "The external report was imported without loss and is bound to an exact repository revision.",
          reason: "missing_evidence",
          sourceSection: "import-manifest",
        }]
        : [],
    };
    const findingsText = JSON.stringify(findingsArtifact, null, 2) + "\n";
    const sourcePath = portableSourcePath(inputFile, repoRoot, input.sha256);

    const manifestArtifact: ImportManifestArtifact = {
      version: CTG_VERSION,
      generated_at: now,
      run_id: runId,
      repo,
      tool: toolRef,
      artifact: "import-manifest",
      schema: "import-manifest@v1",
      completeness,
      source: {
        tool,
        format: reportFormat(tool),
        path: sourcePath.path,
        path_kind: sourcePath.kind,
        sha256: input.sha256,
        size_bytes: input.sizeBytes,
        producer: {
          name: inspection.producerName,
          version: producerVersionOverride ?? inspection.producerVersion,
        },
        ...(inspection.formatVersion ? { format_version: inspection.formatVersion } : {}),
        ...(revision ? { repository_revision: revision } : {}),
      },
      normalized: {
        path: path.relative(absoluteOutDir, findingsPath).replace(/\\/g, "/"),
        sha256: sha256Text(findingsText),
        size_bytes: Buffer.byteLength(findingsText, "utf8"),
        schema: "findings@v1",
      },
      summary: {
        seen: inspection.seen,
        accepted: normalized.findings.length,
        dropped,
        errors: inspection.errors,
      },
      diagnostics: diagnostics.slice(0, MAX_IMPORT_DIAGNOSTICS),
      generated_by: "ctg-import/v1",
    };

    const findingsValidation = await validateArtifactObject(findingsArtifact, path.basename(findingsPath));
    if (findingsValidation.status !== "ok") {
      console.error(validationMessage(findingsValidation.artifact, findingsValidation.errors));
      return options.EXIT.SCHEMA_FAILED;
    }

    const manifestValidation = await validateArtifactObject(manifestArtifact, path.basename(manifestPath));
    if (manifestValidation.status !== "ok") {
      console.error(validationMessage(manifestValidation.artifact, manifestValidation.errors));
      return options.EXIT.SCHEMA_FAILED;
    }

    ensureDir(importsDir);
    atomicWriteArtifacts([
      { filePath: findingsPath, content: findingsText },
      { filePath: manifestPath, content: JSON.stringify(manifestArtifact, null, 2) + "\n" },
    ]);

    console.log(JSON.stringify({
      tool: "code-to-gate",
      command: "import",
      source: tool,
      input: sourcePath.path,
      output: path.relative(cwd, findingsPath),
      manifest: path.relative(cwd, manifestPath),
      completeness,
      summary: {
        findings: normalized.findings.length,
        dropped,
        errors: inspection.errors,
        critical: normalized.findings.filter((finding) => finding.severity === "critical").length,
        high: normalized.findings.filter((finding) => finding.severity === "high").length,
        medium: normalized.findings.filter((finding) => finding.severity === "medium").length,
        low: normalized.findings.filter((finding) => finding.severity === "low").length,
      },
    }));

    return completeness === "partial" ? options.EXIT.PARTIAL_SUCCESS : options.EXIT.OK;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return options.EXIT.IMPORT_FAILED;
  }
}
