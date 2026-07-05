import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  NormalizedRepoGraph,
  OwnershipCodeownersDiagnostic,
  OwnershipFileRisk,
  OwnershipModuleRisk,
  OwnershipRiskArtifact,
  OwnershipRiskLevel,
  RepoFile,
  RepoModule,
} from "../types/artifacts.js";

interface DiffChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
}

interface DiffAnalysisInput {
  changed_files?: DiffChangedFile[];
  blast_radius?: {
    affectedFiles?: string[];
  };
}

interface CodeownersRule {
  pattern: string;
  owners: string[];
  line: number;
}

interface CodeownersParseResult {
  present: boolean;
  path?: string;
  rules: CodeownersRule[];
  diagnostics: OwnershipCodeownersDiagnostic[];
}

export interface OwnershipRiskOptions {
  version: string;
  fromDir?: string;
  out?: string;
  now?: Date;
}

export interface OwnershipRiskResult {
  artifact: OwnershipRiskArtifact;
  outputPath: string;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function artifactPath(fromDir: string, fileName: string): string {
  return path.resolve(process.cwd(), fromDir, fileName);
}

function loadRepoGraph(fromDir: string): NormalizedRepoGraph {
  const graphPath = artifactPath(fromDir, "repo-graph.json");
  if (!existsSync(graphPath)) {
    throw new Error(`repo-graph.json not found in artifact directory: ${fromDir}`);
  }
  return readJson<NormalizedRepoGraph>(graphPath);
}

function loadDiffAnalysis(fromDir: string): DiffAnalysisInput | null {
  const diffPath = artifactPath(fromDir, "diff-analysis.json");
  if (!existsSync(diffPath)) {
    return null;
  }
  return readJson<DiffAnalysisInput>(diffPath);
}

function outputPath(fromDir: string, out: string | undefined): string {
  if (!out) {
    return artifactPath(fromDir, "ownership-risk.json");
  }
  const absolute = path.resolve(process.cwd(), out);
  return out.endsWith(".json") ? absolute : path.join(absolute, "ownership-risk.json");
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

function resolveRepoRoot(graph: NormalizedRepoGraph): string {
  return path.resolve(process.cwd(), graph.repo.root);
}

function findCodeownersPath(repoRoot: string): string | undefined {
  const candidates = [
    path.join(repoRoot, ".github", "CODEOWNERS"),
    path.join(repoRoot, "CODEOWNERS"),
    path.join(repoRoot, "docs", "CODEOWNERS"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function parseCodeowners(repoRoot: string): CodeownersParseResult {
  const codeownersPath = findCodeownersPath(repoRoot);
  if (!codeownersPath) {
    return {
      present: false,
      rules: [],
      diagnostics: [{
        severity: "warning",
        code: "CODEOWNERS_NOT_FOUND",
        message: "No CODEOWNERS file was found in .github/, repository root, or docs/.",
      }],
    };
  }

  const diagnostics: OwnershipCodeownersDiagnostic[] = [];
  const rules: CodeownersRule[] = [];
  const lines = readFileSync(codeownersPath, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const [pattern, ...owners] = trimmed.split(/\s+/);
    if (!pattern) {
      continue;
    }
    if (pattern.startsWith("!")) {
      diagnostics.push({
        severity: "warning",
        code: "CODEOWNERS_UNSUPPORTED_PATTERN",
        message: "Negated CODEOWNERS patterns are not supported by code-to-gate ownership risk.",
        path: toPosix(path.relative(repoRoot, codeownersPath)),
        line: lineNumber,
      });
      continue;
    }
    if (owners.length === 0) {
      diagnostics.push({
        severity: "warning",
        code: "CODEOWNERS_EMPTY_OWNERS",
        message: "CODEOWNERS entry has no owners and was ignored.",
        path: toPosix(path.relative(repoRoot, codeownersPath)),
        line: lineNumber,
      });
      continue;
    }

    rules.push({ pattern, owners, line: lineNumber });
  }

  return {
    present: true,
    path: toPosix(path.relative(repoRoot, codeownersPath)),
    rules,
    diagnostics,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

function globToRegexSource(glob: string): string {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      source += "[^/]*";
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += escapeRegex(char);
  }
  return source;
}

function matchesCodeownersPattern(pattern: string, filePath: string): boolean {
  const normalizedPath = toPosix(filePath);
  const rawPattern = toPosix(pattern);
  const anchored = rawPattern.startsWith("/");
  const withoutLeadingSlash = anchored ? rawPattern.slice(1) : rawPattern;
  const directoryPattern = withoutLeadingSlash.endsWith("/");
  const normalizedPattern = directoryPattern ? withoutLeadingSlash.slice(0, -1) : withoutLeadingSlash;

  if (!normalizedPattern) {
    return false;
  }

  if (directoryPattern) {
    return anchored
      ? normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern}/`)
      : normalizedPath.split("/").some((_, index, parts) => parts.slice(index).join("/").startsWith(`${normalizedPattern}/`));
  }

  if (!normalizedPattern.includes("/")) {
    return new RegExp(`^${globToRegexSource(normalizedPattern)}$`).test(path.posix.basename(normalizedPath));
  }

  const regex = new RegExp(
    anchored
      ? `^${globToRegexSource(normalizedPattern)}$`
      : `(^|.*/)${globToRegexSource(normalizedPattern)}$`
  );
  return regex.test(normalizedPath);
}

function ownersForPath(filePath: string, rules: CodeownersRule[]): { owners: string[]; matchedPattern?: string } {
  for (let index = rules.length - 1; index >= 0; index -= 1) {
    const rule = rules[index];
    if (matchesCodeownersPattern(rule.pattern, filePath)) {
      return { owners: rule.owners, matchedPattern: rule.pattern };
    }
  }
  return { owners: [] };
}

function isReviewRelevant(file: RepoFile): boolean {
  return ["source", "config", "docs", "test", "fixture", "unknown"].includes(file.role);
}

function riskForFile(file: RepoFile, owners: string[], changed: boolean): { risk: OwnershipRiskLevel; reasons: string[] } {
  const reasons: string[] = [];
  if (owners.length === 0) {
    reasons.push("No CODEOWNERS match was found for this file.");
  }
  if (changed) {
    reasons.push("File is in the changed/blast-radius set.");
  }
  if (file.role === "source" || file.role === "config") {
    reasons.push(`${file.role} file can affect runtime or release behavior.`);
  }

  if (changed && owners.length === 0 && (file.role === "source" || file.role === "config")) {
    return { risk: "high", reasons };
  }
  if (changed || owners.length === 0) {
    return { risk: "medium", reasons };
  }
  return { risk: "low", reasons: reasons.length > 0 ? reasons : ["File has an owner mapping."] };
}

function moduleForFile(modules: RepoModule[], file: RepoFile): RepoModule | undefined {
  if (file.moduleId) {
    return modules.find((module) => module.id === file.moduleId);
  }
  return modules
    .filter((module) => module.path === "." || file.path === module.path || file.path.startsWith(`${module.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

function buildFileRisks(
  graph: NormalizedRepoGraph,
  codeowners: CodeownersParseResult,
  focusPaths: Set<string>,
  changedPaths: Set<string>
): OwnershipFileRisk[] {
  return graph.files
    .filter(isReviewRelevant)
    .filter((file) => focusPaths.size === 0 || focusPaths.has(file.path))
    .map((file) => {
      const resolved = ownersForPath(file.path, codeowners.rules);
      const changed = changedPaths.has(file.path);
      const risk = riskForFile(file, resolved.owners, changed);
      return {
        path: file.path,
        moduleId: file.moduleId,
        role: file.role,
        owners: unique(resolved.owners),
        matchedPattern: resolved.matchedPattern,
        changed,
        risk: risk.risk,
        reasons: risk.reasons,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function buildModuleRisks(graph: NormalizedRepoGraph, files: OwnershipFileRisk[]): OwnershipModuleRisk[] {
  const graphModules: RepoModule[] = graph.modules.length > 0
    ? graph.modules
    : [{ id: "module:.", path: ".", dependencies: [] }];
  return graphModules.map((module) => {
    const moduleFiles = files.filter((file) => {
      const sourceFile = graph.files.find((item) => item.path === file.path);
      const ownerModule = sourceFile ? moduleForFile(graphModules, sourceFile) : undefined;
      return ownerModule?.id === module.id;
    });
    const owners = unique(moduleFiles.flatMap((file) => file.owners));
    const changedFiles = moduleFiles.filter((file) => file.changed).length;
    const unownedFiles = moduleFiles.filter((file) => file.owners.length === 0).length;
    const reasons: string[] = [];
    if (owners.length === 0) {
      reasons.push("Module has no owner coverage in the analyzed file set.");
    }
    if (changedFiles > 0) {
      reasons.push("Module contains changed or blast-radius files.");
    }
    if (unownedFiles > 0) {
      reasons.push(`${unownedFiles} analyzed files have no CODEOWNERS match.`);
    }

    const risk: OwnershipRiskLevel =
      changedFiles > 0 && (owners.length === 0 || unownedFiles > 0)
        ? "high"
        : owners.length === 0 || unownedFiles > 0
          ? "medium"
          : "low";

    return {
      id: module.id,
      path: module.path,
      name: module.name,
      owners,
      files: moduleFiles.length,
      changedFiles,
      unownedFiles,
      risk,
      reasons: reasons.length > 0 ? reasons : ["Module has owner coverage for analyzed files."],
    };
  }).sort((a, b) => a.path.localeCompare(b.path));
}

function focusFromDiff(diff: DiffAnalysisInput | null): { focusPaths: Set<string>; changedPaths: Set<string> } {
  const changedPaths = new Set((diff?.changed_files ?? []).map((file) => file.path));
  const focusPaths = new Set([
    ...changedPaths,
    ...(diff?.blast_radius?.affectedFiles ?? []),
  ]);
  return { focusPaths, changedPaths };
}

function statusFor(summary: OwnershipRiskArtifact["summary"]): OwnershipRiskArtifact["status"] {
  if (summary.ownedFiles === 0) {
    return "unowned";
  }
  if (summary.unownedFiles > 0 || summary.modulesWithoutOwner > 0) {
    return "partial";
  }
  return "covered";
}

export function createOwnershipRisk(options: OwnershipRiskOptions): OwnershipRiskResult {
  const fromDir = options.fromDir ?? ".qh";
  const graph = loadRepoGraph(fromDir);
  const diff = loadDiffAnalysis(fromDir);
  const generatedAt = (options.now ?? new Date()).toISOString();
  const output = outputPath(fromDir, options.out);
  const codeowners = parseCodeowners(resolveRepoRoot(graph));
  const { focusPaths, changedPaths } = focusFromDiff(diff);
  const files = buildFileRisks(graph, codeowners, focusPaths, changedPaths);
  const modules = buildModuleRisks(graph, files);
  const reviewerCandidates = unique(files.filter((file) => file.changed).flatMap((file) => file.owners));
  const summary = {
    files: files.length,
    ownedFiles: files.filter((file) => file.owners.length > 0).length,
    unownedFiles: files.filter((file) => file.owners.length === 0).length,
    modules: modules.length,
    modulesWithoutOwner: modules.filter((module) => module.owners.length === 0).length,
    changedFiles: files.filter((file) => file.changed).length,
    highRiskModules: modules.filter((module) => module.risk === "high").length,
    reviewerCandidates: reviewerCandidates.length,
  };

  return {
    outputPath: output,
    artifact: {
      version: "ctg/v1",
      generated_at: generatedAt,
      run_id: `ownership-risk-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
      repo: graph.repo,
      tool: { name: "code-to-gate", version: options.version, plugin_versions: [] },
      artifact: "ownership-risk",
      schema: "ownership-risk@v1",
      completeness: codeowners.present ? "complete" : "partial",
      status: statusFor(summary),
      codeowners: {
        present: codeowners.present,
        path: codeowners.path,
        entries: codeowners.rules.length,
        diagnostics: codeowners.diagnostics,
      },
      files,
      modules,
      reviewerCandidates,
      summary,
    },
  };
}

export function writeOwnershipRisk(result: OwnershipRiskResult): void {
  mkdirSync(path.dirname(result.outputPath), { recursive: true });
  writeFileSync(result.outputPath, JSON.stringify(result.artifact, null, 2) + "\n", "utf8");
}
