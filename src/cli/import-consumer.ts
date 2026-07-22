import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type {
  Completeness,
  Finding,
  FindingsArtifact,
  ImportManifestArtifact,
} from "../types/artifacts.js";
import {
  normalizeEvidencePath,
  repositoryRevision,
  sha256Bytes,
  sha256Text,
  type ImportTool,
} from "./import-provenance.js";
import { validateArtifactObject } from "./schema-validate.js";

const IMPORT_TOOLS: ImportTool[] = [
  "eslint",
  "semgrep",
  "sarif",
  "codeql",
  "npm-audit",
  "tsc",
  "coverage",
  "test",
];

export interface ImportConsumptionResult {
  findings: Finding[];
  completeness: Completeness;
  incompleteReasons: string[];
  loadedTools: ImportTool[];
}

export class ImportConsumptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportConsumptionError";
  }
}

function parseJson(filePath: string, content: string): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new ImportConsumptionError(
      "invalid import artifact JSON at " + filePath + ": " +
      (error instanceof Error ? error.message : String(error))
    );
  }
}

async function validateArtifact(value: unknown, filePath: string): Promise<void> {
  const validation = await validateArtifactObject(value, path.basename(filePath));
  if (validation.status !== "ok") {
    throw new ImportConsumptionError(
      "invalid import artifact schema at " + filePath + ": " +
      (validation.errors ?? ["unknown validation error"]).join("; ")
    );
  }
}

function assertManifestBinding(
  tool: ImportTool,
  manifest: ImportManifestArtifact,
  findings: FindingsArtifact,
  findingsContent: string,
  findingsFile: string,
  repoRoot: string,
  currentRevision: string | undefined
): void {
  const expectedNormalizedPath = "imports/" + findingsFile;
  if (manifest.source.tool !== tool) {
    throw new ImportConsumptionError("import manifest tool mismatch for " + tool);
  }
  if (manifest.normalized.path.replace(/\\/g, "/") !== expectedNormalizedPath) {
    throw new ImportConsumptionError("import manifest normalized path mismatch for " + tool);
  }
  if (manifest.normalized.sha256 !== sha256Text(findingsContent)) {
    throw new ImportConsumptionError("import findings hash mismatch for " + tool);
  }
  if (manifest.normalized.size_bytes !== Buffer.byteLength(findingsContent, "utf8")) {
    throw new ImportConsumptionError("import findings size mismatch for " + tool);
  }
  if (manifest.normalized.schema !== "findings@v1" || findings.schema !== "findings@v1") {
    throw new ImportConsumptionError("import findings schema binding mismatch for " + tool);
  }
  if (manifest.run_id !== findings.run_id || manifest.completeness !== findings.completeness) {
    throw new ImportConsumptionError("import artifact run or completeness mismatch for " + tool);
  }
  if (manifest.summary.accepted !== findings.findings.length) {
    throw new ImportConsumptionError("import accepted finding count mismatch for " + tool);
  }
  if (manifest.completeness === "complete" && (manifest.summary.dropped !== 0 || manifest.summary.errors !== 0)) {
    throw new ImportConsumptionError("complete import manifest records dropped results or scanner errors for " + tool);
  }

  const revision = manifest.source.repository_revision;
  if (
    !revision
    || !/^[0-9a-f]{40}$/.test(revision)
    || manifest.repo.revision !== revision
    || findings.repo.revision !== revision
  ) {
    throw new ImportConsumptionError("import repository revision binding is missing or invalid for " + tool);
  }
  if (!currentRevision || revision !== currentRevision) {
    throw new ImportConsumptionError("import repository revision does not match current HEAD for " + tool);
  }

  if (manifest.source.path_kind === "repo_relative") {
    const safeSourcePath = normalizeEvidencePath(manifest.source.path, repoRoot);
    if (!safeSourcePath || safeSourcePath !== manifest.source.path.replace(/\\/g, "/")) {
      throw new ImportConsumptionError("import source path escapes the repository for " + tool);
    }
    const sourcePath = path.join(repoRoot, ...safeSourcePath.split("/"));
    if (!existsSync(sourcePath)) {
      throw new ImportConsumptionError("import source report is missing for " + tool);
    }
    const sourceBytes = readFileSync(sourcePath);
    if (
      manifest.source.sha256 !== sha256Bytes(sourceBytes)
      || manifest.source.size_bytes !== sourceBytes.byteLength
    ) {
      throw new ImportConsumptionError("import source report hash or size mismatch for " + tool);
    }
  }
}

function assertFindingIdentities(
  tool: ImportTool,
  artifact: FindingsArtifact,
  findingIds: Set<string>
): void {
  for (const finding of artifact.findings) {
    if (finding.upstream?.tool !== tool) {
      throw new ImportConsumptionError("import finding tool identity mismatch for " + tool + ": " + finding.id);
    }
    if (findingIds.has(finding.id)) {
      throw new ImportConsumptionError("duplicate finding id across analysis inputs: " + finding.id);
    }
    findingIds.add(finding.id);
  }
}

export async function consumeImportArtifacts(
  importsDir: string,
  repoRoot: string,
  existingFindingIds: Iterable<string> = []
): Promise<ImportConsumptionResult> {
  if (!existsSync(importsDir)) {
    return { findings: [], completeness: "complete", incompleteReasons: [], loadedTools: [] };
  }

  const findings: Finding[] = [];
  const incompleteReasons: string[] = [];
  const loadedTools: ImportTool[] = [];
  const findingIds = new Set(existingFindingIds);
  const currentRevision = repositoryRevision(repoRoot);

  for (const tool of IMPORT_TOOLS) {
    const findingsFile = tool + "-findings.json";
    const findingsPath = path.join(importsDir, findingsFile);
    if (!existsSync(findingsPath)) continue;

    const findingsContent = readFileSync(findingsPath, "utf8");
    const findingsValue = parseJson(findingsPath, findingsContent);
    await validateArtifact(findingsValue, findingsPath);
    const findingsArtifact = findingsValue as FindingsArtifact;
    assertFindingIdentities(tool, findingsArtifact, findingIds);

    const manifestPath = path.join(importsDir, tool + "-import-manifest.json");
    if (!existsSync(manifestPath)) {
      incompleteReasons.push("LEGACY_IMPORT_MANIFEST_MISSING:" + tool);
    } else {
      const manifestContent = readFileSync(manifestPath, "utf8");
      const manifestValue = parseJson(manifestPath, manifestContent);
      await validateArtifact(manifestValue, manifestPath);
      const manifest = manifestValue as ImportManifestArtifact;
      assertManifestBinding(
        tool,
        manifest,
        findingsArtifact,
        findingsContent,
        findingsFile,
        repoRoot,
        currentRevision
      );
      if (manifest.completeness === "partial") {
        incompleteReasons.push("IMPORT_PARTIAL:" + tool);
        for (const item of manifest.diagnostics) {
          incompleteReasons.push("IMPORT_DIAGNOSTIC:" + tool + ":" + item.code);
        }
      }
    }

    findings.push(...findingsArtifact.findings);
    loadedTools.push(tool);
  }

  return {
    findings,
    completeness: incompleteReasons.length > 0 ? "partial" : "complete",
    incompleteReasons: [...new Set(incompleteReasons)].sort(),
    loadedTools,
  };
}
